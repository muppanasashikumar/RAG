"""Shared SlowAPI limiter configuration."""

from __future__ import annotations

import hashlib
from slowapi import Limiter
from starlette.requests import Request

from app.core.config import settings

def _build_rate_limit_key(request: Request) -> str:
    raw_auth_header = request.headers.get("authorization", "").strip()
    if raw_auth_header:
        token_hash = hashlib.sha256(raw_auth_header.encode("utf-8")).hexdigest()
        return f"token:{token_hash}"
    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"


_default_limits: list[str] = []
if settings.RATE_LIMIT_ENABLED:
    _default_limits = [
        f"{max(settings.RATE_LIMIT_MAX_REQUESTS, 1)}/{max(settings.RATE_LIMIT_WINDOW_SECONDS, 1)} seconds"
    ]

limiter = Limiter(
    key_func=_build_rate_limit_key,
    default_limits=_default_limits,
    storage_uri=settings.REDIS_URL,
    headers_enabled=True,
    enabled=settings.RATE_LIMIT_ENABLED,
)
