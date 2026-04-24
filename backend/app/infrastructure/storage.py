"""Document storage abstractions.

Defines a `DocumentStorage` interface so the ingestion service does not
depend on a particular backing store (local disk, S3, etc.).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
import mimetypes
from pathlib import Path
from urllib.parse import quote
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class DocumentStorage(ABC):
    """Persist uploaded documents and expose a retrievable URL."""

    @abstractmethod
    def save(self, filename: str, content: bytes) -> str:
        """Persist `content` and return the storage key/path."""

    @abstractmethod
    def public_url(self, filename: str) -> str:
        """Return a URL clients can use to fetch the document."""


class LocalDocumentStorage(DocumentStorage):
    """Persist files on the local filesystem and serve via FastAPI StaticFiles."""

    def __init__(self, base_dir: Path, public_prefix: str = "/documents") -> None:
        self._base_dir = base_dir
        self._public_prefix = public_prefix.rstrip("/")
        self._base_dir.mkdir(parents=True, exist_ok=True)

    @property
    def base_dir(self) -> Path:
        return self._base_dir

    def save(self, filename: str, content: bytes) -> str:
        path = self._base_dir / filename
        path.write_bytes(content)
        return str(path)

    def public_url(self, filename: str) -> str:
        return f"{self._public_prefix}/{quote(filename)}"


class SupabaseDocumentStorage(DocumentStorage):
    """Persist files in Supabase Storage and expose a public URL."""

    def __init__(
        self,
        *,
        supabase_url: str,
        bucket_name: str,
        service_role_key: str,
        object_prefix: str = "",
    ) -> None:
        self._supabase_url = supabase_url.rstrip("/")
        self._bucket_name = bucket_name
        self._service_role_key = service_role_key
        self._object_prefix = object_prefix.strip("/")

    def _object_name(self, filename: str) -> str:
        clean_name = filename.strip().replace("\\", "/").split("/")[-1] or "uploaded_file"
        if self._object_prefix:
            return f"{self._object_prefix}/{clean_name}"
        return clean_name

    def save(self, filename: str, content: bytes) -> str:
        object_name = self._object_name(filename)
        content_type, _ = mimetypes.guess_type(filename)
        upload_url = (
            f"{self._supabase_url}/storage/v1/object/"
            f"{quote(self._bucket_name)}/{quote(object_name, safe='/')}"
        )
        request = Request(
            upload_url,
            data=content,
            method="POST",
            headers={
                "apikey": self._service_role_key,
                "Authorization": f"Bearer {self._service_role_key}",
                "x-upsert": "true",
                "Content-Type": content_type or "application/octet-stream",
            },
        )
        try:
            with urlopen(request):
                pass
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase upload failed ({exc.code}): {body}") from exc
        return object_name

    def public_url(self, filename: str) -> str:
        object_name = self._object_name(filename)
        return (
            f"{self._supabase_url}/storage/v1/object/public/"
            f"{quote(self._bucket_name)}/{quote(object_name, safe='/')}"
        )
