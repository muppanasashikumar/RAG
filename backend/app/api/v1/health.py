"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.rate_limit import limiter
from app.schemas.responses.health import HealthResponse

router = APIRouter(tags=["health"])


@limiter.exempt
@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
