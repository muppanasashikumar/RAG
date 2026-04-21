from __future__ import annotations

from pydantic import BaseModel, Field


class Citation(BaseModel):
    citation_id: int
    document_id: str
    page_number: int
    pdf_link_with_page: str
    content: str
    score: float = Field(ge=0, le=1)


class RAGResponse(BaseModel):
    answer: str
    reasoning: str
    citations: list[Citation]
