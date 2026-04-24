"""Chat history persistence repository."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.infrastructure.mongo_models import ChatHistory, ChatMessageRecord


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
        existing = await ChatHistory.find_one({"chat_id": chat_id})
        user_message = ChatMessageRecord(role="user", content=user_content)
        assistant_message = ChatMessageRecord(
            role="assistant",
            content=assistant_content,
            citations=citations,
            retrieval_mode=retrieval_mode,
        )
        if existing:
            existing.title = title
            existing.source = source
            existing.updated_at = now
            existing.messages.extend([user_message, assistant_message])
            await existing.save()
            return
        await ChatHistory(
            chat_id=chat_id,
            title=title,
            source=source,
            status="ready",
            messages=[user_message, assistant_message],
            updated_at=now,
        ).insert()

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
                    "messages": len(item.messages),
                }
            )
        return chats

    async def get_messages(self, chat_id: str) -> list[dict[str, Any]]:
        if not chat_id:
            return []
        item = await ChatHistory.find_one({"chat_id": chat_id})
        if not item:
            return []
        payload: list[dict[str, Any]] = []
        for message in item.messages:
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
