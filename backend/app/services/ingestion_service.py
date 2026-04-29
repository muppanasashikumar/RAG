"""Ingestion use case.

Orchestrates:
  1. Persisting the uploaded file to durable storage.
  2. Loading and splitting the document into chunks.
  3. Embedding each chunk.
  4. Upserting the document metadata and replacing vector chunks for the file.
"""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import hashlib
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi.concurrency import run_in_threadpool
from langchain_core.documents import Document
from redis import Redis
from rq import Queue, Retry, get_current_job

from app.core.config import settings
from app.domain.exceptions import IngestionFailed
from app.domain.models import IngestionResult
from app.infrastructure.document_loader import detect_document_type, load_document
from app.infrastructure.document_splitter import split_documents
from app.infrastructure.embeddings import EmbeddingsClient
from app.infrastructure.storage import DocumentStorage
from app.repositories.documents_repository import DocumentsRepository
from app.repositories.vector_repository import VectorRepository

logger = logging.getLogger(__name__)

_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
_MAX_FILENAME_LENGTH = 180
_MAX_CHUNKS = 400
_MAX_CHUNK_CHARS = 2_000
_EMBED_BATCH_SIZE = 64
_JOB_KEY_PREFIX = "ingestion:job:"
_JOB_EVENTS_CHANNEL_PREFIX = "ingestion:events:"
_JOB_TTL_SECONDS = 7 * 24 * 60 * 60


@dataclass(slots=True)
class IngestionJobState:
    job_id: str
    file: str
    status: str
    chunks_ingested: int
    document_url: str
    message: str
    error: str | None
    attempts: int
    max_attempts: int
    failure_history: list[str]
    created_at: datetime
    updated_at: datetime


