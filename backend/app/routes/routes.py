from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from celery.result import AsyncResult
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.chat_history import ChatHistoryStore
from app.celery_app import celery_app
from app.db_models import RAGChunkDocument
from app.ingestion_tasks import ingest_document_task
from app.rag import RAGService, RAGSettings
from app.routes.schemas import (
    BatchIngestResponse,
    ChatListResponse,
    ChatMessagesResponse,
    IngestedDocument,
    IngestionTask,
    IngestionTaskStatusResponse,
    IndexedDocument,
    IndexedDocumentsResponse,
    RAGResponse,
)

router = APIRouter()
settings = RAGSettings()
rag_service = RAGService(settings=settings)
chat_store = ChatHistoryStore(
    mongodb_uri=settings.mongodb_uri,
    mongodb_database=settings.mongodb_database,
)


@router.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/rag/query", response_model=RAGResponse, tags=["rag"])
async def rag_query(
    question: Annotated[str, Form(...)],
    file: Annotated[UploadFile | None, File()] = None,
    chat_id: Annotated[str | None, Form()] = None,
) -> RAGResponse:
    try:
        resolved_chat_id = (chat_id or "").strip() or f"chat-{uuid4().hex}"
        document_id: str | None = None
        source = "Indexed documents"
        if file is not None:
            ingest_result = await rag_service.ingest_document(file=file)
            document_id = str(ingest_result["document_id"])
            source = file.filename or "Uploaded document"
        result = await rag_service.query(
            question=question,
            document_id=document_id,
        )
        await chat_store.save_conversation_turn(
            chat_id=resolved_chat_id,
            question=question,
            answer=str(result.get("answer", "")),
            citations=list(result.get("citations", [])),
            source=source,
            updated_at=datetime.now(tz=UTC).isoformat(),
        )
        return RAGResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {exc}") from exc


@router.post("/rag/upload-batch", response_model=BatchIngestResponse, tags=["rag"])
async def rag_upload_batch(
    files: Annotated[list[UploadFile], File(...)],
) -> BatchIngestResponse:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided for batch upload.")

    try:
        tasks: list[IngestionTask] = []
        for file in files:
            payload = await file.read()
            if not payload:
                raise HTTPException(
                    status_code=400,
                    detail=f"Uploaded file '{file.filename or 'unknown'}' is empty.",
                )
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
        return BatchIngestResponse(tasks=tasks)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Batch upload failed: {exc}") from exc


@router.get(
    "/rag/upload-batch/tasks/{task_id}",
    response_model=IngestionTaskStatusResponse,
    tags=["rag"],
)
async def get_ingestion_task_status(task_id: str) -> IngestionTaskStatusResponse:
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


@router.get("/rag/documents", response_model=IndexedDocumentsResponse, tags=["rag"])
async def list_indexed_documents(
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> IndexedDocumentsResponse:
    try:
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
        total_documents = len(distinct_doc_ids)
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
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list indexed documents: {exc}") from exc


@router.get("/rag/chats", response_model=ChatListResponse, tags=["rag"])
async def list_recent_chats(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ChatListResponse:
    chats = await chat_store.list_chats(limit=limit, offset=offset)
    return ChatListResponse(chats=chats)


@router.get("/rag/chats/{chat_id}/messages", response_model=ChatMessagesResponse, tags=["rag"])
async def get_chat_messages(chat_id: str) -> ChatMessagesResponse:
    messages = await chat_store.get_chat_messages(chat_id=chat_id)
    return ChatMessagesResponse(chat_id=chat_id, messages=messages)
