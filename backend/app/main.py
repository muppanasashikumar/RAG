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
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.infrastructure.mongo import initialize_collections

logger = logging.getLogger(__name__)

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    await initialize_collections()
    logger.info("RAG Backend started")
    yield
    logger.info("RAG Backend shutting down")


def create_app() -> FastAPI:
    app = FastAPI(title="RAG Backend", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    # Serve only versioned API routes.
    app.include_router(v1_router, prefix="/api/v1")

    return app


app = create_app()
