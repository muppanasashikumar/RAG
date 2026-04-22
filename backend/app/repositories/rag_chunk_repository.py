from __future__ import annotations

from app.models.documents import RAGChunkDocument


class RAGChunkRepository:
    async def find_one_by_doc_id(self, doc_id: str) -> RAGChunkDocument | None:
        return await RAGChunkDocument.find_one(RAGChunkDocument.doc_id == doc_id)

    async def list_by_doc_id(self, doc_id: str) -> list[RAGChunkDocument]:
        return await RAGChunkDocument.find(RAGChunkDocument.doc_id == doc_id).to_list()

    async def list_all(self) -> list[RAGChunkDocument]:
        return await RAGChunkDocument.find_all().to_list()

    async def insert_many(self, chunks: list[RAGChunkDocument]) -> None:
        if chunks:
            await RAGChunkDocument.insert_many(chunks)

    async def list_indexed_documents(self, *, limit: int, offset: int) -> dict[str, object]:
        collection = RAGChunkDocument.get_pymongo_collection()
        pipeline = [
            {
                "$group": {
                    "_id": "$doc_id",
                    "source_filename": {"$first": "$source_filename"},
                    "pdf_url": {"$first": "$pdf_url"},
                    "chunks": {"$sum": 1},
                }
            },
            {"$sort": {"_id": -1}},
            {"$skip": offset},
            {"$limit": limit},
        ]
        cursor = await collection.aggregate(pipeline)
        rows = await cursor.to_list(length=limit)
        distinct_doc_ids = await collection.distinct("doc_id")
        return {
            "rows": rows,
            "total_documents": len(distinct_doc_ids),
        }
