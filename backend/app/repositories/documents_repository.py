"""Documents collection repository."""

from __future__ import annotations

from datetime import UTC, datetime

from app.infrastructure.mongo_models import StoredDocument

_URL_CANDIDATE_KEYS = ("document_url", "documentUrl", "file_url", "fileUrl", "url")


class DocumentsRepository:
    async def find_by_file(self, file: str) -> dict | None:
        if not file:
            return None
        doc = await StoredDocument.find_one({"file": file})
        if doc:
            return doc.model_dump(exclude={"id"})
        regex_doc = await StoredDocument.find_one(
            {"file": {"$regex": f"^{file}$", "$options": "i"}}
        )
        if regex_doc:
            return regex_doc.model_dump(exclude={"id"})
        return None

    async def get_stored_document_url(self, file: str) -> str | None:
        if not file:
            return None
        document = await self.find_by_file(file)
        if not document:
            return None
        for key in _URL_CANDIDATE_KEYS:
            value = document.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    async def upsert_document(
        self,
        *,
        file: str,
        document_name: str,
        document_url: str,
        content_hash_sha256: str | None = None,
        document_type: str | None = None,
        file_size_bytes: int | None = None,
    ) -> None:
        now = datetime.now(UTC)
        existing = await StoredDocument.find_one({"file": file})
        if existing:
            existing.document_name = document_name
            existing.document_url = document_url
            existing.content_hash_sha256 = content_hash_sha256
            existing.document_type = document_type
            existing.file_size_bytes = file_size_bytes
            existing.updated_at = now
            await existing.save()
            return
        await StoredDocument(
            file=file,
            document_name=document_name,
            document_url=document_url,
            content_hash_sha256=content_hash_sha256,
            document_type=document_type,
            file_size_bytes=file_size_bytes,
            created_at=now,
            updated_at=now,
        ).insert()
