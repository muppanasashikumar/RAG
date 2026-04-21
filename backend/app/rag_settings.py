from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, TypedDict

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class RAGSettings:
    chunk_size: int = int(os.getenv("RAG_CHUNK_SIZE", "900"))
    chunk_overlap: int = int(os.getenv("RAG_CHUNK_OVERLAP", "150"))
    semantic_similarity_threshold: float = float(
        os.getenv("RAG_SEMANTIC_SIMILARITY_THRESHOLD", "0.42")
    )
    semantic_chunk_overlap_sentences: int = int(
        os.getenv("RAG_SEMANTIC_CHUNK_OVERLAP_SENTENCES", "1")
    )
    top_k: int = int(os.getenv("RAG_TOP_K", "5"))
    hybrid_candidate_multiplier: int = int(os.getenv("RAG_HYBRID_CANDIDATE_MULTIPLIER", "3"))
    hybrid_dense_weight: float = float(os.getenv("RAG_HYBRID_DENSE_WEIGHT", "0.6"))
    hybrid_keyword_weight: float = float(os.getenv("RAG_HYBRID_KEYWORD_WEIGHT", "0.25"))
    hybrid_lexical_weight: float = float(os.getenv("RAG_HYBRID_LEXICAL_WEIGHT", "0.15"))
    embedding_model: str = os.getenv(
        "RAG_EMBEDDING_MODEL",
        "sentence-transformers/all-MiniLM-L6-v2",
    )
    llm_base_url: str = os.getenv("RAG_LLM_BASE_URL", "http://localhost:11434")
    llm_model: str = os.getenv("RAG_LLM_MODEL", "gpt-oss:120b")
    llm_provider: str = os.getenv("RAG_LLM_PROVIDER", "openai_compatible")
    llm_api_key: str | None = os.getenv("RAG_LLM_API_KEY")
    llm_reasoning_effort: str = os.getenv("RAG_LLM_REASONING_EFFORT", "medium")
    llm_timeout_seconds: float = float(os.getenv("RAG_LLM_TIMEOUT_SECONDS", "120"))
    mongodb_uri: str = os.getenv("RAG_MONGODB_URI", "mongodb://localhost:27017")
    mongodb_database: str = os.getenv("RAG_MONGODB_DATABASE", "rag_app")
    mongodb_vector_index_name: str = os.getenv(
        "RAG_MONGODB_VECTOR_INDEX_NAME", "rag_chunks_vector_index"
    )
    mongodb_use_vector_search: bool = (
        os.getenv("RAG_MONGODB_USE_VECTOR_SEARCH", "false").strip().lower() == "true"
    )
    mongodb_vector_num_candidates: int = int(
        os.getenv("RAG_MONGODB_VECTOR_NUM_CANDIDATES", "100")
    )
    celery_broker_url: str = os.getenv("RAG_CELERY_BROKER_URL", "redis://localhost:6379/0")
    celery_result_backend: str = os.getenv(
        "RAG_CELERY_RESULT_BACKEND", "redis://localhost:6379/1"
    )
    max_upload_size_mb: int = int(os.getenv("RAG_MAX_UPLOAD_SIZE_MB", "25"))
    allowed_upload_extensions: tuple[str, ...] = tuple(
        ext.strip().lower()
        for ext in os.getenv(
            "RAG_ALLOWED_UPLOAD_EXTENSIONS",
            ".pdf,.txt,.md,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.html,.htm,.xml,.json,.rtf,.odt",
        ).split(",")
        if ext.strip()
    )


class RAGState(TypedDict, total=False):
    question: str
    document_id: str | None
    context: str
    citations: list[dict[str, Any]]
    answer: str
    reasoning: str
