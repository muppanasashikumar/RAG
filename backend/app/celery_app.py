from __future__ import annotations

from celery import Celery

from app.rag_settings import RAGSettings

settings = RAGSettings()

celery_app = Celery(
    "rag_ingestion",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    imports=("app.ingestion_tasks",),
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)
