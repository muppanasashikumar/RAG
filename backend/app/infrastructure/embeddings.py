"""Embeddings client backed by LangChain integrations."""

from __future__ import annotations

from collections import OrderedDict
import hashlib
from threading import RLock

from langchain_huggingface import HuggingFaceEmbeddings

from app.core.config import settings


class EmbeddingsClient:
    def __init__(self, model_name: str, *, cache_size: int = 20_000) -> None:
        self._model = HuggingFaceEmbeddings(model_name=model_name)
        self._cache_size = max(0, cache_size)
        self._cache: OrderedDict[str, list[float]] = OrderedDict()
        self._cache_lock = RLock()

    def embed(self, text: str) -> list[float]:
        cache_key = self._cache_key(text)
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached
        embedding = self._model.embed_query(text)
        self._cache_set(cache_key, embedding)
        return embedding

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        results: list[list[float] | None] = [None] * len(texts)
        missing_positions: dict[str, list[int]] = {}
        uncached_texts: list[str] = []
        uncached_keys: list[str] = []

        for index, text in enumerate(texts):
            cache_key = self._cache_key(text)
            cached = self._cache_get(cache_key)
            if cached is not None:
                results[index] = cached
                continue
            if cache_key not in missing_positions:
                missing_positions[cache_key] = []
                uncached_texts.append(text)
                uncached_keys.append(cache_key)
            missing_positions[cache_key].append(index)

        if uncached_texts:
            generated = self._model.embed_documents(uncached_texts)
            if len(generated) != len(uncached_keys):
                raise ValueError("Embedding provider returned incomplete vectors.")
            for cache_key, embedding in zip(uncached_keys, generated, strict=True):
                self._cache_set(cache_key, embedding)
                for pos in missing_positions[cache_key]:
                    results[pos] = embedding

        if any(vector is None for vector in results):
            raise ValueError("Embedding cache failed to resolve all vectors.")
        return [vector for vector in results if vector is not None]

    @staticmethod
    def _cache_key(text: str) -> str:
        # Hashing avoids storing large chunk text in memory while still caching exact repeats.
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _cache_get(self, key: str) -> list[float] | None:
        if self._cache_size <= 0:
            return None
        with self._cache_lock:
            value = self._cache.pop(key, None)
            if value is None:
                return None
            self._cache[key] = value
            return value

    def _cache_set(self, key: str, value: list[float]) -> None:
        if self._cache_size <= 0:
            return
        with self._cache_lock:
            if key in self._cache:
                self._cache.pop(key, None)
            self._cache[key] = value
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)


_instance: EmbeddingsClient | None = None


def get_embeddings_client() -> EmbeddingsClient:
    global _instance
    if _instance is None:
        _instance = EmbeddingsClient(
            settings.EMBEDDING_MODEL,
            cache_size=settings.EMBEDDING_CACHE_SIZE,
        )
    return _instance
