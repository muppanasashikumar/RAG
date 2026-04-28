"""Optional local reranker client for retrieval refinement."""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class RerankerClient:
    def __init__(self, model_name: str) -> None:
        from sentence_transformers import CrossEncoder

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
        try:
            _instance = RerankerClient(settings.RERANKER_MODEL)
        except Exception:
            logger.exception("Failed to initialize reranker; continuing without reranker.")
            return None
    return _instance
