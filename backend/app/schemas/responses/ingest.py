"""Response DTOs for the ingest endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field


class IngestResponse(BaseModel):
    file: str
    chunks_ingested: int = Field(..., ge=0)
    document_url: str
    message: str