class IngestionService:
    def __init__(
        self,
        *,
        storage: DocumentStorage,
        embeddings: EmbeddingsClient,
        documents_repository: DocumentsRepository,
        vector_repository: VectorRepository,
        redis_client: Redis | None = None,
        ingestion_queue: Queue | None = None,
    ) -> None:
        self._storage = storage
        self._embeddings = embeddings
        self._documents = documents_repository
        self._vectors = vector_repository
        self._redis = redis_client
        self._queue = ingestion_queue
        self._max_retries, self._retry_intervals_seconds = self._retry_policy()

    async def ingest(self, *, filename: str, content: bytes) -> IngestionResult:
        safe_filename = self._sanitize_filename(filename)
        self._validate_content(content)

        try:
            storage_key = await run_in_threadpool(
                self._storage.save, safe_filename, content
            )
        except Exception as exc:
            logger.exception("Failed to persist uploaded file: %s", safe_filename)
            raise IngestionFailed(f"Unable to save file: {exc}") from exc

        return await self._process_saved_content(
            filename=safe_filename,
            storage_key=storage_key,
            content=content,
        )

    async def _process_saved_content(
        self,
        *,
        filename: str,
        storage_key: str,
        content: bytes,
    ) -> IngestionResult:
        content_hash_sha256 = hashlib.sha256(content).hexdigest()
        existing_document = await self._documents.find_by_file(filename)
        if (
            existing_document
            and existing_document.get("content_hash_sha256") == content_hash_sha256
        ):
            logger.info("Skipping reindex for unchanged file: %s", filename)
            return IngestionResult(
                file=filename,
                chunks_ingested=0,
                document_url=(
                    str(existing_document.get("document_url") or "")
                    or self._resolve_document_url(storage_key)
                ),
                message="File unchanged (same content hash); skipped reindex.",
            )

        chunks, file_metadata = await run_in_threadpool(self._extract_chunks, filename, content)
        if not chunks:
            logger.warning("No text extracted from %s", filename)
            return IngestionResult(
                file=filename,
                chunks_ingested=0,
                document_url="",
                message="No text chunks were extracted from file.",
            )

        document_url = self._resolve_document_url(storage_key)

        try:
            payload = await run_in_threadpool(
                self._build_chunk_payload,
                filename=filename,
                chunks=chunks,
                document_url=document_url,
                file_metadata=file_metadata,
            )
            await self._vectors.delete_by_file(filename)
            await self._vectors.insert_chunks(payload)
            await self._documents.upsert_document(
                file=filename,
                document_name=filename,
                document_url=document_url,
                content_hash_sha256=str(file_metadata.get("content_hash_sha256") or ""),
                document_type=str(file_metadata.get("document_type") or ""),
                file_size_bytes=int(file_metadata.get("file_size_bytes") or 0),
            )
        except Exception as exc:
            logger.exception("Failed to persist ingestion artifacts for %s", filename)
            raise IngestionFailed(
                "Document processing succeeded but indexing failed. Please retry."
            ) from exc

        logger.info(
            "Ingested %s chunks for file %s", len(payload), filename
        )
        return IngestionResult(
            file=filename,
            chunks_ingested=len(payload),
            document_url=document_url,
            message="File ingested successfully.",
        )

    async def enqueue_ingestion(self, *, filename: str, content: bytes) -> IngestionJobState:
        safe_filename = self._sanitize_filename(filename)
        self._validate_content(content)
        if self._redis is None or self._queue is None:
            raise IngestionFailed("Async ingestion is not configured.")
        try:
            storage_key = await run_in_threadpool(self._storage.save, safe_filename, content)
        except Exception as exc:
            logger.exception("Failed to persist uploaded file: %s", safe_filename)
            raise IngestionFailed(f"Unable to save file: {exc}") from exc
        now = datetime.now(UTC)
        job = IngestionJobState(
            job_id=uuid4().hex,
            file=safe_filename,
            status="queued",
            chunks_ingested=0,
            document_url="",
            message="Ingestion job queued.",
            error=None,
            attempts=0,
            max_attempts=self._max_retries + 1,
            failure_history=[],
            created_at=now,
            updated_at=now,
        )
        self._save_job(job)
        self._queue.enqueue(
            run_ingestion_job_task,
            kwargs={
                "job_id": job.job_id,
                "filename": safe_filename,
                "storage_key": storage_key,
            },
            job_id=job.job_id,
            retry=Retry(max=self._max_retries, interval=self._retry_intervals_seconds),
        )
        return job

    def get_ingestion_job(self, job_id: str) -> IngestionJobState | None:
        if self._redis is None:
            return None
        raw = self._redis.get(self._job_key(job_id))
        if raw is None:
            return None
        payload = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
        return IngestionJobState(
            job_id=payload["job_id"],
            file=payload["file"],
            status=payload["status"],
            chunks_ingested=int(payload["chunks_ingested"]),
            document_url=payload["document_url"],
            message=payload["message"],
            error=payload.get("error"),
            attempts=int(payload.get("attempts", 0)),
            max_attempts=int(payload.get("max_attempts", self._max_retries + 1)),
            failure_history=list(payload.get("failure_history", [])),
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
        )

    async def process_ingestion_job(
        self, *, job_id: str, filename: str, storage_key: str
    ) -> None:
        current = self.get_ingestion_job(job_id)
        attempts = (current.attempts + 1) if current else 1
        self._update_job(
            job_id,
            status="processing",
            attempts=attempts,
            message=f"Ingestion in progress (attempt {attempts}).",
            error=None,
        )
        try:
            content = await run_in_threadpool(self._storage.read, storage_key)
            self._validate_content(content)
            result = await self._process_saved_content(
                filename=filename,
                storage_key=storage_key,
                content=content,
            )
            self._update_job(
                job_id,
                status="completed",
                chunks_ingested=result.chunks_ingested,
                document_url=result.document_url,
                message=result.message,
                error=None,
            )
        except Exception as exc:
            current_job = get_current_job()
            retries_left = int(current_job.retries_left) if current_job and current_job.retries_left else 0
            current = self.get_ingestion_job(job_id)
            history = list(current.failure_history) if current else []
            history.append(f"{datetime.now(UTC).isoformat()} - {exc}")
            self._update_job(
                job_id,
                status="retrying" if retries_left > 0 else "failed",
                message=(
                    f"Ingestion failed; retrying ({retries_left} retries left)."
                    if retries_left > 0
                    else "Ingestion failed."
                ),
                error=str(exc),
                failure_history=history[-10:],
            )
            raise

    def _update_job(self, job_id: str, **changes: Any) -> None:
        current = self.get_ingestion_job(job_id)
        if current is None:
            return
        for key, value in changes.items():
            setattr(current, key, value)
        current.updated_at = datetime.now(UTC)
        self._save_job(current)

    def _save_job(self, job: IngestionJobState) -> None:
        if self._redis is None:
            return
        payload = asdict(job)
        payload["created_at"] = job.created_at.isoformat()
        payload["updated_at"] = job.updated_at.isoformat()
        serialized = json.dumps(payload)
        self._redis.setex(self._job_key(job.job_id), _JOB_TTL_SECONDS, serialized)
        self._redis.publish(self._job_events_channel(job.job_id), serialized)

    @staticmethod
    def _job_key(job_id: str) -> str:
        return f"{_JOB_KEY_PREFIX}{job_id}"

    @staticmethod
    def _job_events_channel(job_id: str) -> str:
        return f"{_JOB_EVENTS_CHANNEL_PREFIX}{job_id}"

    @staticmethod
    def _validate_content(content: bytes) -> None:
        if not content:
            raise IngestionFailed("Uploaded file is empty.")
        if len(content) > _MAX_FILE_SIZE_BYTES:
            raise IngestionFailed(
                f"File exceeds maximum size of {_MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB."
            )

    @staticmethod
    def _retry_policy() -> tuple[int, list[int]]:
        max_retries = max(0, int(settings.RQ_INGEST_MAX_RETRIES))
        raw = (settings.RQ_INGEST_RETRY_INTERVALS or "").strip()
        intervals = [10, 30, 90]
        if raw:
            parsed: list[int] = []
            for part in raw.split(","):
                token = part.strip()
                if not token:
                    continue
                try:
                    value = int(token)
                except ValueError:
                    continue
                if value > 0:
                    parsed.append(value)
            if parsed:
                intervals = parsed
        return max_retries, intervals

    def _extract_chunks(self, filename: str, content: bytes) -> tuple[list[Document], dict[str, Any]]:
        suffix = os.path.splitext(filename)[1]
        temp_file_path = ""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name

            documents = load_document(temp_file_path)
            chunks = split_documents(documents)
            document_type = detect_document_type(temp_file_path)
            file_hash = hashlib.sha256(content).hexdigest()
            file_metadata: dict[str, Any] = {
                "document_type": document_type,
                "content_hash_sha256": file_hash,
                "file_size_bytes": len(content),
                "source_filename": filename,
                "extracted_pages": len(documents),
                "ingested_at": datetime.now(UTC).isoformat(),
            }
            normalized: list[Document] = []
            for chunk in chunks:
                text = (chunk.page_content or "").strip()
                if not text:
                    continue
                chunk_meta = {
                    **(chunk.metadata or {}),
                    "document_type": document_type,
                    "content_hash_sha256": file_hash,
                    "file_size_bytes": len(content),
                    "source_filename": filename,
                }
                normalized.append(
                    Document(
                        page_content=text[:_MAX_CHUNK_CHARS],
                        metadata=chunk_meta,
                    )
                )
                if len(normalized) >= _MAX_CHUNKS:
                    logger.info(
                        "Chunk count capped at %s for %s", _MAX_CHUNKS, filename
                    )
                    break
            return normalized, file_metadata
        except Exception as exc:
            logger.exception("Failed to extract chunks from %s", filename)
            raise IngestionFailed(f"Unable to parse document: {exc}") from exc
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    def _resolve_document_url(self, storage_key: str) -> str:
        return self._storage.public_url(storage_key)

    def _build_chunk_payload(
        self,
        *,
        filename: str,
        chunks: list[Document],
        document_url: str,
        file_metadata: dict[str, Any],
    ) -> list[dict[str, Any]]:
        texts = [chunk.page_content for chunk in chunks]
        vectors: list[list[float]] = []
        for start in range(0, len(texts), _EMBED_BATCH_SIZE):
            batch = texts[start : start + _EMBED_BATCH_SIZE]
            vectors.extend(self._embeddings.embed_documents(batch))
        if len(vectors) != len(chunks):
            raise IngestionFailed("Embedding provider returned incomplete vectors.")
        payload: list[dict[str, Any]] = []
        for chunk, embedding in zip(chunks, vectors, strict=False):
            page_number = chunk.metadata.get("page_number")
            payload.append(
                {
                    "file": filename,
                    "text": chunk.page_content,
                    "page_number": page_number if isinstance(page_number, int) else None,
                    "document_url": document_url,
                    "document_type": file_metadata.get("document_type"),
                    "content_hash_sha256": file_metadata.get("content_hash_sha256"),
                    "file_size_bytes": file_metadata.get("file_size_bytes"),
                    "chunk_level": str(chunk.metadata.get("chunk_level") or "child"),
                    "chunk_id": chunk.metadata.get("chunk_id"),
                    "parent_id": chunk.metadata.get("parent_id"),
                    "parent_text": (
                        str(chunk.metadata.get("parent_text"))[:_MAX_CHUNK_CHARS]
                        if chunk.metadata.get("parent_text")
                        else None
                    ),
                    "metadata": {**file_metadata, **(chunk.metadata or {})},
                    "embedding": embedding,
                }
            )
        return payload

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        raw = (filename or "").strip()
        name = Path(raw).name or "uploaded_file"
        if len(name) > _MAX_FILENAME_LENGTH:
            stem = Path(name).stem[: _MAX_FILENAME_LENGTH - 20]
            suffix = Path(name).suffix[:16]
            name = f"{stem}{suffix}" or "uploaded_file"
        sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._-")
        return sanitized or "uploaded_file"


def run_ingestion_job_task(*, job_id: str, filename: str, storage_key: str) -> None:
    from app.core.dependencies import get_ingestion_service
    from app.infrastructure.mongo import initialize_collections

    import asyncio

    asyncio.run(
        _run_ingestion_job_with_initialized_collections(
            job_id=job_id, filename=filename, storage_key=storage_key
        )
    )


async def _run_ingestion_job_with_initialized_collections(
    *, job_id: str, filename: str, storage_key: str
) -> None:
    from app.core.dependencies import get_ingestion_service
    from app.infrastructure.mongo import initialize_collections

    await initialize_collections()
    service = get_ingestion_service()
    await service.process_ingestion_job(
        job_id=job_id,
        filename=filename,
        storage_key=storage_key,
    )
