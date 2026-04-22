from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):

    OPENAI_API_KEY: str
    OPENAI_BASE_URL: str = "https://api.groq.com/openai/v1"

    MONGO_URI: str
    MONGO_DB_NAME: str

    VECTOR_COLLECTION: str = "vector_documents"

    S3_BUCKET: str

    DOCUMENTS_DIR: str = "documents_storage"

    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    LLM_MODEL: str = "openai/gpt-oss-20b"

    class Config:
        env_file = ".env"


settings = Settings()


def get_documents_dir() -> Path:
    return Path(settings.DOCUMENTS_DIR).expanduser().resolve()