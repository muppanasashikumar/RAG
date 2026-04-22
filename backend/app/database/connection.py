from __future__ import annotations

from typing import Any
from urllib.parse import quote_plus, urlsplit, urlunsplit

from beanie import init_beanie
from pymongo import AsyncMongoClient
from pymongo.errors import CollectionInvalid

from app.models.documents import ChatDocument, ChatMessageDocument, RAGChunkDocument
from app.rag_settings import RAGSettings


class DatabaseManager:
    def __init__(self, settings: RAGSettings) -> None:
        self._settings = settings
        self._client: AsyncMongoClient[dict[str, Any]] | None = None
        self._initialized = False

    async def initialize(self) -> None:
        if self._initialized:
            return
        self._client = AsyncMongoClient(self._normalize_mongodb_uri(self._settings.mongodb_uri))
        database = self._client[self._settings.mongodb_database]
        await self._ensure_collections_exist(database=database)
        await init_beanie(
            database=database,
            document_models=[ChatDocument, ChatMessageDocument, RAGChunkDocument],
        )
        self._initialized = True

    async def _ensure_collections_exist(self, database: Any) -> None:
        existing_collections = await database.list_collection_names()
        required_collections = ["chats", "chat_messages", "rag_chunks"]
        for collection_name in required_collections:
            if collection_name in existing_collections:
                continue
            try:
                await database.create_collection(collection_name)
            except CollectionInvalid:
                # Safe race-condition guard if another worker created it first.
                continue

    def _normalize_mongodb_uri(self, uri: str) -> str:
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


database_manager = DatabaseManager(settings=RAGSettings())
