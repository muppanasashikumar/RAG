"""RAG retrieval and streaming answer service."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.domain.models import RetrievalMode
from app.infrastructure.embeddings import EmbeddingsClient
from app.infrastructure.llm import LLMClient
from app.infrastructure.reranker import RerankerClient
from app.repositories.documents_repository import DocumentsRepository
from app.repositories.vector_repository import VectorRepository

logger = logging.getLogger(__name__)

_URL_CANDIDATE_KEYS = ("document_url", "documentUrl", "file_url", "fileUrl", "url")
_MAX_QUERY_CHARS = 2_000
_MAX_CONTEXT_CHARS = 12_000
_MAX_HISTORY_CHARS = 4_000
_MAX_HISTORY_MESSAGES = 10
_MAX_CITATION_CONTENT_CHARS = 700
_RETRIEVAL_TIMEOUT_SECONDS = 15
_NEXT_TOKEN_TIMEOUT_SECONDS = 30
_RERANK_CANDIDATES = 12
_FINAL_RETRIEVAL_LIMIT = 5
_RRF_K = 60
_RAG_SYSTEM_PROMPT = (
    "Answer the user using only the provided context. "
    "If the context is insufficient, say so clearly and avoid guessing."
)


class RagStructuredAnswer(BaseModel):
    answer: str = Field(
        description="Final response to the user grounded in provided context."
    )


class RagService:
    def __init__(
        self,
        *,
        embeddings: EmbeddingsClient,
        llm: LLMClient,
        reranker: RerankerClient | None,
        vector_repository: VectorRepository,
        documents_repository: DocumentsRepository,
    ) -> None:
        self._embeddings = embeddings
        self._llm = llm
        self._reranker = reranker
        self._vectors = vector_repository
        self._documents = documents_repository

    async def stream_answer(
        self,
        *,
        query: str,
        file: str | None = None,
        chat_history: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield streaming events describing tokens and final citations."""
        normalized_query = (query or "").strip()
        if not normalized_query:
            yield {"type": "error", "message": "Query cannot be empty."}
            yield {"type": "citations", "citations": [], "retrieval_mode": "none"}
            return
        if len(normalized_query) > _MAX_QUERY_CHARS:
            yield {
                "type": "error",
                "message": f"Query is too long. Maximum supported length is {_MAX_QUERY_CHARS} characters.",
            }
            yield {"type": "citations", "citations": [], "retrieval_mode": "none"}
            return

        try:
            docs, mode = await asyncio.wait_for(
                self._retrieve(query=normalized_query, file=file),
                timeout=_RETRIEVAL_TIMEOUT_SECONDS,
            )

            if file and not docs:
                yield {
                    "type": "token",
                    "content": (
                        f"I couldn't find indexed content for '{file}'. "
                        "Please re-upload the document and wait for indexing to finish."
                    ),
                }
                yield {"type": "citations", "citations": [], "retrieval_mode": mode}
                return

            context = self._build_context(docs)
            citations = self._build_citations(docs)
            messages = self._build_messages(
                query=normalized_query,
                context=context,
                chat_history=chat_history,
            )

            emitted = False
            try:
                structured = await asyncio.to_thread(
                    self._llm.invoke_structured,
                    messages,
                    schema=RagStructuredAnswer,
                )
                answer = structured.answer.strip()
                if answer:
                    emitted = True
                    yield {"type": "token", "content": answer}
            except Exception:
                logger.warning("Structured output failed; falling back to token stream", exc_info=True)

            if not emitted:
                async for token in self._stream_llm_tokens(messages):
                    yield {"type": "token", "content": token}

            yield {"type": "citations", "citations": citations, "retrieval_mode": mode}
        except TimeoutError:
            logger.warning("Timed out while generating answer", extra={"file": file})
            yield {
                "type": "error",
                "message": "Request timed out while generating an answer. Please try again.",
            }
            yield {"type": "citations", "citations": [], "retrieval_mode": "none"}
        except Exception:
            logger.exception("RAG answer generation failed")
            yield {
                "type": "error",
                "message": "Unable to generate answer right now. Please try again shortly.",
            }
            yield {"type": "citations", "citations": [], "retrieval_mode": "none"}

    async def _retrieve(
        self, *, query: str, file: str | None
    ) -> tuple[list[dict[str, Any]], RetrievalMode]:
        embedding = await asyncio.to_thread(self._embeddings.embed, query)
        candidate_limit = _RERANK_CANDIDATES if self._reranker else _FINAL_RETRIEVAL_LIMIT
        vector_task = self._vectors.vector_search(
            embedding, file=file, limit=candidate_limit
        )
        keyword_task = self._vectors.keyword_search(
            query, file=file, limit=candidate_limit
        )
        vector_docs, keyword_docs = await asyncio.gather(vector_task, keyword_task)

        merged = self._fuse_rankings(vector_docs=vector_docs, keyword_docs=keyword_docs)
        if not merged:
            return [], "none"
        merged = await self._rerank_docs(query=query, docs=merged, limit=_FINAL_RETRIEVAL_LIMIT)
        await self._enrich(merged)
        mode: RetrievalMode = "hybrid" if vector_docs and keyword_docs else "vector"
        return merged, mode

    async def _rerank_docs(
        self, *, query: str, docs: list[dict[str, Any]], limit: int
    ) -> list[dict[str, Any]]:
        if not docs:
            return []
        if not self._reranker:
            return docs[:limit]
        texts = [(doc.get("text") or "").strip() for doc in docs]
        scores = await asyncio.to_thread(self._reranker.score, query, texts)
        indexed = list(zip(docs, scores, strict=False))
        indexed.sort(key=lambda item: item[1], reverse=True)
        reranked: list[dict[str, Any]] = []
        for doc, score in indexed[:limit]:
            doc["score"] = score
            reranked.append(doc)
        return reranked

    async def _stream_llm_tokens(self, messages: list[Any]) -> AsyncIterator[str]:
        stream = self._llm.stream_messages(messages)
        while True:
            token = await asyncio.wait_for(
                asyncio.to_thread(next, stream, None),
                timeout=_NEXT_TOKEN_TIMEOUT_SECONDS,
            )
            if token is None:
                break
            yield token

    def _build_messages(
        self,
        *,
        query: str,
        context: str,
        chat_history: list[dict[str, Any]] | None,
    ) -> list[BaseMessage]:
        messages: list[BaseMessage] = [SystemMessage(content=_RAG_SYSTEM_PROMPT)]
        messages.extend(self._history_to_messages(chat_history))
        messages.append(HumanMessage(content=f"Context:\n{context}\n\nQuestion:\n{query}"))
        return messages

    def _history_to_messages(
        self, chat_history: list[dict[str, Any]] | None
    ) -> list[BaseMessage]:
        if not chat_history:
            return []

        selected: list[dict[str, Any]] = []
        consumed_chars = 0
        for item in reversed(chat_history):
            role = item.get("role")
            content = item.get("content")
            if role not in {"user", "assistant"}:
                continue
            if not isinstance(content, str):
                continue
            normalized = content.strip()
            if not normalized:
                continue

            projected = consumed_chars + len(normalized)
            if projected > _MAX_HISTORY_CHARS and selected:
                break

            selected.append({"role": role, "content": normalized})
            consumed_chars = projected
            if len(selected) >= _MAX_HISTORY_MESSAGES:
                break

        history_messages: list[BaseMessage] = []
        for item in reversed(selected):
            if item["role"] == "user":
                history_messages.append(HumanMessage(content=item["content"]))
            else:
                history_messages.append(AIMessage(content=item["content"]))
        return history_messages

    def _build_context(self, docs: list[dict[str, Any]]) -> str:
        parts: list[str] = []
        seen: set[str] = set()
        current_size = 0

        for doc in docs:
            text = (doc.get("text") or "").strip()
            if not text or text in seen:
                continue

            candidate_size = current_size + len(text) + (1 if parts else 0)
            if candidate_size > _MAX_CONTEXT_CHARS:
                remaining = _MAX_CONTEXT_CHARS - current_size
                if remaining <= 0:
                    break
                text = text[:remaining]
                parts.append(text)
                break

            seen.add(text)
            parts.append(text)
            current_size = candidate_size

        return "\n".join(parts)

    @staticmethod
    def _doc_key(doc: dict[str, Any]) -> str:
        file_name = doc.get("file", "")
        page_number = doc.get("page_number", "")
        text = (doc.get("text") or "")[:120]
        return f"{file_name}::{page_number}::{text}"

    def _fuse_rankings(
        self,
        *,
        vector_docs: list[dict[str, Any]],
        keyword_docs: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not vector_docs and not keyword_docs:
            return []
        score_map: dict[str, float] = {}
        doc_map: dict[str, dict[str, Any]] = {}

        for rank, doc in enumerate(vector_docs, start=1):
            key = self._doc_key(doc)
            doc_map[key] = doc
            score_map[key] = score_map.get(key, 0.0) + (1.0 / (_RRF_K + rank))

        for rank, doc in enumerate(keyword_docs, start=1):
            key = self._doc_key(doc)
            if key not in doc_map:
                doc_map[key] = doc
            score_map[key] = score_map.get(key, 0.0) + (1.0 / (_RRF_K + rank))

        ranked_keys = sorted(score_map, key=score_map.get, reverse=True)
        merged = [doc_map[key] for key in ranked_keys]
        for key, doc in zip(ranked_keys, merged, strict=False):
            doc["score"] = score_map[key]
        return merged[:_RERANK_CANDIDATES]

    @staticmethod
    def _tokenize(text: str) -> set[str]:
        return {
            token for token in text.lower().replace("\n", " ").split() if len(token) > 2
        }

    def _rank(
        self, rows: list[dict[str, Any]], *, query_text: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        if not rows:
            return []
        query_tokens = self._tokenize(query_text or "")
        for row in rows:
            text_tokens = self._tokenize(row.get("text", ""))
            row["score"] = len(query_tokens & text_tokens) if query_tokens else 0
        rows.sort(key=lambda row: row.get("score", 0), reverse=True)
        return rows[:limit]

    async def _enrich(self, docs: list[dict[str, Any]]) -> None:
        cache: dict[str, dict[str, Any]] = {}
        for doc in docs:
            file_name = doc.get("file")
            if not file_name:
                continue
            if file_name not in cache:
                cache[file_name] = await self._resolve_document_metadata(file_name)
            metadata = cache[file_name]

            existing_url = self._pick_url(doc)
            if existing_url:
                doc["document_url"] = existing_url
            elif metadata.get("document_url"):
                doc["document_url"] = metadata["document_url"]

            if metadata.get("document_name"):
                doc["document_name"] = metadata["document_name"]
            elif not doc.get("document_name"):
                doc["document_name"] = file_name

    async def _resolve_document_metadata(self, file_name: str) -> dict[str, Any]:
        document = await self._documents.find_by_file(file_name)
        if not document:
            return {}
        document_name = (
            document.get("document_name")
            or document.get("file_name")
            or document.get("filename")
            or document.get("title")
            or document.get("file")
        )
        document_url = self._pick_url(document)
        return {"document_name": document_name, "document_url": document_url}

    @staticmethod
    def _pick_url(doc: dict[str, Any]) -> str | None:
        for key in _URL_CANDIDATE_KEYS:
            value = doc.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    def _build_citations(self, docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        for index, doc in enumerate(docs, start=1):
            document_name = doc.get("document_name") or doc.get("file", "unknown")
            document_url = self._pick_url(doc) or ""
            citations.append(
                {
                    "citation_id": index,
                    "document_id": doc.get("file", "unknown"),
                    "source_filename": document_name,
                    "page_number": doc.get("page_number"),
                    "pdf_link_with_page": document_url,
                    "content": (doc.get("text", "") or "")[:_MAX_CITATION_CONTENT_CHARS],
                    "score": doc.get("score"),
                }
            )
        return citations

