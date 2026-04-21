from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.routes import chat_store
from app.routes.routes import router as api_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    await chat_store.initialize()
    yield

app = FastAPI(
    title="RAG Backend API",
    version="0.1.0",
    description="Backend API for the RAG application.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
