from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):

    OPENAI_API_KEY: str
    OPENAI_BASE_URL: str = "https://api.groq.com/openai/v1"

    MONGO_URI: str
    MONGO_DB_NAME: str

    VECTOR_COLLECTION: str = "vector_documents"

    SUPABASE_URL: str
    SUPABASE_STORAGE_BUCKET: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_OBJECT_PREFIX: str = "documents"
    DOCUMENT_STORAGE_PROVIDER: str = "supabase"

    DOCUMENTS_DIR: str = "documents_storage"

    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_CACHE_SIZE: int = 2_000
    DOCUMENT_EXTRACTION_MAX_WORKERS: int = 1
    INGEST_ENABLE_HI_RES_OCR: bool = False
    RERANKER_ENABLED: bool = False
    RERANKER_MODEL: str = "BAAI/bge-reranker-base"
    LLM_MODEL: str = "openai/gpt-oss-20b"
    RAG_RETRIEVAL_TIMEOUT_SECONDS: int = 25
    RAG_NEXT_TOKEN_TIMEOUT_SECONDS: int = 60
    API_AUTH_TOKEN: str | None = None
    CLERK_JWKS_URL: str | None = None
    CLERK_ISSUER: str | None = None
    CLERK_AUDIENCE: str | None = None
    CORS_ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_MAX_REQUESTS: int = 120
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    REDIS_URL: str = "redis://localhost:6379/0"
    RQ_INGEST_QUEUE_NAME: str = "ingestion"
    RQ_INGEST_MAX_RETRIES: int = 3
    RQ_INGEST_RETRY_INTERVALS: str = "10,30,90"

    class Config:
        env_file = ".env"


settings = Settings()


def get_documents_dir() -> Path:
    return Path(settings.DOCUMENTS_DIR).expanduser().resolve()