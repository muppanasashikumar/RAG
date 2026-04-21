from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import quote_plus, urlsplit, urlunsplit

from beanie import init_beanie
from pymongo import AsyncMongoClient

from app.db_models import ChatDocument, ChatMessageDocument, RAGChunkDocument


class ChatHistoryStore:
    def __init__(self, mongodb_uri: str, mongodb_database: str) -> None:
        self.mongodb_uri = mongodb_uri
        self.mongodb_database = mongodb_database
        self._client: AsyncMongoClient[dict[str, Any]] | None = None

    async def initialize(self) -> None:
        self._client = AsyncMongoClient(self._normalize_mongodb_uri(self.mongodb_uri))
        database = self._client[self.mongodb_database]
        await init_beanie(
            database=database,
            document_models=[ChatDocument, ChatMessageDocument, RAGChunkDocument],
        )

    def _normalize_mongodb_uri(self, uri: str) -> str:
        # Atlas credentials often contain special characters; encode them if needed.
        parsed = urlsplit(uri)
        if parsed.scheme not in {"mongodb", "mongodb+srv"} or "@" not in parsed.netloc:
            return uri

        auth_part, host_part = parsed.netloc.rsplit("@", 1)
        if ":" not in auth_part:
            return uri

        username, password = auth_part.split(":", 1)
        encoded_username = quote_plus(username)
        encoded_password = quote_plus(password)
        if encoded_username == username and encoded_password == password:
            return uri

        safe_netloc = f"{encoded_username}:{encoded_password}@{host_part}"
        return urlunsplit(
            (parsed.scheme, safe_netloc, parsed.path, parsed.query, parsed.fragment)
        )

    async def save_conversation_turn(
        self,
        *,
        chat_id: str,
        question: str,
        answer: str,
        citations: list[dict[str, Any]] | None,
        source: str,
        updated_at: str,
    ) -> dict[str, Any]:
        title = question.strip()[:96] or "Untitled chat"
        timestamp = datetime.fromisoformat(updated_at)
        existing_chat = await ChatDocument.find_one(ChatDocument.chat_id == chat_id)
        if existing_chat is None:
            chat = ChatDocument(
                chat_id=chat_id,
                title=title,
                source=source,
                status="ready",
                created_at=timestamp,
                updated_at=timestamp,
            )
            await chat.insert()
        else:
            existing_chat.title = title
            existing_chat.source = source
            existing_chat.status = "ready"
            existing_chat.updated_at = timestamp
            await existing_chat.save()

        await ChatMessageDocument(
            chat_id=chat_id,
            role="user",
            content=question,
            citations=[],
            created_at=timestamp,
        ).insert()
        await ChatMessageDocument(
            chat_id=chat_id,
            role="assistant",
            content=answer,
            citations=citations or [],
            created_at=timestamp,
        ).insert()
        message_count = await ChatMessageDocument.find(
            ChatMessageDocument.chat_id == chat_id
        ).count()

        return {
            "id": chat_id,
            "title": title,
            "source": source,
            "updated_at": updated_at,
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
