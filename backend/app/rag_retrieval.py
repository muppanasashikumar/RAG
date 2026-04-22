from __future__ import annotations

import re
from typing import Any

from pymongo.errors import OperationFailure
from sentence_transformers import SentenceTransformer

from app.models.documents import RAGChunkDocument
from app.rag_settings import RAGSettings
from app.repositories.rag_chunk_repository import RAGChunkRepository


class RAGRetrievalEngine:
    def __init__(
        self,
        settings: RAGSettings,
        embedder: SentenceTransformer,
        chunk_repository: RAGChunkRepository | None = None,
    ) -> None:
        self.settings = settings
        self.embedder = embedder
        self.chunk_repository = chunk_repository or RAGChunkRepository()

    async def retrieve_context(
        self, question: str, document_id: str | None = None
    ) -> tuple[str, list[dict[str, Any]]]:
        query_embedding = self.embedder.encode([question], normalize_embeddings=True).tolist()[0]
        if self.settings.mongodb_use_vector_search:
            fused_rows = await self._vector_search_rows(
                question=question,
                query_embedding=query_embedding,
                document_id=document_id,
            )
        else:
            fused_rows = await self._python_scored_rows(
                question=question,
                query_embedding=query_embedding,
                document_id=document_id,
            )
        if not fused_rows:
            raise ValueError("No relevant context found. Upload a document first.")

        context_rows: list[str] = []
        citations: list[dict[str, Any]] = []
        for idx, row in enumerate(fused_rows, start=1):
            content = row["content"]
            page = int(row["page_number"])
            pdf_url = row["pdf_url"]
            citations.append(
                {
                    "citation_id": idx,
                    "document_id": row["doc_id"],
                    "source_filename": row["source_filename"],
                    "page_number": page,
                    "pdf_link_with_page": f"{pdf_url}#page={page}",
                    "content": content,
                    "score": row["hybrid_score"],
                }
            )
            context_rows.append(f"[{idx}] (page {page}) {content}")

        return "\n\n".join(context_rows), citations

    async def _python_scored_rows(
        self, question: str, query_embedding: list[float], document_id: str | None
    ) -> list[dict[str, Any]]:
        if document_id:
            chunk_docs = await self.chunk_repository.list_by_doc_id(doc_id=document_id)
        else:
            chunk_docs = await self.chunk_repository.list_all()
        return self._score_chunks(
            question=question,
            query_embedding=query_embedding,
            chunks=chunk_docs,
        )

    async def _vector_search_rows(
        self, question: str, query_embedding: list[float], document_id: str | None
    ) -> list[dict[str, Any]]:
        raw_collection = RAGChunkDocument.get_pymongo_collection()
        limit = self.settings.top_k * self.settings.hybrid_candidate_multiplier
        num_candidates = max(self.settings.mongodb_vector_num_candidates, limit)
        vector_stage: dict[str, Any] = {
            "index": self.settings.mongodb_vector_index_name,
            "path": "embedding",
            "queryVector": query_embedding,
            "numCandidates": num_candidates,
            "limit": limit,
        }
        if document_id:
            vector_stage["filter"] = {"doc_id": document_id}
        pipeline = [
            {"$vectorSearch": vector_stage},
            {
                "$project": {
                    "doc_id": 1,
                    "source_filename": 1,
                    "page_number": 1,
                    "pdf_url": 1,
                    "content": 1,
                    "vector_score": {"$meta": "vectorSearchScore"},
                }
            },
        ]
        try:
            cursor = await raw_collection.aggregate(pipeline)
            rows = await cursor.to_list(length=limit)
        except OperationFailure:
            return await self._python_scored_rows(
                question=question,
                query_embedding=query_embedding,
                document_id=document_id,
            )
        if not rows:
            return await self._python_scored_rows(
                question=question,
                query_embedding=query_embedding,
                document_id=document_id,
            )

        scored_rows: list[dict[str, Any]] = []
        max_vector_score = max(float(row.get("vector_score", 0.0)) for row in rows) or 1.0
        for row in rows:
            content = str(row.get("content", ""))
            dense_score = float(row.get("vector_score", 0.0)) / max_vector_score
            keyword_score = self._keyword_score(question=question, text=content)
            lexical_score = self._lexical_overlap_score(question=question, text=content)
            hybrid_score = (
                self.settings.hybrid_dense_weight * dense_score
                + self.settings.hybrid_keyword_weight * keyword_score
                + self.settings.hybrid_lexical_weight * lexical_score
            )
            scored_rows.append(
                {
                    "doc_id": str(row.get("doc_id", "")),
                    "source_filename": str(row.get("source_filename", "")),
                    "page_number": int(row.get("page_number", 1)),
                    "pdf_url": str(row.get("pdf_url", "")),
                    "content": content,
                    "hybrid_score": round(min(max(hybrid_score, 0.0), 1.0), 4),
                }
            )
        scored_rows.sort(key=lambda item: item["hybrid_score"], reverse=True)
        return scored_rows[: self.settings.top_k]

    def _score_chunks(
        self, question: str, query_embedding: list[float], chunks: list[RAGChunkDocument]
    ) -> list[dict[str, Any]]:
        if not chunks:
            return []
        scored_rows: list[dict[str, Any]] = []
        for chunk in chunks:
            dense_score = self._cosine_similarity(query_embedding, chunk.embedding)
            keyword_score = self._keyword_score(question=question, text=chunk.content)
            lexical_score = self._lexical_overlap_score(question=question, text=chunk.content)
            hybrid_score = (
                self.settings.hybrid_dense_weight * dense_score
                + self.settings.hybrid_keyword_weight * keyword_score
                + self.settings.hybrid_lexical_weight * lexical_score
            )
            scored_rows.append(
                {
                    "doc_id": chunk.doc_id,
                    "source_filename": chunk.source_filename,
                    "page_number": chunk.page_number,
                    "pdf_url": chunk.pdf_url,
                    "content": chunk.content,
                    "hybrid_score": round(min(max(hybrid_score, 0.0), 1.0), 4),
                }
            )
        scored_rows.sort(key=lambda row: row["hybrid_score"], reverse=True)
        return scored_rows[: self.settings.top_k]

    def _cosine_similarity(self, left: list[float], right: list[float]) -> float:
        if not left or not right or len(left) != len(right):
            return 0.0
        return float(sum(a * b for a, b in zip(left, right, strict=False)))

    def _keyword_score(self, question: str, text: str) -> float:
        query_terms = self._tokenize(question)
        text_terms = self._tokenize(text)
        if not query_terms or not text_terms:
            return 0.0
        matched_terms = [term for term in query_terms if term in text_terms]
        return len(matched_terms) / len(query_terms)

    def _lexical_overlap_score(self, question: str, text: str) -> float:
        query_terms = self._tokenize(question)
        text_terms = self._tokenize(text)
        if not query_terms or not text_terms:
            return 0.0
        overlap = len(query_terms & text_terms)
        return overlap / len(query_terms)

    def _tokenize(self, value: str) -> set[str]:
        return {token for token in re.findall(r"[a-zA-Z0-9]+", value.lower()) if len(token) > 2}
