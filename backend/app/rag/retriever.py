from app.db.mongodb import documents_collection, vector_collection
from pymongo.errors import OperationFailure


def _tokenize(text: str) -> set[str]:
    return {token for token in text.lower().replace("\n", " ").split() if len(token) > 2}


def _project_fields():
    return {
        "_id": 0,
        "file": 1,
        "text": 1,
        "page_number": 1,
        "document_url": 1,
        "document_name": 1,
    }


def _rank_rows(rows, query_text, limit=5):
    if not rows:
        return []

    query_tokens = _tokenize(query_text or "")
    for row in rows:
        text_tokens = _tokenize(row.get("text", ""))
        overlap = len(query_tokens & text_tokens) if query_tokens else 0
        row["score"] = overlap

    rows.sort(key=lambda row: row.get("score", 0), reverse=True)
    return rows[:limit]


def _fallback_file_retrieve(query_text, file, limit=5):
    if not file:
        return []

    rows = list(vector_collection.find({"file": file}, _project_fields()))
    if rows:
        return _rank_rows(rows, query_text=query_text, limit=limit)

    # If exact filename lookup misses, try a case-insensitive exact match.
    rows = list(
        vector_collection.find(
            {"file": {"$regex": f"^{file}$", "$options": "i"}},
            _project_fields(),
        )
    )
    return _rank_rows(rows, query_text=query_text, limit=limit)


def _fallback_global_retrieve(query_text, limit=5):
    rows = list(vector_collection.find({}, _project_fields()).limit(500))
    return _rank_rows(rows, query_text=query_text, limit=limit)


def _resolve_document_metadata(file_name: str) -> dict:
    if not file_name:
        return {}

    document = documents_collection.find_one({"file": file_name}, {"_id": 0})
    if not document:
        document = documents_collection.find_one(
            {"file": {"$regex": f"^{file_name}$", "$options": "i"}},
            {"_id": 0},
        )
    if not document:
        return {}

    document_name = (
        document.get("document_name")
        or document.get("file_name")
        or document.get("filename")
        or document.get("title")
        or document.get("file")
    )
    document_url = document.get("document_url")
    return {
        "document_name": document_name,
        "document_url": document_url,
    }


def _enrich_docs_with_document_metadata(docs):
    metadata_cache: dict[str, dict] = {}
    for doc in docs:
        file_name = doc.get("file")
        if not file_name:
            continue

        if file_name not in metadata_cache:
            metadata_cache[file_name] = _resolve_document_metadata(file_name)
        metadata = metadata_cache[file_name]

        if metadata.get("document_url"):
            doc["document_url"] = metadata["document_url"]
        if metadata.get("document_name"):
            doc["document_name"] = metadata["document_name"]
        elif not doc.get("document_name"):
            doc["document_name"] = file_name


def retrieve(query_embedding, file=None, query_text=""):

    vector_search_stage = {
        "index": "vector_index",
        "path": "embedding",
        "queryVector": query_embedding,
        "numCandidates": 100,
        "limit": 5,
    }

    if file:
        vector_search_stage["filter"] = {
            "$or": [
                {"file": file},
                {"filename": file},
                {"file_name": file},
                {"source": file},
                {"metadata.source": file},
                {"metadata.filename": file},
                {"metadata.file_name": file},
            ]
        }

    pipeline = [
        {"$vectorSearch": vector_search_stage},
        {
            "$project": {
                "_id": 0,
                "file": 1,
                "text": 1,
                "page_number": 1,
                "document_url": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]

    try:
        docs = list(vector_collection.aggregate(pipeline))
    except OperationFailure as exc:
        # Atlas vector indexes can require explicit filter-path indexing.
        # If unavailable, skip vector-filter query and fall back gracefully.
        if "needs to be indexed as filter" in str(exc):
            docs = []
        else:
            raise
    if docs:
        _enrich_docs_with_document_metadata(docs)
        return docs, "vector"

    fallback_docs = _fallback_file_retrieve(query_text=query_text, file=file)
    if fallback_docs:
        _enrich_docs_with_document_metadata(fallback_docs)
        return fallback_docs, "fallback"
    global_docs = _fallback_global_retrieve(query_text=query_text)
    if global_docs:
        _enrich_docs_with_document_metadata(global_docs)
        return global_docs, "fallback"
    return [], "none"