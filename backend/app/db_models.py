from __future__ import annotations

from datetime import datetime
from typing import Any

from beanie import Document
from pydantic import Field


class ChatDocument(Document):
    chat_id: str = Field(unique=True)
    title: str
    source: str
    status: str = "ready"
    created_at: datetime
    updated_at: datetime

    class Settings:
        name = "chats"
        indexes = ["chat_id", [("updated_at", -1)]]


class ChatMessageDocument(Document):
    chat_id: str
    role: str
    content: str
    citations: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime

    class Settings:
        name = "chat_messages"
        indexes = ["chat_id", [("chat_id", 1), ("created_at", 1)]]


class RAGChunkDocument(Document):
    chunk_id: str = Field(unique=True)
    doc_id: str
    source_filename: str
    page_number: int
    chunk_index: int
    pdf_url: str
    content: str
    embedding: list[float]

    class Settings:
        name = "rag_chunks"
        indexes = [
            "chunk_id",
            "doc_id",
            [("doc_id", 1), ("page_number", 1), ("chunk_index", 1)],
        ]
