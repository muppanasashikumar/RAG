from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from celery.result import AsyncResult
from fastapi import HTTPException, UploadFile

from app.celery_app import celery_app
from app.ingestion_tasks import ingest_document_task
from app.rag import RAGService as RAGEngineService
from app.rag_settings import RAGSettings
from app.repositories.rag_chunk_repository import RAGChunkRepository
from app.schemas.rag import (
    IndexedDocument,
    IndexedDocumentsResponse,
    IngestedDocument,
    IngestionTask,
    IngestionTaskStatusResponse,
    RAGResponse,
)
from app.services.chat_service import ChatService


class RagApplicationService:
    def __init__(
        self,
        settings: RAGSettings,
        rag_engine: RAGEngineService | None = None,
        chat_service: ChatService | None = None,
        chunk_repository: RAGChunkRepository | None = None,
    ) -> None:
        self.settings = settings
        self.rag_engine = rag_engine or RAGEngineService(settings=settings)
        self.chat_service = chat_service or ChatService()
        self.chunk_repository = chunk_repository or RAGChunkRepository()

    async def query(
        self,
        *,
        question: str,
        file: UploadFile | None,
        chat_id: str | None,
    ) -> RAGResponse:
        resolved_chat_id = (chat_id or "").strip() or f"chat-{uuid4().hex}"
        document_id: str | None = None
        source = "Indexed documents"
        if file is not None:
            ingest_result = await self.rag_engine.ingest_document(file=file)
            document_id = str(ingest_result["document_id"])
            source = file.filename or "Uploaded document"

        result = await self.rag_engine.query(question=question, document_id=document_id)
        await self.chat_service.save_conversation_turn(
            chat_id=resolved_chat_id,
            question=question,
            answer=str(result.get("answer", "")),
            citations=list(result.get("citations", [])),
            source=source,
            updated_at=datetime.now(tz=UTC),
        )
        return RAGResponse(**result)

    async def upload_batch(self, files: list[UploadFile]) -> list[IngestionTask]:
        if not files:
            raise ValueError("No files provided for batch upload.")
        tasks: list[IngestionTask] = []
        for file in files:
            payload = await file.read()
            if not payload:
                raise ValueError(f"Uploaded file '{file.filename or 'unknown'}' is empty.")
            task = ingest_document_task.delay(
                filename=file.filename or "uploaded-file",
                payload=payload,
                content_type=file.content_type,
            )
            tasks.append(
                IngestionTask(
                    task_id=task.id,
                    filename=file.filename or "uploaded-file",
                    status="queued",
                )
            )
        return tasks

    async def get_ingestion_task_status(self, task_id: str) -> IngestionTaskStatusResponse:
        task = AsyncResult(task_id, app=celery_app)
        status = str(task.status).lower()
        if task.failed():
            return IngestionTaskStatusResponse(
                task_id=task_id,
                status=status,
                error=str(task.result),
            )
        if task.successful():
            result = task.result or {}
            return IngestionTaskStatusResponse(
                task_id=task_id,
                status=status,
                result=IngestedDocument(**result),
            )
        return IngestionTaskStatusResponse(task_id=task_id, status=status)

    async def list_indexed_documents(self, *, limit: int, offset: int) -> IndexedDocumentsResponse:
        manifest = await self.chunk_repository.list_indexed_documents(limit=limit, offset=offset)
        rows = manifest["rows"]
        if not isinstance(rows, list):
            raise HTTPException(status_code=500, detail="Invalid document index response.")
        total_documents = int(manifest["total_documents"])
        documents = [
            IndexedDocument(
                document_id=str(row.get("_id", "")),
                source_filename=str(row.get("source_filename", "")),
                pdf_url=str(row.get("pdf_url", "")),
                chunks=int(row.get("chunks", 0)),
                status="ready",
            )
            for row in rows
        ]
        return IndexedDocumentsResponse(total_documents=total_documents, documents=documents)
