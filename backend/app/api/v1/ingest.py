"""Ingest controller: accepts a file upload and delegates to the service."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.core.dependencies import get_ingestion_service
from app.schemas.responses.ingest import IngestResponse
from app.services.ingestion_service import IngestionService

router = APIRouter(tags=["ingest"])


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: UploadFile = File(...),
    service: IngestionService = Depends(get_ingestion_service),
) -> IngestResponse:
    filename = file.filename or "uploaded_file"
    content = await file.read()

    result = await service.ingest(filename=filename, content=content)

    return IngestResponse(
        file=result.file,
        chunks_ingested=result.chunks_ingested,
        document_url=result.document_url,
        message=result.message,
    )
