from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypedDict

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class RAGSettings:
    uploads_dir: Path = Path(os.getenv("RAG_UPLOADS_DIR", "uploads"))
    db_dir: Path = Path(os.getenv("RAG_VECTOR_DB_DIR", "vector_db"))
    collection_name: str = os.getenv("RAG_COLLECTION_NAME", "documents")
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
