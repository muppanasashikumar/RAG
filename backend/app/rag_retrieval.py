from __future__ import annotations

import re
from typing import Any

from sentence_transformers import SentenceTransformer

from app.rag_settings import RAGSettings


class RAGRetrievalEngine:
    def __init__(self, settings: RAGSettings, embedder: SentenceTransformer, collection: Any) -> None:
        self.settings = settings
        self.embedder = embedder
        self.collection = collection

    async def retrieve_context(
        self, question: str, document_id: str | None = None
    ) -> tuple[str, list[dict[str, Any]]]:
        query_embedding = self.embedder.encode([question], normalize_embeddings=True).tolist()[0]
        where_filter = {"doc_id": document_id} if document_id else None
        dense_results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=self.settings.top_k * self.settings.hybrid_candidate_multiplier,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )
        keyword_results = self.collection.query(
            query_texts=[question],
            n_results=self.settings.top_k * self.settings.hybrid_candidate_multiplier,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        dense_rows = self._build_result_rows(dense_results, score_key="dense_score")
        keyword_rows = self._build_result_rows(keyword_results, score_key="keyword_score")
        fused_rows = self._fuse_hybrid_results(
            dense_rows=dense_rows,
            keyword_rows=keyword_rows,
            question=question,
        )
        if not fused_rows:
            raise ValueError("No relevant context found. Upload a document first.")

        context_rows: list[str] = []
        citations: list[dict[str, Any]] = []
        for idx, row in enumerate(fused_rows, start=1):
            content = row["content"]
            metadata = row["metadata"]
            page = int(metadata["page_number"])
            pdf_url = metadata["pdf_url"]
            citations.append(
                {
                    "citation_id": idx,
                    "document_id": metadata["doc_id"],
                    "source_filename": metadata.get("source_filename", metadata["doc_id"]),
                    "page_number": page,
                    "pdf_link_with_page": f"{pdf_url}#page={page}",
                    "content": content,
                    "score": row["hybrid_score"],
                }
            )
            context_rows.append(f"[{idx}] (page {page}) {content}")

        return "\n\n".join(context_rows), citations

    def _build_result_rows(
        self, results: dict[str, Any], score_key: str
    ) -> dict[str, dict[str, Any]]:
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        rows: dict[str, dict[str, Any]] = {}
        for content, metadata, distance in zip(documents, metadatas, distances, strict=False):
            doc_key = f"{metadata.get('doc_id')}:{metadata.get('page_number')}:{metadata.get('chunk_index')}"
            row = rows.setdefault(
                doc_key,
                {
                    "content": content,
                    "metadata": metadata,
                    "dense_score": 0.0,
                    "keyword_score": 0.0,
                    "lexical_score": 0.0,
                },
            )
            row[score_key] = max(0.0, 1 - float(distance))
        return rows

    def _fuse_hybrid_results(
        self,
        dense_rows: dict[str, dict[str, Any]],
        keyword_rows: dict[str, dict[str, Any]],
        question: str,
    ) -> list[dict[str, Any]]:
        combined_keys = set(dense_rows) | set(keyword_rows)
        if not combined_keys:
            return []

        merged_rows: list[dict[str, Any]] = []
        for key in combined_keys:
            base_row = dense_rows.get(key) or keyword_rows[key]
            dense_score = dense_rows.get(key, {}).get("dense_score", 0.0)
            keyword_score = keyword_rows.get(key, {}).get("keyword_score", 0.0)
            lexical_score = self._lexical_overlap_score(question=question, text=base_row["content"])
            hybrid_score = (
                self.settings.hybrid_dense_weight * dense_score
                + self.settings.hybrid_keyword_weight * keyword_score
                + self.settings.hybrid_lexical_weight * lexical_score
            )
            merged_rows.append(
                {
                    "content": base_row["content"],
                    "metadata": base_row["metadata"],
                    "hybrid_score": round(min(hybrid_score, 1.0), 4),
                }
            )

        merged_rows.sort(key=lambda row: row["hybrid_score"], reverse=True)
        return merged_rows[: self.settings.top_k]

    def _lexical_overlap_score(self, question: str, text: str) -> float:
        query_terms = self._tokenize(question)
        text_terms = self._tokenize(text)
        if not query_terms or not text_terms:
            return 0.0
        overlap = len(query_terms & text_terms)
        return overlap / len(query_terms)

    def _tokenize(self, value: str) -> set[str]:
        return {token for token in re.findall(r"[a-zA-Z0-9]+", value.lower()) if len(token) > 2}
