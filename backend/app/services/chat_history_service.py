"""Chat history service."""

from __future__ import annotations

from typing import Any

from app.repositories.chat_history_repository import ChatHistoryRepository


class ChatHistoryService:
    def __init__(self, *, repository: ChatHistoryRepository) -> None:
        self._repository = repository

    async def save_turn(
        self,
        *,
        chat_id: str,
        title: str,
        source: str,
        user_content: str,
        assistant_content: str,
        citations: list[dict[str, Any]],
        retrieval_mode: str | None,
    ) -> None:
        await self._repository.append_turn(
            chat_id=chat_id,
            title=title,
            source=source,
            user_content=user_content,
            assistant_content=assistant_content,
            citations=citations,
            retrieval_mode=retrieval_mode,
        )

    async def list_chats(self, *, limit: int, offset: int) -> list[dict[str, Any]]:
        return await self._repository.list_chats(limit=limit, offset=offset)

    async def get_chat_messages(self, *, chat_id: str) -> list[dict[str, Any]]:
        return await self._repository.get_messages(chat_id)
