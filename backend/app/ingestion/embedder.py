from app.core.config import settings
from sentence_transformers import SentenceTransformer

_model = SentenceTransformer(settings.EMBEDDING_MODEL)


def embed_text(text):
    embedding = _model.encode(text)
    return embedding.tolist()