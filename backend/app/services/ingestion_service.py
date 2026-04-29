"""Ingestion use case.

Orchestrates:
  1. Persisting the uploaded file to durable storage.
  2. Loading and splitting the document into chunks.
  3. Embedding each chunk.
  4. Upserting the document metadata and replacing vector chunks for the file.
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Any

from fastapi.concurrency import run_in_threadpool
from langchain_core.documents import Document

from app.domain.exceptions import IngestionFailed
from app.domain.models import IngestionResult
from app.infrastructure.document_loader import load_document
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


class IngestionService:
    def __init__(
        self,
        *,
        storage: DocumentStorage,
        embeddings: EmbeddingsClient,
        documents_repository: DocumentsRepository,
        vector_repository: VectorRepository,
    ) -> None:
        self._storage = storage
        self._embeddings = embeddings
        self._documents = documents_repository
        self._vectors = vector_repository

    async def ingest(self, *, filename: str, content: bytes) -> IngestionResult:
        safe_filename = self._sanitize_filename(filename)
        if not content:
            raise IngestionFailed("Uploaded file is empty.")
        if len(content) > _MAX_FILE_SIZE_BYTES:
            raise IngestionFailed(
                f"File exceeds maximum size of {_MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB."
            )

        try:
            storage_key = await run_in_threadpool(
                self._storage.save, safe_filename, content
            )
        except Exception as exc:
            logger.exception("Failed to persist uploaded file: %s", safe_filename)
            raise IngestionFailed(f"Unable to save file: {exc}") from exc

        chunks = await run_in_threadpool(self._extract_chunks, safe_filename, content)
        if not chunks:
            logger.warning("No text extracted from %s", safe_filename)
            return IngestionResult(
                file=safe_filename,
                chunks_ingested=0,
                document_url="",
                message="No text chunks were extracted from file.",
            )

        document_url = self._resolve_document_url(storage_key)

        try:
            payload = await run_in_threadpool(
                self._build_chunk_payload,
                filename=safe_filename,
                chunks=chunks,
                document_url=document_url,
            )
            await self._vectors.delete_by_file(safe_filename)
            await self._vectors.insert_chunks(payload)
            await self._documents.upsert_document(
                file=safe_filename,
                document_name=safe_filename,
                document_url=document_url,
            )
        except Exception as exc:
            logger.exception("Failed to persist ingestion artifacts for %s", safe_filename)
            raise IngestionFailed(
                "Document processing succeeded but indexing failed. Please retry."
            ) from exc

        logger.info(
            "Ingested %s chunks for file %s", len(payload), safe_filename
        )
        return IngestionResult(
            file=safe_filename,
            chunks_ingested=len(payload),
            document_url=document_url,
            message="File ingested successfully.",
        )

    def _extract_chunks(self, filename: str, content: bytes) -> list[Document]:
        suffix = os.path.splitext(filename)[1]
        temp_file_path = ""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name

            documents = load_document(temp_file_path)
            chunks = split_documents(documents)
            normalized: list[Document] = []
            for chunk in chunks:
                text = (chunk.page_content or "").strip()
                if not text:
                    continue
                normalized.append(
                    Document(
                        page_content=text[:_MAX_CHUNK_CHARS],
                        metadata=chunk.metadata or {},
                    )
                )
                if len(normalized) >= _MAX_CHUNKS:
                    logger.info(
                        "Chunk count capped at %s for %s", _MAX_CHUNKS, filename
                    )
                    break
            return normalized
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
                    "chunk_level": str(chunk.metadata.get("chunk_level") or "child"),
                    "chunk_id": chunk.metadata.get("chunk_id"),
                    "parent_id": chunk.metadata.get("parent_id"),
                    "parent_text": (
                        str(chunk.metadata.get("parent_text"))[:_MAX_CHUNK_CHARS]
                        if chunk.metadata.get("parent_text")
                        else None
                    ),
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
