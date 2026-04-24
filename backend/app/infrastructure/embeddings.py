"""Embeddings client backed by LangChain integrations."""

from __future__ import annotations

from langchain_huggingface import HuggingFaceEmbeddings

from app.core.config import settings


class EmbeddingsClient:
    def __init__(self, model_name: str) -> None:
        self._model = HuggingFaceEmbeddings(model_name=model_name)

    def embed(self, text: str) -> list[float]:
        return self._model.embed_query(text)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._model.embed_documents(texts)


_instance: EmbeddingsClient | None = None


def get_embeddings_client() -> EmbeddingsClient:
    global _instance
    if _instance is None:
        _instance = EmbeddingsClient(settings.EMBEDDING_MODEL)
    return _instance
