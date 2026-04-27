"""Chat history persistence repository."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.infrastructure.mongo_models import ChatHistory, ChatMessage


class ChatHistoryRepository:
    async def append_turn(
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
        now = datetime.now(UTC)
        await ChatMessage.insert_many(
            [
                ChatMessage(
                    chat_id=chat_id,
                    role="user",
                    content=user_content,
                    created_at=now,
                ),
                ChatMessage(
                    chat_id=chat_id,
                    role="assistant",
                    content=assistant_content,
                    citations=citations,
                    retrieval_mode=retrieval_mode,
                    created_at=now,
                ),
            ]
        )
        existing = await ChatHistory.find_one({"chat_id": chat_id})
        if existing is None:
            await ChatHistory(
                chat_id=chat_id,
                title=title,
                source=source,
                status="ready",
                message_count=2,
                updated_at=now,
            ).insert()
            return
        existing.title = title
        existing.source = source
        existing.updated_at = now
        existing.message_count = max(existing.message_count, 0) + 2
        await existing.save()

    async def list_chats(self, *, limit: int, offset: int) -> list[dict[str, Any]]:
        cursor = (
            ChatHistory.find_all()
            .sort("-updated_at")
            .skip(max(offset, 0))
            .limit(max(limit, 1))
        )
        items = await cursor.to_list()
        chats: list[dict[str, Any]] = []
        for item in items:
            chats.append(
                {
                    "id": item.chat_id,
                    "title": item.title,
                    "source": item.source,
                    "updated_at": item.updated_at.isoformat(),
                    "status": item.status,
                    "messages": item.message_count,
                }
            )
        return chats

    async def get_messages(self, chat_id: str) -> list[dict[str, Any]]:
        if not chat_id:
            return []
        payload: list[dict[str, Any]] = []
        rows = (
            await ChatMessage.find({"chat_id": chat_id})
            .sort("created_at")
            .to_list()
        )
        for message in rows:
            record = {
                "role": message.role,
                "content": message.content,
            }
            if message.role == "assistant":
                record["citations"] = message.citations
                if message.retrieval_mode:
                    record["retrieval_mode"] = message.retrieval_mode
            payload.append(record)
        return payload
