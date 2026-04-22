import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import UploadFile

from app.core.config import get_documents_dir
from app.db.mongodb import documents_collection, vector_collection
from app.ingestion.embedder import embed_text
from app.ingestion.loader import load_document
from app.ingestion.splitter import split_documents


def ingest_file(file: UploadFile) -> dict:
    filename = file.filename or "uploaded_file"

    suffix = os.path.splitext(filename)[1]
    temp_file_path = ""
    file_bytes = b""
    documents_dir: Path = get_documents_dir()
    documents_dir.mkdir(parents=True, exist_ok=True)
    persisted_document_path = documents_dir / filename

    try:
        file_bytes = file.file.read()
        persisted_document_path.write_bytes(file_bytes)

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(file_bytes)
            temp_file_path = temp_file.name

        documents = load_document(temp_file_path)
        chunks = split_documents(documents)

        if not chunks:
            return {
                "file": filename,
                "chunks_ingested": 0,
                "message": "No text chunks were extracted from file.",
            }

        vector_collection.delete_many({"file": filename})
        existing_document = documents_collection.find_one({"file": filename}, {"_id": 0, "document_url": 1})
        stored_document_url = (
            existing_document.get("document_url") if existing_document and existing_document.get("document_url") else None
        )
        default_document_url = f"/documents/{quote(filename)}"
        document_url = stored_document_url if stored_document_url and not stored_document_url.startswith("/documents/") else default_document_url
        documents_collection.update_one(
            {"file": filename},
            {
                "$set": {
                    "file": filename,
                    "document_name": filename,
                    "document_url": document_url,
                    "updated_at": datetime.now(UTC),
                },
                "$setOnInsert": {"created_at": datetime.now(UTC)},
            },
            upsert=True,
        )

        payload = []
        for chunk in chunks:
            payload.append(
                {
                    "file": filename,
                    "text": chunk["text"],
                    "page_number": chunk.get("page_number"),
                    "document_url": document_url,
                    "embedding": embed_text(chunk["text"]),
                }
            )

        vector_collection.insert_many(payload)

        return {
            "file": filename,
            "chunks_ingested": len(payload),
            "document_url": document_url,
            "message": "File ingested successfully.",
        }
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
