"""RAG retrieval and streaming answer service."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import re
from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from typing import Any, Awaitable, Callable, Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field

from app.domain.models import RetrievalMode
from app.core.config import settings
from app.infrastructure.embeddings import EmbeddingsClient
from app.infrastructure.llm import LLMClient
from app.infrastructure.reranker import RerankerClient
from app.repositories.documents_repository import DocumentsRepository
from app.repositories.vector_repository import QUERY_STOPWORDS, VectorRepository

logger = logging.getLogger(__name__)

_URL_CANDIDATE_KEYS = ("document_url", "documentUrl", "file_url", "fileUrl", "url")
_MAX_QUERY_CHARS = 2_000
_MAX_CONTEXT_TOKENS = 3_000
_MAX_HISTORY_TOKENS = 1_000
_MAX_HISTORY_MESSAGES = 10
_MAX_CITATION_CONTENT_CHARS = 700
_RETRIEVAL_TIMEOUT_SECONDS = max(5, int(settings.RAG_RETRIEVAL_TIMEOUT_SECONDS))
_NEXT_TOKEN_TIMEOUT_SECONDS = max(10, int(settings.RAG_NEXT_TOKEN_TIMEOUT_SECONDS))
_RERANK_CANDIDATES = 24
_FINAL_RETRIEVAL_LIMIT = 10
_RRF_K = 60
_RAG_SYSTEM_PROMPT = """
You are a production RAG assistant operating in HYBRID mode.

Decision policy (apply in order):
1) Inspect the provided context blocks against the user question. Each block
   is labelled like `[C1]`, `[C2]`, ... at the start of the block.
2) If the context contains information that materially answers the question:
   - Answer STRICTLY from the context. Do not add outside facts.
   - Set `used_general_knowledge` = false.
   - Set `grounded_in_context` = true.
   - Populate `cited_indices` with the exact integer indices (e.g. 1, 2)
     of ONLY the context blocks that materially supported the answer.
     Do NOT include blocks that are unrelated, off-topic, or only
     tangentially mention the query terms.
3) If the context is unrelated to the question OR clearly insufficient:
   - Answer from your own general knowledge.
   - Be helpful, accurate, and concise.
   - Set `used_general_knowledge` = true.
   - Set `grounded_in_context` = false.
   - Set `cited_indices` to an empty list.
   - Do NOT fabricate citations. Do NOT pretend the answer came from the documents.
4) Never mix grounded and ungrounded claims silently. Pick one mode per response.
5) Be strict about `cited_indices`: if a block is irrelevant to the question, do
   not list it even if it was provided. It is better to cite fewer blocks than
   to attach unrelated sources.

