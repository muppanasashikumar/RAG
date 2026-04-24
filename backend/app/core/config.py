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
    RERANKER_ENABLED: bool = False
    RERANKER_MODEL: str = "BAAI/bge-reranker-base"
    LLM_MODEL: str = "openai/gpt-oss-20b"

    class Config:
        env_file = ".env"


settings = Settings()


def get_documents_dir() -> Path:
    return Path(settings.DOCUMENTS_DIR).expanduser().resolve()