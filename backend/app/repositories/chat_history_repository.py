"""Chat history persistence repository."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from beanie import PydanticObjectId
from app.infrastructure.mongo_models import ChatHistory, ChatMessage
from app.infrastructure.mongo import get_mongo_provider


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
    ) -> str | None:
        await get_mongo_provider()
        now = datetime.now(UTC)
        user_message = ChatMessage(
            chat_id=chat_id,
            role="user",
            content=user_content,
            created_at=now,
        )
        assistant_message = ChatMessage(
            chat_id=chat_id,
            role="assistant",
            content=assistant_content,
            citations=citations,
            retrieval_mode=retrieval_mode,
            created_at=now,
        )
        await ChatMessage.insert_many([user_message, assistant_message])
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
            return str(assistant_message.id) if assistant_message.id is not None else None
        existing.title = title
        existing.source = source
        existing.updated_at = now
        existing.message_count = max(existing.message_count, 0) + 2
        await existing.save()
        return str(assistant_message.id) if assistant_message.id is not None else None

    async def list_chats(self, *, limit: int, offset: int) -> list[dict[str, Any]]:
        await get_mongo_provider()
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
        await get_mongo_provider()
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
                "message_id": str(message.id),
                "role": message.role,
                "content": message.content,
            }
            if message.role == "assistant":
                record["citations"] = message.citations
                if message.retrieval_mode:
                    record["retrieval_mode"] = message.retrieval_mode
                if message.feedback in {"like", "dislike"}:
                    record["feedback"] = message.feedback
            payload.append(record)
        return payload

    async def set_message_feedback(
        self,
        *,
        chat_id: str,
        message_id: str,
        feedback: str | None,
    ) -> bool:
        await get_mongo_provider()
        try:
            object_id = PydanticObjectId(message_id)
        except Exception:
            return False
        message = await ChatMessage.find_one({"_id": object_id, "chat_id": chat_id, "role": "assistant"})
        if message is None:
            return False
        message.feedback = feedback if feedback in {"like", "dislike"} else None
        await message.save()
        return True

    async def increment_message_action(
        self,
        *,
        chat_id: str,
        message_id: str,
        action: str,
    ) -> bool:
        await get_mongo_provider()
        try:
            object_id = PydanticObjectId(message_id)
        except Exception:
            return False
        message = await ChatMessage.find_one({"_id": object_id, "chat_id": chat_id, "role": "assistant"})
        if message is None:
            return False
        if action == "copy":
            message.copied_count = max(message.copied_count, 0) + 1
        elif action == "share":
            message.shared_count = max(message.shared_count, 0) + 1
        else:
            return False
        await message.save()
        return True
