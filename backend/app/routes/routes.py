from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.chat_history import ChatHistoryStore
from app.rag import RAGService, RAGSettings
from app.routes.schemas import ChatListResponse, ChatMessagesResponse, RAGResponse

router = APIRouter()
settings = RAGSettings()
rag_service = RAGService(settings=settings)
chat_store = ChatHistoryStore(settings.db_dir / "chat_history.sqlite3")


@router.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/rag/query", response_model=RAGResponse, tags=["rag"])
async def rag_query(
    question: Annotated[str, Form(...)],
    file: Annotated[UploadFile, File(...)],
    chat_id: Annotated[str | None, Form()] = None,
) -> RAGResponse:
    try:
        resolved_chat_id = (chat_id or "").strip() or f"chat-{uuid4().hex}"
        ingest_result = await rag_service.ingest_document(file=file)
        result = await rag_service.query(
            question=question,
            document_id=ingest_result["document_id"],
        )
        chat_store.save_conversation_turn(
            chat_id=resolved_chat_id,
            question=question,
            answer=str(result.get("answer", "")),
            citations=list(result.get("citations", [])),
            source=file.filename or "No document uploaded",
            updated_at=datetime.now(tz=UTC).isoformat(),
        )
        return RAGResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {exc}") from exc


@router.get("/rag/chats", response_model=ChatListResponse, tags=["rag"])
def list_recent_chats(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ChatListResponse:
    chats = chat_store.list_chats(limit=limit, offset=offset)
    return ChatListResponse(chats=chats)


@router.get("/rag/chats/{chat_id}/messages", response_model=ChatMessagesResponse, tags=["rag"])
def get_chat_messages(chat_id: str) -> ChatMessagesResponse:
    messages = chat_store.get_chat_messages(chat_id=chat_id)
    return ChatMessagesResponse(chat_id=chat_id, messages=messages)
