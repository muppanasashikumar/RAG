"""MongoDB infrastructure with Beanie ODM initialization."""

from __future__ import annotations

import asyncio

from beanie import init_beanie
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import settings
from app.infrastructure.mongo_models import ChatHistory, ChatMessage, StoredDocument, VectorChunk


class MongoProvider:
    """Lazy async MongoDB client wrapper."""

    def __init__(self, uri: str, db_name: str) -> None:
        self._client: AsyncMongoClient = AsyncMongoClient(uri)
        self._db: AsyncDatabase = self._client[db_name]
        self._initialized = False

    async def ping(self) -> None:
        await self._client.admin.command("ping")

    @property
    def client(self) -> AsyncMongoClient:
        return self._client

    @property
    def db(self) -> AsyncDatabase:
        return self._db

    async def initialize(self) -> None:
        if self._initialized:
            return
        await init_beanie(
            database=self._db,
            document_models=[StoredDocument, VectorChunk, ChatHistory, ChatMessage],
        )
        self._initialized = True


_providers_by_loop: dict[int, MongoProvider] = {}


async def get_mongo_provider() -> MongoProvider:
    loop_id = id(asyncio.get_running_loop())
    provider = _providers_by_loop.get(loop_id)
    if provider is None:
        provider = MongoProvider(settings.MONGO_URI, settings.MONGO_DB_NAME)
        _providers_by_loop[loop_id] = provider
    await provider.ping()
    await provider.initialize()
    return provider


async def initialize_collections() -> None:
    """Create required collections on startup so they appear in Atlas."""
    provider = await get_mongo_provider()
    existing = set(await provider.db.list_collection_names())
    required = {settings.VECTOR_COLLECTION, "chat_history", "chat_messages", "documents"}
    for name in required - existing:
        await provider.db.create_collection(name)
