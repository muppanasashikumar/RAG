from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models.documents import ChatDocument, ChatMessageDocument


class ChatRepository:
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
        title = question.strip()[:96] or "Untitled chat"
        existing_chat = await ChatDocument.find_one(ChatDocument.chat_id == chat_id)
        if existing_chat is None:
            chat = ChatDocument(
                chat_id=chat_id,
                title=title,
                source=source,
                status="ready",
                created_at=updated_at,
                updated_at=updated_at,
            )
            await chat.insert()
        else:
            existing_chat.title = title
            existing_chat.source = source
            existing_chat.status = "ready"
            existing_chat.updated_at = updated_at
            await existing_chat.save()

        await ChatMessageDocument(
            chat_id=chat_id,
            role="user",
            content=question,
            citations=[],
            created_at=updated_at,
        ).insert()
        await ChatMessageDocument(
            chat_id=chat_id,
            role="assistant",
            content=answer,
            citations=citations or [],
            created_at=updated_at,
        ).insert()
        message_count = await ChatMessageDocument.find(
            ChatMessageDocument.chat_id == chat_id
        ).count()
        return {
            "id": chat_id,
            "title": title,
            "source": source,
            "updated_at": updated_at.isoformat(),
            "status": "ready",
            "messages": int(message_count),
        }

    async def list_chats(self, *, limit: int, offset: int) -> list[dict[str, Any]]:
        chats = (
            await ChatDocument.find_all()
            .sort(-ChatDocument.updated_at)
            .skip(offset)
            .limit(limit)
            .to_list()
        )
        result: list[dict[str, Any]] = []
        for chat in chats:
            messages_count = await ChatMessageDocument.find(
                ChatMessageDocument.chat_id == chat.chat_id
            ).count()
            result.append(
                {
                    "id": chat.chat_id,
                    "title": chat.title,
                    "source": chat.source,
                    "updated_at": chat.updated_at.isoformat(),
                    "status": chat.status,
                    "messages": int(messages_count),
                }
            )
        return result

    async def get_chat_messages(self, chat_id: str) -> list[dict[str, Any]]:
        messages = (
            await ChatMessageDocument.find(ChatMessageDocument.chat_id == chat_id)
            .sort(ChatMessageDocument.created_at)
            .to_list()
        )
        return [
            {
                "role": message.role,
                "content": message.content,
                "citations": message.citations,
                "created_at": message.created_at.isoformat(),
            }
            for message in messages
        ]
