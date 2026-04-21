from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes.routes import router as api_router
from app.routes.routes import settings

app = FastAPI(
    title="RAG Backend API",
    version="0.1.0",
    description="Backend API for the RAG application.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/files", StaticFiles(directory=str(Path(settings.uploads_dir))), name="files")
app.include_router(api_router, prefix="/api/v1")
