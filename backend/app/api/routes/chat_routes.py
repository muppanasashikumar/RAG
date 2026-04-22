from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.schemas.rag import ChatListResponse, ChatMessagesResponse
from app.services.chat_service import ChatService

router = APIRouter(prefix="/rag", tags=["rag"])
chat_service = ChatService()


@router.get("/chats", response_model=ChatListResponse)
async def list_recent_chats(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ChatListResponse:
    chats = await chat_service.list_recent_chats(limit=limit, offset=offset)
    return ChatListResponse(chats=chats)


@router.get("/chats/{chat_id}/messages", response_model=ChatMessagesResponse)
async def get_chat_messages(chat_id: str) -> ChatMessagesResponse:
    messages = await chat_service.get_chat_messages(chat_id=chat_id)
    return ChatMessagesResponse(chat_id=chat_id, messages=messages)
