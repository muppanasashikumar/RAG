from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from app.core.config import settings

# Atlas-compatible client configuration.
client = MongoClient(settings.MONGO_URI, server_api=ServerApi("1"))
client.admin.command("ping")

db = client[settings.MONGO_DB_NAME]

vector_collection = db[settings.VECTOR_COLLECTION]
chat_collection = db["chat_history"]
documents_collection = db["documents"]


def initialize_collections() -> None:
    """Create collections early so they are visible in Atlas."""
    existing_collections = set(db.list_collection_names())
    required_collections = {
        settings.VECTOR_COLLECTION,
        "chat_history",
        "documents",
    }

    for collection_name in required_collections - existing_collections:
        db.create_collection(collection_name)