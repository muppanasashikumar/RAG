from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_documents_dir
from app.db.mongodb import initialize_collections
from app.routes.ingest_routes import router as ingest_router
from app.routes.rag_routes import router as rag_router

app = FastAPI(title="RAG Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rag_router)
app.include_router(ingest_router)
app.mount("/documents", StaticFiles(directory=str(get_documents_dir())), name="documents")


@app.on_event("startup")
async def startup_event():
    get_documents_dir().mkdir(parents=True, exist_ok=True)
    initialize_collections()


@app.get("/health")
async def health():
    return {"status": "ok"}