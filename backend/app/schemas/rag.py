from __future__ import annotations

from pydantic import BaseModel, Field


class Citation(BaseModel):
    citation_id: int
    document_id: str
    source_filename: str
    page_number: int
    pdf_link_with_page: str
    content: str
    score: float = Field(ge=0, le=1)


class ReasoningStep(BaseModel):
    step: int
    title: str
    detail: str


class RAGResponse(BaseModel):
    answer: str
    reasoning: str
    citations: list[Citation]
    reasoning_steps: list[ReasoningStep]


class IngestedDocument(BaseModel):
    document_id: str
    filename: str
    pdf_url: str
    chunks_ingested: int
    already_indexed: bool


class IngestionTask(BaseModel):
    task_id: str
    filename: str
    status: str


class BatchIngestResponse(BaseModel):
    tasks: list[IngestionTask]


class IngestionTaskStatusResponse(BaseModel):
    task_id: str
    status: str
    result: IngestedDocument | None = None
    error: str | None = None


class IndexedDocument(BaseModel):
    document_id: str
    source_filename: str
    pdf_url: str
    chunks: int
    status: str


class IndexedDocumentsResponse(BaseModel):
    total_documents: int
    documents: list[IndexedDocument]


class ChatSummary(BaseModel):
    id: str
    title: str
    source: str
    updated_at: str
    status: str
    messages: int


class ChatListResponse(BaseModel):
    chats: list[ChatSummary]


class ChatMessage(BaseModel):
    role: str
    content: str
    citations: list[Citation] = Field(default_factory=list)
    created_at: str


class ChatMessagesResponse(BaseModel):
    chat_id: str
    messages: list[ChatMessage]
