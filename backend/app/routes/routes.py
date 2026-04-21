from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.rag import RAGService, RAGSettings
from app.routes.schemas import RAGResponse

router = APIRouter()
settings = RAGSettings()
rag_service = RAGService(settings=settings)


@router.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/rag/query", response_model=RAGResponse, tags=["rag"])
async def rag_query(
    question: Annotated[str, Form(...)],
    file: Annotated[UploadFile, File(...)],
) -> RAGResponse:
    try:
        ingest_result = await rag_service.ingest_document(file=file)
        result = await rag_service.query(
            question=question,
            document_id=ingest_result["document_id"],
        )
        return RAGResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {exc}") from exc
