from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.rag_settings import RAGSettings
from app.schemas.rag import (
    BatchIngestResponse,
    IndexedDocumentsResponse,
    IngestionTaskStatusResponse,
    RAGResponse,
)
from app.services.rag_service import RagApplicationService

router = APIRouter(prefix="/rag", tags=["rag"])
settings = RAGSettings()
rag_service = RagApplicationService(settings=settings)


@router.post("/query", response_model=RAGResponse)
async def rag_query(
    question: Annotated[str, Form(...)],
    file: Annotated[UploadFile | None, File()] = None,
    chat_id: Annotated[str | None, Form()] = None,
) -> RAGResponse:
    try:
        return await rag_service.query(question=question, file=file, chat_id=chat_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {exc}") from exc


@router.post("/upload-batch", response_model=BatchIngestResponse)
async def rag_upload_batch(
    files: Annotated[list[UploadFile], File(...)],
) -> BatchIngestResponse:
    try:
        tasks = await rag_service.upload_batch(files=files)
        return BatchIngestResponse(tasks=tasks)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Batch upload failed: {exc}") from exc


@router.get("/upload-batch/tasks/{task_id}", response_model=IngestionTaskStatusResponse)
async def get_ingestion_task_status(task_id: str) -> IngestionTaskStatusResponse:
    return await rag_service.get_ingestion_task_status(task_id=task_id)


@router.get("/documents", response_model=IndexedDocumentsResponse)
async def list_indexed_documents(
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> IndexedDocumentsResponse:
    try:
        return await rag_service.list_indexed_documents(limit=limit, offset=offset)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list indexed documents: {exc}",
        ) from exc
