"""Chat controller: streams RAG-grounded answers via Server-Sent Events."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.core.dependencies import (
    get_chat_history_service,
    get_rag_service,
    require_authenticated_request,
)
from app.services.rag_service import RagService
from app.services.chat_history_service import ChatHistoryService

router = APIRouter(tags=["chat"], dependencies=[Depends(require_authenticated_request)])


class MessageFeedbackPayload(BaseModel):
    feedback: Literal["like", "dislike"] | None = None


class MessageActionPayload(BaseModel):
    action: Literal["copy", "share"]


@router.post("/chat/stream")
async def chat_stream(
    request: Request,
    query: str = Form(...),
    file: UploadFile | None = File(None),
    chat_id: str | None = Form(None),
    response_language: str | None = Form(None),
    service: RagService = Depends(get_rag_service),
    history_service: ChatHistoryService = Depends(get_chat_history_service),
) -> StreamingResponse:
    _ = response_language
    file_name = file.filename if file else None
    resolved_chat_id = (chat_id or "").strip()
    chat_history = (
        await history_service.get_chat_messages(chat_id=resolved_chat_id)
        if resolved_chat_id
        else []
    )

    async def event_stream() -> AsyncIterator[str]:
        events = service.stream_answer(
            query=query.strip(),
            file=file_name,
            chat_history=chat_history,
            should_abort=request.is_disconnected,
        )
        assistant_content = ""
        citations: list[dict[str, Any]] = []
        retrieval_mode: str | None = None
        try:
            async for event in events:
                if await request.is_disconnected():
                    break
                if event.get("type") == "token" and isinstance(event.get("content"), str):
                    assistant_content += event["content"]
                if event.get("type") == "citations":
                    raw_citations = event.get("citations")
                    citations = raw_citations if isinstance(raw_citations, list) else []
                    mode = event.get("retrieval_mode")
                    retrieval_mode = mode if isinstance(mode, str) else None
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            await events.aclose()
        if await request.is_disconnected():
            return
        if resolved_chat_id and assistant_content.strip():
            title = query.strip()
            if len(title) > 64:
                title = f"{title[:64].rstrip()}..."
            source = file_name or "Indexed documents"
            assistant_message_id = await history_service.save_turn(
                chat_id=resolved_chat_id,
                title=title or "Untitled document chat",
                source=source,
                user_content=query.strip(),
                assistant_content=assistant_content.strip(),
                citations=citations,
                retrieval_mode=retrieval_mode,
            )
            if assistant_message_id:
                yield (
                    "data: "
                    + json.dumps(
                        {
                            "type": "persisted",
                            "chat_id": resolved_chat_id,
                            "assistant_message_id": assistant_message_id,
                        }
                    )
                    + "\n\n"
                )
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/rag/chats")
async def list_recent_chats(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    history_service: ChatHistoryService = Depends(get_chat_history_service),
) -> JSONResponse:
    chats = await history_service.list_chats(limit=limit, offset=offset)
    return JSONResponse(content={"chats": chats})


@router.get("/rag/chats/{chat_id}/messages")
async def get_chat_messages(
    chat_id: str,
    history_service: ChatHistoryService = Depends(get_chat_history_service),
) -> JSONResponse:
    messages = await history_service.get_chat_messages(chat_id=chat_id)
    return JSONResponse(content={"messages": messages})


@router.post("/rag/chats/{chat_id}/messages/{message_id}/feedback")
async def set_message_feedback(
    chat_id: str,
    message_id: str,
    payload: MessageFeedbackPayload,
    history_service: ChatHistoryService = Depends(get_chat_history_service),
) -> JSONResponse:
    updated = await history_service.set_message_feedback(
        chat_id=chat_id,
        message_id=message_id,
        feedback=payload.feedback,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Message not found")
    return JSONResponse(content={"ok": True, "feedback": payload.feedback})


@router.post("/rag/chats/{chat_id}/messages/{message_id}/actions")
async def track_message_action(
    chat_id: str,
    message_id: str,
    payload: MessageActionPayload,
    history_service: ChatHistoryService = Depends(get_chat_history_service),
) -> JSONResponse:
    tracked = await history_service.increment_message_action(
        chat_id=chat_id,
        message_id=message_id,
        action=payload.action,
    )
    if not tracked:
        raise HTTPException(status_code=404, detail="Message not found")
    return JSONResponse(content={"ok": True})
