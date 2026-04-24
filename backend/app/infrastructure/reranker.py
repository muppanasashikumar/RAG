"""Optional local reranker client for retrieval refinement."""

from __future__ import annotations

from sentence_transformers import CrossEncoder

from app.core.config import settings


class RerankerClient:
    def __init__(self, model_name: str) -> None:
        self._model = CrossEncoder(model_name)

    def score(self, query: str, texts: list[str]) -> list[float]:
        if not texts:
            return []
        pairs = [[query, text] for text in texts]
        raw_scores = self._model.predict(pairs)
        return [float(value) for value in raw_scores]


_instance: RerankerClient | None = None


def get_reranker_client() -> RerankerClient | None:
    if not settings.RERANKER_ENABLED:
        return None
    global _instance
    if _instance is None:
        _instance = RerankerClient(settings.RERANKER_MODEL)
    return _instance
