from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

router = APIRouter()

@router.post("/chat/stream")
async def chat_stream(
    query: str = Form(...),
    file: UploadFile | None = File(None),
):
    try:
        from app.rag.pipeline import rag_stream_pipeline
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"RAG pipeline initialization failed: {exc}",
        ) from exc
    return StreamingResponse(
        rag_stream_pipeline(query=query.strip(), file=file.filename if file else None),
        media_type="text/event-stream",
    )