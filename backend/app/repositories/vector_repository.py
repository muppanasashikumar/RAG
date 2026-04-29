"""Vector collection repository (Atlas Vector Search + fallback queries)."""

from __future__ import annotations

import inspect
import re
from typing import Any

from pymongo.errors import OperationFailure

from app.infrastructure.mongo_models import VectorChunk

_PROJECT_FIELDS: dict[str, int] = {
    "_id": 0,
    "file": 1,
    "text": 1,
    "document_type": 1,
    "content_hash_sha256": 1,
    "file_size_bytes": 1,
    "chunk_level": 1,
    "chunk_id": 1,
    "parent_id": 1,
    "parent_text": 1,
    "page_number": 1,
    "document_url": 1,
    "documentUrl": 1,
    "file_url": 1,
    "fileUrl": 1,
    "url": 1,
    "document_name": 1,
}

# Common English words that would otherwise cause keyword search to match
# almost every chunk in the corpus (e.g. "tell me about X" pulls everything
# containing "tell" or "about"). Keep this list small and focused on terms
# that frequently appear in user questions but never carry retrieval signal.
QUERY_STOPWORDS: frozenset[str] = frozenset(
    {
        "the", "and", "for", "are", "but", "not", "you", "your", "from",
        "this", "that", "these", "those", "with", "what", "which", "who",
        "whom", "where", "when", "why", "how", "have", "has", "had", "was",
        "were", "been", "being", "can", "could", "would", "should", "will",
        "shall", "may", "might", "must", "does", "did", "doing", "tell",
        "told", "ask", "asks", "asked", "about", "into", "onto", "over",
        "under", "than", "then", "such", "some", "any", "all", "each",
        "every", "very", "just", "also", "only", "own", "other", "our",
        "ours", "their", "theirs", "his", "her", "hers", "him", "she",
        "they", "them", "its", "itself", "themselves", "yourself",
        "yourselves", "myself", "ourselves", "himself", "herself",
        "let", "lets", "give", "gives", "gave", "show", "shows", "showed",
        "describe", "describes", "explain", "explains", "explained",
        "summarize", "summary", "please", "thanks", "thank", "kindly",
        "want", "wanted", "need", "needs", "needed", "like", "likes",
        "make", "makes", "made", "get", "gets", "got", "say", "says",
        "said", "more", "most", "less", "least", "very", "really",
        "actually", "definitely", "maybe", "perhaps", "possibly",
    }
)


class VectorRepository:
    @staticmethod
    def _tokenize(text: str) -> set[str]:
        return {
            token
            for token in re.findall(r"[A-Za-z0-9_]+", (text or "").lower())
            if len(token) > 2 and token not in QUERY_STOPWORDS
        }

    @staticmethod
    def _file_filter(file: str) -> dict[str, Any]:
        return {
            "$or": [
                {"file": file},
                {"filename": file},
                {"file_name": file},
                {"source": file},
                {"metadata.source": file},
                {"metadata.filename": file},
                {"metadata.file_name": file},
            ]
        }

    @staticmethod
    async def _resolve_cursor(cursor: Any) -> Any:
        while inspect.iscoroutine(cursor):
            cursor = await cursor
        return cursor

    async def delete_by_file(self, file: str) -> None:
        await VectorChunk.find({"file": file}).delete()

    async def insert_chunks(self, payload: list[dict[str, Any]]) -> None:
        if payload:
            await VectorChunk.insert_many([VectorChunk(**row) for row in payload])

    async def vector_search(
        self,
        query_embedding: list[float],
        *,
        file: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        stage: dict[str, Any] = {
            "index": "vector_index",
            "path": "embedding",
            "queryVector": query_embedding,
            "numCandidates": 100,
            "limit": limit,
        }
        if file:
            stage["filter"] = self._file_filter(file)

        projection = {
            key: value
            for key, value in _PROJECT_FIELDS.items()
            if key != "document_name"
        }
        pipeline = [
            {"$vectorSearch": stage},
            {"$project": {**projection, "score": {"$meta": "vectorSearchScore"}}},
        ]
        try:
            cursor = VectorChunk.get_pymongo_collection().aggregate(pipeline)
            cursor = await self._resolve_cursor(cursor)
            return await cursor.to_list(length=limit)
        except OperationFailure as exc:
            if "needs to be indexed as filter" in str(exc):
                return []
            raise

    async def find_by_file(self, file: str, limit: int = 500) -> list[dict[str, Any]]:
        if not file:
            return []
        cursor = VectorChunk.get_pymongo_collection().find({"file": file}, _PROJECT_FIELDS)
        cursor = await self._resolve_cursor(cursor)
        rows = await cursor.limit(limit).to_list(length=limit)
        if rows:
            return rows
        cursor = VectorChunk.get_pymongo_collection().find(
            {"file": {"$regex": f"^{file}$", "$options": "i"}}, _PROJECT_FIELDS
        )
        cursor = await self._resolve_cursor(cursor)
        return await cursor.limit(limit).to_list(length=limit)

    async def find_all(self, limit: int = 500) -> list[dict[str, Any]]:
        cursor = VectorChunk.get_pymongo_collection().find({}, _PROJECT_FIELDS)
        cursor = await self._resolve_cursor(cursor)
        return await cursor.limit(limit).to_list(length=limit)

    async def keyword_search(
        self,
        query_text: str,
        *,
        file: str | None = None,
        limit: int = 12,
        candidate_limit: int = 200,
    ) -> list[dict[str, Any]]:
        query_tokens = sorted(self._tokenize(query_text))
        if not query_tokens:
            return []
        token_filters = [
            {"text": {"$regex": re.escape(token), "$options": "i"}}
            for token in query_tokens[:8]
        ]
        match_filter: dict[str, Any] = {"$or": token_filters}
        if file:
            match_filter = {"$and": [self._file_filter(file), {"$or": token_filters}]}

        cursor = VectorChunk.get_pymongo_collection().find(match_filter, _PROJECT_FIELDS)
        cursor = await self._resolve_cursor(cursor)
        rows = await cursor.limit(candidate_limit).to_list(length=candidate_limit)
        if not rows:
            return []
        for row in rows:
            text_tokens = self._tokenize(row.get("text", ""))
            row["keyword_score"] = float(len(query_tokens and (set(query_tokens) & text_tokens)))
        rows.sort(key=lambda row: row.get("keyword_score", 0), reverse=True)
        return rows[:limit]
