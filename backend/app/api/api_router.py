from __future__ import annotations

from fastapi import APIRouter

from app.api.routes.auth_routes import router as auth_router
from app.api.routes.chat_routes import router as chat_router
from app.api.routes.rag_routes import router as rag_router

api_router = APIRouter()
api_router.include_router(rag_router)
api_router.include_router(chat_router)
api_router.include_router(auth_router)


@api_router.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
