"""Domain models.

Pure data containers representing core entities and value objects.
No I/O, no framework imports.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

RetrievalMode = Literal["vector", "hybrid", "fallback", "none"]


@dataclass(slots=True)
class Chunk:
    text: str
    page_number: int | None = None


@dataclass(slots=True)
class Document:
    file: str
    document_name: str
    document_url: str


@dataclass(slots=True)
class Citation:
    citation_id: int
    document_id: str
    source_filename: str
    page_number: int | None
    pdf_link_with_page: str
    content: str
    score: float | None


@dataclass(slots=True)
class IngestionResult:
    file: str
    chunks_ingested: int
    document_url: str
    message: str


@dataclass(slots=True)
class RetrievedChunk:
    file: str
    text: str
    page_number: int | None
    document_url: str
    document_name: str
    score: float | None


@dataclass(slots=True)
class RetrievalResult:
    chunks: list[RetrievedChunk] = field(default_factory=list)
    mode: RetrievalMode = "none"
