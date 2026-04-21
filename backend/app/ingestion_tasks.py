from __future__ import annotations

import asyncio
import io
from typing import Any

from fastapi import UploadFile

from app.celery_app import celery_app
from app.chat_history import ChatHistoryStore
from app.rag import RAGService, RAGSettings

settings = RAGSettings()
rag_service = RAGService(settings=settings)
chat_store = ChatHistoryStore(
    mongodb_uri=settings.mongodb_uri,
    mongodb_database=settings.mongodb_database,
)
_initialized = False


async def _initialize_once() -> None:
    global _initialized
    if _initialized:
        return
    await chat_store.initialize()
    _initialized = True


@celery_app.task(name="app.ingestion_tasks.ingest_document_task")
def ingest_document_task(
    filename: str,
    payload: bytes,
    content_type: str | None = None,
) -> dict[str, Any]:
    async def _run() -> dict[str, Any]:
        await _initialize_once()
        upload = UploadFile(
            filename=filename,
            file=io.BytesIO(payload),
            headers={"content-type": content_type or "application/octet-stream"},
        )
        return await rag_service.ingest_document(file=upload)

    return asyncio.run(_run())
