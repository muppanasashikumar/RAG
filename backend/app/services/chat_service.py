from __future__ import annotations

from datetime import datetime
from typing import Any

from app.repositories.chat_repository import ChatRepository


class ChatService:
    def __init__(self, chat_repository: ChatRepository | None = None) -> None:
        self.chat_repository = chat_repository or ChatRepository()

    async def save_conversation_turn(
        self,
        *,
        chat_id: str,
        question: str,
        answer: str,
        citations: list[dict[str, Any]] | None,
        source: str,
        updated_at: datetime,
    ) -> dict[str, Any]:
        return await self.chat_repository.save_conversation_turn(
            chat_id=chat_id,
            question=question,
            answer=answer,
            citations=citations,
            source=source,
            updated_at=updated_at,
        )

    async def list_recent_chats(self, *, limit: int, offset: int) -> list[dict[str, Any]]:
        return await self.chat_repository.list_chats(limit=limit, offset=offset)

    async def get_chat_messages(self, chat_id: str) -> list[dict[str, Any]]:
        return await self.chat_repository.get_chat_messages(chat_id=chat_id)
