"""Response DTOs for the ingest endpoint."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class IngestResponse(BaseModel):
    file: str
    chunks_ingested: int = Field(..., ge=0)
    document_url: str
    message: str


class IngestJobResponse(BaseModel):
    job_id: str
    file: str
    status: Literal["queued", "processing", "retrying", "completed", "failed"]
    message: str
    attempts: int = Field(..., ge=0)
    max_attempts: int = Field(..., ge=1)
    created_at: datetime
    updated_at: datetime


class IngestJobStatusResponse(BaseModel):
    job_id: str
    file: str
    status: Literal["queued", "processing", "retrying", "completed", "failed"]
    chunks_ingested: int = Field(..., ge=0)
    document_url: str
    message: str
    error: str | None = None
    attempts: int = Field(..., ge=0)
    max_attempts: int = Field(..., ge=1)
    failure_history: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
