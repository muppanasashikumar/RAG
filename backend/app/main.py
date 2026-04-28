"""Application entry point.

Responsibilities (only):
  * build the FastAPI app via the application factory,
  * register middleware, routers, exception handlers,
  * manage startup/shutdown via `lifespan`.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as v1_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.rate_limit import RateLimitMiddleware
from app.infrastructure.mongo import initialize_collections

logger = logging.getLogger(__name__)


def _get_allowed_origins() -> list[str]:
    configured = settings.CORS_ALLOWED_ORIGINS.strip()
    if not configured:
        return []
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    await initialize_collections()
    logger.info("RAG Backend started")
    yield
    logger.info("RAG Backend shutting down")


def create_app() -> FastAPI:
    app = FastAPI(title="RAG Backend", lifespan=lifespan)
    allowed_origins = _get_allowed_origins()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(
        RateLimitMiddleware,
        enabled=settings.RATE_LIMIT_ENABLED,
        max_requests=settings.RATE_LIMIT_MAX_REQUESTS,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    )

    register_exception_handlers(app)

    # Serve only versioned API routes.
    app.include_router(v1_router, prefix="/api/v1")

    return app


app = create_app()


