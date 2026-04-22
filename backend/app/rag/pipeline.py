import json

from app.ingestion.embedder import embed_text
from app.rag.retriever import retrieve
from app.rag.generator import stream_answer


def rag_stream_pipeline(query, file=None):
    query_embedding = embed_text(query)
    docs, retrieval_mode = retrieve(query_embedding, file=file, query_text=query)
    if file and not docs:
        message = (
            f"I couldn't find indexed content for '{file}'. "
            "Please re-upload the document and wait for indexing to finish."
        )
        yield f"data: {json.dumps({'type': 'token', 'content': message})}\n\n"
        yield (
            f"data: {json.dumps({'type': 'citations', 'citations': [], 'retrieval_mode': retrieval_mode})}\n\n"
        )
        yield "data: [DONE]\n\n"
        return

    context = "\n".join([doc.get("text", "") for doc in docs if doc.get("text")])

    citations = []
    for index, doc in enumerate(docs, start=1):
        document_name = doc.get("document_name") or doc.get("file", "unknown")
        citations.append(
            {
                "citation_id": index,
                "document_id": doc.get("file", "unknown"),
                "source_filename": document_name,
                "page_number": doc.get("page_number"),
                "pdf_link_with_page": doc.get("document_url", ""),
                "content": doc.get("text", ""),
                "score": doc.get("score"),
            }
        )

    for token in stream_answer(context, query):
        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

    yield (
        f"data: {json.dumps({'type': 'citations', 'citations': citations, 'retrieval_mode': retrieval_mode})}\n\n"
    )
    yield "data: [DONE]\n\n"