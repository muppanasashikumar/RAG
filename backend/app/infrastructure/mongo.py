"""MongoDB infrastructure with Beanie ODM initialization."""

from __future__ import annotations

from beanie import init_beanie
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import settings
from app.infrastructure.mongo_models import ChatHistory, StoredDocument, VectorChunk


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
            document_models=[StoredDocument, VectorChunk, ChatHistory],
        )
        self._initialized = True


_provider: MongoProvider | None = None


async def get_mongo_provider() -> MongoProvider:
    global _provider
    if _provider is None:
        _provider = MongoProvider(settings.MONGO_URI, settings.MONGO_DB_NAME)
    await _provider.ping()
    await _provider.initialize()
    return _provider


async def initialize_collections() -> None:
    """Create required collections on startup so they appear in Atlas."""
    provider = await get_mongo_provider()
    existing = set(await provider.db.list_collection_names())
    required = {settings.VECTOR_COLLECTION, "chat_history", "documents"}
    for name in required - existing:
        await provider.db.create_collection(name)
