"""Application entry point.

Responsibilities (only):
  * build the FastAPI app via the application factory,
  * register middleware, routers, exception handlers,
  * manage startup/shutdown via `lifespan`.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1 import router as v1_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.rate_limit import limiter
from app.infrastructure.embeddings import get_embeddings_client
from app.infrastructure.mongo import initialize_collections
from app.infrastructure.reranker import get_reranker_client

logger = logging.getLogger(__name__)


def _get_allowed_origins() -> list[str]:
    configured = settings.CORS_ALLOWED_ORIGINS.strip()
    if not configured:
        return []
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    try:
        await initialize_collections()
    except Exception:
        # Keep the app bootable even if external services are temporarily unavailable.
        logger.exception("Startup collection initialization failed; continuing startup.")

    # Pre-warm heavy ML components so the first user request does not pay the
    # cost of model download + load. Lazy initialization frequently exceeds
    # platform proxy timeouts (e.g. Railway / Render) and surfaces to users as
    # "Connection lost before receiving a response".
    try:
        await asyncio.to_thread(get_embeddings_client)
        logger.info("Embeddings model pre-warmed")
    except Exception:
        logger.exception("Failed to pre-warm embeddings model; continuing startup.")

    if settings.RERANKER_ENABLED:
        try:
            await asyncio.to_thread(get_reranker_client)
            logger.info("Reranker model pre-warmed")
        except Exception:
            logger.exception("Failed to pre-warm reranker model; continuing startup.")

    logger.info("RAG Backend started")
    yield
    logger.info("RAG Backend shutting down")


def create_app() -> FastAPI:
    app = FastAPI(title="RAG Backend", lifespan=lifespan)
    allowed_origins = _get_allowed_origins()
    app.state.limiter = limiter

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    register_exception_handlers(app)

    # Serve only versioned API routes.
    app.include_router(v1_router, prefix="/api/v1")

    @limiter.exempt
    @app.get("/health")
    async def health() -> JSONResponse:
        return JSONResponse(content={"status": "ok"})

    return app


app = create_app()


