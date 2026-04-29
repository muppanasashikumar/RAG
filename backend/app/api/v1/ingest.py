"""Ingest controller: accepts a file upload and delegates to the service."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from redis.exceptions import RedisError

from app.core.dependencies import get_ingestion_service, require_authenticated_request
from app.schemas.responses.ingest import (
    IngestJobResponse,
    IngestJobStatusResponse,
    IngestResponse,
)
from app.services.ingestion_service import IngestionService

router = APIRouter(tags=["ingest"], dependencies=[Depends(require_authenticated_request)])

_RETRY_AFTER_BY_STATUS_SECONDS: dict[str, int] = {
    "queued": 3,
    "processing": 5,
    "retrying": 8,
}
_JOB_EVENTS_CHANNEL_PREFIX = "ingestion:events:"


def _format_sse(event_name: str, payload: dict[str, object]) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload)}\n\n"


@router.post("/ingest/async", response_model=IngestJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_async(
    file: UploadFile = File(...),
    service: IngestionService = Depends(get_ingestion_service),
) -> IngestJobResponse:
    filename = file.filename or "uploaded_file"
    content = await file.read()
    job = await service.enqueue_ingestion(filename=filename, content=content)
    return IngestJobResponse(
        job_id=job.job_id,
        file=job.file,
        status=job.status,
        message=job.message,
        attempts=job.attempts,
        max_attempts=job.max_attempts,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/ingest/jobs/{job_id}", response_model=IngestJobStatusResponse)
async def get_ingest_job_status(
    job_id: str,
    response: Response,
    service: IngestionService = Depends(get_ingestion_service),
) -> IngestJobStatusResponse:
    job = service.get_ingestion_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ingestion job not found.",
        )
    retry_after = _RETRY_AFTER_BY_STATUS_SECONDS.get(job.status)
    if retry_after is not None:
        response.headers["Retry-After"] = str(retry_after)
    return IngestJobStatusResponse(
        job_id=job.job_id,
        file=job.file,
        status=job.status,
        chunks_ingested=job.chunks_ingested,
        document_url=job.document_url,
        message=job.message,
        error=job.error,
        attempts=job.attempts,
        max_attempts=job.max_attempts,
        failure_history=job.failure_history,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/ingest/jobs/{job_id}/events")
async def stream_ingest_job_status(
    job_id: str,
    request: Request,
    service: IngestionService = Depends(get_ingestion_service),
) -> StreamingResponse:
    initial_job = service.get_ingestion_job(job_id)
    if initial_job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ingestion job not found.",
        )

    redis_client = getattr(service, "_redis", None)
    if redis_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ingestion events are not available.",
        )

    channel = f"{_JOB_EVENTS_CHANNEL_PREFIX}{job_id}"

    async def event_stream():
        yield _format_sse("job-status", {
            "job_id": initial_job.job_id,
            "file": initial_job.file,
            "status": initial_job.status,
            "chunks_ingested": initial_job.chunks_ingested,
            "document_url": initial_job.document_url,
            "message": initial_job.message,
            "error": initial_job.error,
            "attempts": initial_job.attempts,
            "max_attempts": initial_job.max_attempts,
            "failure_history": initial_job.failure_history,
            "created_at": initial_job.created_at.isoformat(),
            "updated_at": initial_job.updated_at.isoformat(),
        })
        if initial_job.status in {"completed", "failed"}:
            return

        pubsub = redis_client.pubsub()
        try:
            await asyncio.to_thread(pubsub.subscribe, channel)
            while True:
                if await request.is_disconnected():
                    break
                message = await asyncio.to_thread(
                    pubsub.get_message,
                    True,
                    10.0,
                )
                if message is None:
                    yield ": keepalive\n\n"
                    continue
                raw_data = message.get("data")
                if isinstance(raw_data, bytes):
                    data = raw_data.decode("utf-8")
                elif isinstance(raw_data, str):
                    data = raw_data
                else:
                    continue
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    continue
                yield _format_sse("job-status", payload)
                if payload.get("status") in {"completed", "failed"}:
                    break
        except RedisError as exc:
            yield _format_sse("job-error", {"message": f"Failed to stream ingestion updates: {exc}"})
        finally:
            await asyncio.to_thread(pubsub.close)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
