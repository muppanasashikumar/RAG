"""Beanie document models for MongoDB collections."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel

from app.core.config import settings


class StoredDocument(Document):
    file: str
    document_name: str
    document_url: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "documents"
        indexes = [
            IndexModel([("file", ASCENDING)], unique=True),
        ]


class VectorChunk(Document):
    file: str
    text: str
    chunk_level: str | None = None
    chunk_id: str | None = None
    parent_id: str | None = None
    parent_text: str | None = None
    page_number: int | None = None
    document_url: str | None = None
    documentUrl: str | None = None
    file_url: str | None = None
    fileUrl: str | None = None
    url: str | None = None
    document_name: str | None = None
    embedding: list[float] = Field(default_factory=list)
    score: float | None = None
    metadata: dict[str, Any] | None = None
    filename: str | None = None
    file_name: str | None = None
    source: str | None = None

    class Settings:
        name = settings.VECTOR_COLLECTION
        indexes = [
            IndexModel([("file", ASCENDING)]),
            IndexModel([("filename", ASCENDING)]),
            IndexModel([("file_name", ASCENDING)]),
            IndexModel([("source", ASCENDING)]),
            IndexModel([("metadata.source", ASCENDING)]),
            IndexModel([("metadata.filename", ASCENDING)]),
            IndexModel([("metadata.file_name", ASCENDING)]),
        ]


class ChatHistory(Document):
    chat_id: str
    title: str
    source: str
    status: str = "ready"
    message_count: int = 0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "chat_history"
        indexes = [
            IndexModel([("chat_id", ASCENDING)], unique=True),
            IndexModel([("updated_at", -1)]),
        ]


class ChatMessage(Document):
    chat_id: str
    role: str
    content: str
    citations: list[dict[str, Any]] = Field(default_factory=list)
    retrieval_mode: str | None = None
    feedback: str | None = None
    copied_count: int = 0
    shared_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "chat_messages"
        indexes = [
            IndexModel(
                [("chat_id", ASCENDING), ("created_at", ASCENDING)],
                name="idx_chat_id_created_at",
            ),
        ]
