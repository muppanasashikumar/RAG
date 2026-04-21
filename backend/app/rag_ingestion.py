from __future__ import annotations

import hashlib
import mimetypes
import re
import uuid
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sentence_transformers import SentenceTransformer
from unstructured.partition.auto import partition

from app.rag_settings import RAGSettings


class RAGIngestionEngine:
    def __init__(
        self,
        settings: RAGSettings,
        embedder: SentenceTransformer,
        collection: Any,
    ) -> None:
        self.settings = settings
        self.embedder = embedder
        self.collection = collection

    async def ingest_document(self, file: UploadFile) -> dict[str, Any]:
        payload = await file.read()
        if not payload:
            raise ValueError("Uploaded file is empty.")

        suffix = self._resolve_file_suffix(file=file)
        self._validate_upload(payload=payload, suffix=suffix)

        file_hash = hashlib.sha256(payload).hexdigest()
        doc_id = file_hash[:16]
        stored_name = f"{doc_id}{suffix}"
        stored_path = self.settings.uploads_dir / stored_name

        if not stored_path.exists():
            stored_path.write_bytes(payload)

        existing = self.collection.get(where={"doc_id": doc_id}, limit=1)
        if existing.get("ids"):
            return {
                "document_id": doc_id,
                "filename": file.filename or stored_name,
                "pdf_url": f"/files/{stored_name}",
                "chunks_ingested": 0,
                "already_indexed": True,
            }

        chunks = self._extract_file_chunks(
            file_path=stored_path,
            doc_id=doc_id,
            file_url=f"/files/{stored_name}",
        )
        if not chunks:
            raise ValueError("Could not extract text from the uploaded file.")

        texts = [item["content"] for item in chunks]
        embeddings = self.embedder.encode(texts, normalize_embeddings=True).tolist()
        ids = [item["id"] for item in chunks]
        metadatas = [item["metadata"] for item in chunks]

        self.collection.add(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
        return {
            "document_id": doc_id,
            "filename": file.filename or stored_name,
            "pdf_url": f"/files/{stored_name}",
            "chunks_ingested": len(chunks),
            "already_indexed": False,
        }

    def _extract_file_chunks(
        self, file_path: Path, doc_id: str, file_url: str
    ) -> list[dict[str, Any]]:
        elements = partition(filename=str(file_path))
        chunks: list[dict[str, Any]] = []
        for element in elements:
            text = (getattr(element, "text", None) or "").strip()
            if not text:
                continue

            metadata = getattr(element, "metadata", None)
            page_number = (
                getattr(metadata, "page_number", None)
                or getattr(metadata, "page", None)
                or 1
            )
            semantic_chunks = self._semantic_chunk_text(text=text)
            for chunk_index, chunk in enumerate(semantic_chunks, start=1):
                chunks.append(
                    {
                        "id": str(uuid.uuid4()),
                        "content": chunk,
                        "metadata": {
                            "doc_id": doc_id,
                            "page_number": int(page_number),
                            "chunk_index": chunk_index,
                            "pdf_url": file_url,
                        },
                    }
                )
        return chunks

    def _semantic_chunk_text(self, text: str) -> list[str]:
        sentences = self._split_sentences(text=text)
        if not sentences:
            return []
        if len(sentences) == 1:
            return sentences

        sentence_embeddings = self.embedder.encode(sentences, normalize_embeddings=True)
        similarity_threshold = self.settings.semantic_similarity_threshold
        max_chunk_size = self.settings.chunk_size
        overlap_sentences = self.settings.semantic_chunk_overlap_sentences

        chunks: list[str] = []
        current_sentences: list[str] = [sentences[0]]
        current_size = len(sentences[0])

        for index in range(1, len(sentences)):
            similarity = float(sentence_embeddings[index - 1] @ sentence_embeddings[index])
            next_sentence = sentences[index]
            next_size = len(next_sentence)
            should_split = similarity < similarity_threshold or (
                current_size + 1 + next_size > max_chunk_size
            )

            if should_split:
                chunks.append(" ".join(current_sentences).strip())
                if overlap_sentences > 0:
                    current_sentences = current_sentences[-overlap_sentences:]
                else:
                    current_sentences = []
                current_size = sum(len(sentence) for sentence in current_sentences)

            current_sentences.append(next_sentence)
            current_size += (1 if current_size else 0) + next_size

        if current_sentences:
            chunks.append(" ".join(current_sentences).strip())
        return [chunk for chunk in chunks if chunk]

    def _split_sentences(self, text: str) -> list[str]:
        normalized = re.sub(r"\s+", " ", text).strip()
        if not normalized:
            return []
        # Keep sentence punctuation and split on trailing terminators + whitespace.
        return [part.strip() for part in re.split(r"(?<=[.!?])\s+", normalized) if part.strip()]

    def _resolve_file_suffix(self, file: UploadFile) -> str:
        filename = file.filename or ""
        suffix = Path(filename).suffix
        if suffix:
            return suffix.lower()

        inferred_suffix = mimetypes.guess_extension(file.content_type or "")
        if inferred_suffix:
            return inferred_suffix.lower()
        return ".bin"

    def _validate_upload(self, payload: bytes, suffix: str) -> None:
        max_size_bytes = self.settings.max_upload_size_mb * 1024 * 1024
        if len(payload) > max_size_bytes:
            raise ValueError(
                f"Uploaded file is too large. Max size is {self.settings.max_upload_size_mb} MB."
            )

        allowed_extensions = self.settings.allowed_upload_extensions
        if allowed_extensions and suffix.lower() not in allowed_extensions:
            allowed = ", ".join(allowed_extensions)
            raise ValueError(f"Unsupported file type '{suffix}'. Allowed: {allowed}")
