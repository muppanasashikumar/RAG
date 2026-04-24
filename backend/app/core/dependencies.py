"""FastAPI dependency providers (composition root).

This module is the single place where concrete infrastructure is wired into
services and repositories.  API controllers depend only on these providers via
`fastapi.Depends`, which keeps them free of construction details.
"""

from __future__ import annotations

from functools import lru_cache

from app.core.config import get_documents_dir, settings
from app.infrastructure.embeddings import EmbeddingsClient, get_embeddings_client
from app.infrastructure.llm import LLMClient, get_llm_client
from app.infrastructure.reranker import RerankerClient, get_reranker_client
from app.infrastructure.storage import (
    DocumentStorage,
    LocalDocumentStorage,
    SupabaseDocumentStorage,
)
from app.repositories.chat_history_repository import ChatHistoryRepository
from app.repositories.documents_repository import DocumentsRepository
from app.repositories.vector_repository import VectorRepository
from app.services.chat_history_service import ChatHistoryService
from app.services.ingestion_service import IngestionService
from app.services.rag_service import RagService


@lru_cache(maxsize=1)
def get_document_storage() -> DocumentStorage:
    provider = settings.DOCUMENT_STORAGE_PROVIDER.strip().lower()
    if provider == "local":
        return LocalDocumentStorage(base_dir=get_documents_dir())
    if provider == "supabase":
        return SupabaseDocumentStorage(
            supabase_url=settings.SUPABASE_URL,
            bucket_name=settings.SUPABASE_STORAGE_BUCKET,
            service_role_key=settings.SUPABASE_SERVICE_ROLE_KEY,
            object_prefix=settings.SUPABASE_OBJECT_PREFIX,
        )
    raise ValueError(f"Unsupported DOCUMENT_STORAGE_PROVIDER: {provider}")


def get_documents_repository() -> DocumentsRepository:
    return DocumentsRepository()


def get_vector_repository() -> VectorRepository:
    return VectorRepository()


def get_chat_history_repository() -> ChatHistoryRepository:
    return ChatHistoryRepository()


def get_embeddings() -> EmbeddingsClient:
    return get_embeddings_client()


def get_llm() -> LLMClient:
    return get_llm_client()


def get_reranker() -> RerankerClient | None:
    return get_reranker_client()


def get_ingestion_service() -> IngestionService:
    return IngestionService(
        storage=get_document_storage(),
        embeddings=get_embeddings(),
        documents_repository=get_documents_repository(),
        vector_repository=get_vector_repository(),
    )


def get_rag_service() -> RagService:
    return RagService(
        embeddings=get_embeddings(),
        llm=get_llm(),
        reranker=get_reranker(),
        vector_repository=get_vector_repository(),
        documents_repository=get_documents_repository(),
    )


def get_chat_history_service() -> ChatHistoryService:
    return ChatHistoryService(repository=get_chat_history_repository())
