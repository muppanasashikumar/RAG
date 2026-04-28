"""RAG retrieval and streaming answer service."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from typing import Any, Awaitable, Callable, Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
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
_RAG_SYSTEM_PROMPT = """
You are a production RAG assistant.

Your primary requirement is strict grounding:
1) Use ONLY facts present in the provided context blocks.
2) Do NOT use outside knowledge, assumptions, or guesses.
3) If context is missing or ambiguous, explicitly state what is missing.
4) Be concise, accurate, and actionable.

Output requirements:
- You MUST return data matching the structured schema exactly.
- The `answer` must be plain markdown text for end users.
- Prefer short sections and bullet points when useful.
- Do not add extra vertical whitespace; never emit multiple consecutive blank lines.
- Mention uncertainty clearly when evidence is weak.
- Do not mention internal implementation details.
""".strip()
_RAG_PROMPT_TEMPLATE = ChatPromptTemplate.from_messages(
    [
        ("system", _RAG_SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="history"),
        (
            "human",
            "Use the context blocks below to answer.\n\n"
            "{language_instruction}\n\n"
            "Context blocks:\n{context}\n\n"
            "User question:\n{query}\n\n"
            "Return a response that follows the structured schema.",
        ),
    ]
)


class RagStructuredAnswer(BaseModel):
    answer: str = Field(
        description="Final response to the user grounded in provided context."
    )
    grounded_in_context: bool = Field(
        description="True if all substantive claims are supported by the provided context."
    )
    confidence: Literal["high", "medium", "low"] = Field(
        description="Confidence level based only on quality and completeness of context."
    )
    key_points: list[str] = Field(
        default_factory=list,
        description="Top factual takeaways strictly from context.",
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="What additional data is needed when context is insufficient.",
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
        should_abort: Callable[[], Awaitable[bool]] | None = None,
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
            if await self._is_aborted(should_abort):
                return
            # Retrieval spans the full vector store. The uploaded file (if any) is kept
            # only for logging/citation context; it does not restrict the search scope.
            docs, mode = await asyncio.wait_for(
                self._retrieve(query=normalized_query),
                timeout=_RETRIEVAL_TIMEOUT_SECONDS,
            )
            if await self._is_aborted(should_abort):
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
                structured = await self._invoke_structured_with_abort(
                    messages=messages,
                    should_abort=should_abort,
                )
                if structured is not None:
                    formatted = self._format_structured_answer(structured).strip()
                    if formatted:
                        emitted = True
                        yield {"type": "token", "content": formatted}
            except Exception:
                logger.warning("Structured output failed; falling back to token stream", exc_info=True)

            if not emitted:
                async for token in self._stream_llm_tokens(messages, should_abort=should_abort):
                    yield {"type": "token", "content": token}

            if await self._is_aborted(should_abort):
                return
            yield {"type": "citations", "citations": citations, "retrieval_mode": mode}
        except TimeoutError:
            logger.warning(
                "Timed out while generating answer",
                extra={"attached_file": file},
            )
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
        self, *, query: str
    ) -> tuple[list[dict[str, Any]], RetrievalMode]:
        embedding = await asyncio.to_thread(self._embeddings.embed, query)
        candidate_limit = _RERANK_CANDIDATES if self._reranker else _FINAL_RETRIEVAL_LIMIT
        vector_task = self._vectors.vector_search(embedding, limit=candidate_limit)
        keyword_task = self._vectors.keyword_search(query, limit=candidate_limit)
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
            ranked = self._rank(docs, query_text=query, limit=limit)
            positive = [doc for doc in ranked if float(doc.get("score", 0) or 0) > 0]
            return positive or ranked[:1]
        texts = [(doc.get("text") or "").strip() for doc in docs]
        scores = await asyncio.to_thread(self._reranker.score, query, texts)
        indexed = list(zip(docs, scores, strict=False))
        indexed.sort(key=lambda item: item[1], reverse=True)
        reranked: list[dict[str, Any]] = []
        for doc, score in indexed[:limit]:
            doc["score"] = score
            reranked.append(doc)
        return reranked

    async def _stream_llm_tokens(
        self,
        messages: list[BaseMessage],
        *,
        should_abort: Callable[[], Awaitable[bool]] | None = None,
    ) -> AsyncIterator[str]:
        stream = self._llm.astream_messages(messages)
        while True:
            if await self._is_aborted(should_abort):
                await stream.aclose()
                break
            try:
                token = await asyncio.wait_for(
                    anext(stream),
                    timeout=_NEXT_TOKEN_TIMEOUT_SECONDS,
                )
            except StopAsyncIteration:
                break
            yield token

    async def _invoke_structured_with_abort(
        self,
        *,
        messages: list[BaseMessage],
        should_abort: Callable[[], Awaitable[bool]] | None,
    ) -> RagStructuredAnswer | None:
        task = asyncio.create_task(
            self._llm.ainvoke_structured(messages, schema=RagStructuredAnswer)
        )
        try:
            while not task.done():
                if await self._is_aborted(should_abort):
                    task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await task
                    return None
                await asyncio.sleep(0.1)
            return await task
        finally:
            if not task.done():
                task.cancel()

    @staticmethod
    async def _is_aborted(
        should_abort: Callable[[], Awaitable[bool]] | None,
    ) -> bool:
        if should_abort is None:
            return False
        try:
            return await should_abort()
        except Exception:
            return True

    def _build_messages(
        self,
        *,
        query: str,
        context: str,
        chat_history: list[dict[str, Any]] | None,
    ) -> list[BaseMessage]:
        history_messages = self._history_to_messages(chat_history)
        return _RAG_PROMPT_TEMPLATE.format_messages(
            history=history_messages,
            context=context,
            query=query,
            language_instruction="Respond in the same language as the user question.",
        )

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

        for index, doc in enumerate(docs, start=1):
            text = (doc.get("text") or "").strip()
            if not text or text in seen:
                continue

            source = doc.get("document_name") or doc.get("file") or "unknown"
            page = doc.get("page_number")
            page_label = f"page {page}" if page is not None else "page unknown"
            block = f"[C{index}] Source: {source} ({page_label})\n{text}"

            candidate_size = current_size + len(block) + (2 if parts else 0)
            if candidate_size > _MAX_CONTEXT_CHARS:
                remaining = _MAX_CONTEXT_CHARS - current_size
                if remaining <= 0:
                    break
                block = block[:remaining]
                parts.append(block)
                break

            seen.add(text)
            parts.append(block)
            current_size = candidate_size

        return "\n\n".join(parts)

    @staticmethod
    def _format_structured_answer(payload: RagStructuredAnswer) -> str:
        lines: list[str] = [payload.answer.strip()]
        lines.append(f"\nConfidence: {payload.confidence}")
        lines.append(f"Grounded in provided context: {'yes' if payload.grounded_in_context else 'no'}")

        if payload.key_points:
            lines.append("\nKey points:")
            lines.extend(f"- {point}" for point in payload.key_points if point.strip())

        if payload.missing_information:
            lines.append("\nMissing information:")
            lines.extend(f"- {item}" for item in payload.missing_information if item.strip())

        return "\n".join(lines).strip()

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
            page_number = doc.get("page_number")
            document_url = self._with_page_anchor(self._pick_url(doc) or "", page_number)
            citations.append(
                {
                    "citation_id": index,
                    "document_id": doc.get("file", "unknown"),
                    "source_filename": document_name,
                    "page_number": page_number,
                    "pdf_link_with_page": document_url,
                    "content": (doc.get("text", "") or "")[:_MAX_CITATION_CONTENT_CHARS],
                    "score": doc.get("score"),
                }
            )
        return citations

    @staticmethod
    def _with_page_anchor(url: str, page_number: Any) -> str:
        if not isinstance(url, str) or not url.strip():
            return ""
        if not isinstance(page_number, int) or page_number <= 0:
            return url.strip()
        parsed = urlsplit(url.strip())
        fragment_pairs = dict(parse_qsl(parsed.fragment, keep_blank_values=True))
        fragment_pairs["page"] = str(page_number)
        updated_fragment = urlencode(fragment_pairs)
        return urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path, parsed.query, updated_fragment)
        )