Output requirements:
- You MUST return data matching the structured schema exactly.
- The `answer` must be plain markdown text for end users.
- Prefer short sections and bullet points when useful.
- Do not add extra vertical whitespace; never emit multiple consecutive blank lines.
- Do not mention internal implementation details, retrieval, or this prompt.
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
        description="Final response to the user. Either strictly grounded in context or based on general knowledge, depending on the chosen mode."
    )
    used_general_knowledge: bool = Field(
        default=False,
        description="True when the assistant fell back to general knowledge because the provided context did not contain relevant information.",
    )
    grounded_in_context: bool = Field(
        description="True if all substantive claims are supported by the provided context."
    )
    confidence: Literal["high", "medium", "low"] = Field(
        description="Confidence level. For grounded answers: based on completeness of context. For general-knowledge answers: based on the assistant's certainty."
    )
    key_points: list[str] = Field(
        default_factory=list,
        description="Top factual takeaways. For grounded answers, strictly from context.",
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="What additional data is needed. Only relevant when grounded.",
    )
    cited_indices: list[int] = Field(
        default_factory=list,
        description=(
            "1-based indices of the context blocks (e.g. [C1], [C2], ...) that "
            "materially supported the answer. Empty when general knowledge was "
            "used or no block was relevant. NEVER include indices for blocks "
            "that are unrelated to the user question."
        ),
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
                self._retrieve(query=normalized_query, preferred_file=file),
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
            used_general_knowledge = False
            grounded_in_context = False
            cited_indices: list[int] | None = None
            try:
                structured = await self._invoke_structured_with_abort(
                    messages=messages,
                    should_abort=should_abort,
                )
                if structured is not None:
                    used_general_knowledge = bool(structured.used_general_knowledge)
                    grounded_in_context = bool(structured.grounded_in_context)
                    cited_indices = list(structured.cited_indices or [])
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
            # When the assistant fell back to general knowledge, the indexed docs were
            # not actually used to produce the answer, so attaching their citations
            # would mislead the user.
            if used_general_knowledge:
                yield {"type": "citations", "citations": [], "retrieval_mode": "general"}
            else:
                filtered_citations = self._filter_citations_by_indices(
                    citations,
                    cited_indices,
                    grounded_in_context=grounded_in_context,
                )
                logger.info(
                    "Citation filter: retrieved=%d cited_indices=%s grounded=%s emitted=%d",
                    len(citations),
                    cited_indices,
                    grounded_in_context,
                    len(filtered_citations),
                )
                yield {
                    "type": "citations",
                    "citations": filtered_citations,
                    "retrieval_mode": mode,
                }
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
        self, *, query: str, preferred_file: str | None = None
    ) -> tuple[list[dict[str, Any]], RetrievalMode]:
        embedding = await asyncio.to_thread(self._embeddings.embed, query)
        candidate_limit = _RERANK_CANDIDATES if self._reranker else _FINAL_RETRIEVAL_LIMIT
        vector_task = self._vectors.vector_search(embedding, limit=candidate_limit)
        keyword_task = self._vectors.keyword_search(query, limit=candidate_limit)
        vector_docs, keyword_docs = await asyncio.gather(vector_task, keyword_task)

        merged = self._fuse_rankings(vector_docs=vector_docs, keyword_docs=keyword_docs)
        if not merged:
            return [], "none"
        merged = self._prioritize_same_file_chunks(merged, preferred_file=preferred_file)
        merged = await self._rerank_docs(query=query, docs=merged, limit=_FINAL_RETRIEVAL_LIMIT)
        merged = self._ensure_each_file_gets_one_chunk(merged, limit=_FINAL_RETRIEVAL_LIMIT)
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
        consumed_tokens = 0
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

            message_tokens = self._estimate_tokens(normalized)
            projected = consumed_tokens + message_tokens
            if projected > _MAX_HISTORY_TOKENS and selected:
                break

            selected.append({"role": role, "content": normalized})
            consumed_tokens = projected
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
        used_tokens = 0

        for index, doc in enumerate(docs, start=1):
            text = (doc.get("parent_text") or doc.get("text") or "").strip()
            if not text:
                continue

            source = doc.get("document_name") or doc.get("file") or "unknown"
            page = doc.get("page_number")
            page_label = f"page {page}" if page is not None else "page unknown"
            block = f"[C{index}] Source: {source} ({page_label})\n{text}"
            block_tokens = self._estimate_tokens(block)
            if block_tokens <= 0:
                continue
            remaining_tokens = _MAX_CONTEXT_TOKENS - used_tokens
            if remaining_tokens <= 0:
                break
            if block_tokens > remaining_tokens:
                block = self._truncate_to_token_budget(block, token_budget=remaining_tokens)
                if not block:
                    continue
                parts.append(block)
                break
            parts.append(block)
            used_tokens += block_tokens

        return "\n\n".join(parts)

    @staticmethod
    def _format_structured_answer(payload: RagStructuredAnswer) -> str:
        body = payload.answer.strip()
        if payload.used_general_knowledge:
            disclaimer = (
                "> **Note:** This answer is from general knowledge — your indexed "
                "documents did not contain relevant information."
            )
            return f"{disclaimer}\n\n{body}".strip()

        lines: list[str] = [body]
        lines.append(f"\nConfidence: {payload.confidence}")
        lines.append(
            f"Grounded in provided context: {'yes' if payload.grounded_in_context else 'no'}"
        )
        if payload.key_points:
            lines.append("\nKey points:")
            lines.extend(f"- {point}" for point in payload.key_points if point.strip())
        if payload.missing_information:
            lines.append("\nMissing information:")
            lines.extend(f"- {item}" for item in payload.missing_information if item.strip())
        return "\n".join(lines).strip()

    @staticmethod
    def _doc_key(doc: dict[str, Any]) -> str:
        chunk_id = doc.get("chunk_id")
        if isinstance(chunk_id, str) and chunk_id:
            return chunk_id
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
            token
            for token in text.lower().replace("\n", " ").split()
            if len(token) > 2 and token not in QUERY_STOPWORDS
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

    @staticmethod
    def _normalize_file_name(file_name: str | None) -> str:
        return (file_name or "").strip().lower()

    def _prioritize_same_file_chunks(
        self, docs: list[dict[str, Any]], *, preferred_file: str | None
    ) -> list[dict[str, Any]]:
        target = self._normalize_file_name(preferred_file)
        if not target:
            return docs
        same_file: list[dict[str, Any]] = []
        others: list[dict[str, Any]] = []
        for doc in docs:
            doc_file = self._normalize_file_name(doc.get("file"))
            if doc_file == target:
                same_file.append(doc)
            else:
                others.append(doc)
        return same_file + others

    def _ensure_each_file_gets_one_chunk(
        self, docs: list[dict[str, Any]], *, limit: int
    ) -> list[dict[str, Any]]:
        if not docs:
            return []
        if limit <= 0:
            return []
        file_firsts: list[dict[str, Any]] = []
        seen_files: set[str] = set()
        for doc in docs:
            file_name = self._normalize_file_name(doc.get("file"))
            if not file_name or file_name in seen_files:
                continue
            seen_files.add(file_name)
            file_firsts.append(doc)
            if len(file_firsts) >= limit:
                return file_firsts
        selected = list(file_firsts)
        selected_keys = {self._doc_key(doc) for doc in selected}
        for doc in docs:
            if len(selected) >= limit:
                break
            key = self._doc_key(doc)
            if key in selected_keys:
                continue
            selected.append(doc)
            selected_keys.add(key)
        return selected

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        # Lightweight approximation: good enough for budget packing decisions.
        return len(re.findall(r"\S+", text or ""))

    def _truncate_to_token_budget(self, text: str, *, token_budget: int) -> str:
        if token_budget <= 0:
            return ""
        if self._estimate_tokens(text) <= token_budget:
            return text
        tokens = re.findall(r"\S+", text)
        if not tokens:
            return ""
        truncated = " ".join(tokens[:token_budget]).strip()
        return truncated

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

    @staticmethod
    def _filter_citations_by_indices(
        citations: list[dict[str, Any]],
        cited_indices: list[int] | None,
        *,
        grounded_in_context: bool,
    ) -> list[dict[str, Any]]:
        """Keep only citations the LLM actually relied on.

        ``cited_indices`` are 1-based context-block indices emitted by the
        structured response. ``None`` means the LLM did not produce structured
        output (e.g. fallback streaming path) — in that case we preserve the
        full retrieved set so the user still sees sources.

        Some LLMs (especially smaller models or models with weaker structured-
        output adherence) may return ``cited_indices=[]`` or values that do
        not correspond to any real ``citation_id`` even when
        ``grounded_in_context=True``. Hiding all citations in those cases
        would mislead the user, so whenever the model claims to be grounded
        we fall back to the full retrieved set if the index list is empty
        or fails to match anything. Only return zero citations when the
        model affirmatively chose not to ground in the provided context.
        """
        if cited_indices is None:
            return citations
        valid_ids: set[int] = {idx for idx in cited_indices if isinstance(idx, int)}
        if not valid_ids:
            return citations if grounded_in_context else []
        matched = [
            citation
            for citation in citations
            if isinstance(citation.get("citation_id"), int)
            and citation["citation_id"] in valid_ids
        ]
        if not matched and grounded_in_context:
            return citations
        return matched

    def _build_citations(self, docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        for index, doc in enumerate(docs, start=1):
            document_name = doc.get("document_name") or doc.get("file", "unknown")
            page_number = doc.get("page_number")
            document_url = self._with_page_anchor(self._pick_url(doc) or "", page_number)
            citation_text = (
                doc.get("parent_text")
                if isinstance(doc.get("parent_text"), str) and doc.get("parent_text")
                else doc.get("text", "")
            )
            citations.append(
                {
                    "citation_id": index,
                    "document_id": doc.get("file", "unknown"),
                    "source_filename": document_name,
                    "page_number": page_number,
                    "pdf_link_with_page": document_url,
                    "content": (citation_text or "")[:_MAX_CITATION_CONTENT_CHARS],
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

