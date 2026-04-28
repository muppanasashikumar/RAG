"""Simple in-memory sliding-window rate limiting middleware."""

from __future__ import annotations

import hashlib
import time
from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class InMemoryRateLimiter:
    """Tracks per-key request timestamps in a fixed window."""

    def __init__(self, *, max_requests: int, window_seconds: int) -> None:
        self._max_requests = max(max_requests, 1)
        self._window_seconds = max(window_seconds, 1)
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        window_start = now - self._window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= window_start:
                events.popleft()
            if len(events) >= self._max_requests:
                retry_after = max(1, int(events[0] + self._window_seconds - now))
                return False, retry_after
            events.append(now)
            return True, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate-limits authenticated API requests by token or client IP."""

    def __init__(
        self,
        app,
        *,
        max_requests: int,
        window_seconds: int,
        enabled: bool = True,
    ) -> None:
        super().__init__(app)
        self._enabled = enabled
        self._limiter = InMemoryRateLimiter(
            max_requests=max_requests,
            window_seconds=window_seconds,
        )

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Response],
    ) -> Response:
        if not self._enabled:
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if not path.startswith("/api/v1") or path == "/api/v1/health":
            return await call_next(request)

        key = self._build_key(request)
        allowed, retry_after = self._limiter.hit(key)
        if not allowed:
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(retry_after)},
                content={"detail": "Rate limit exceeded. Please try again later."},
            )
        return await call_next(request)

    def _build_key(self, request: Request) -> str:
        raw_auth_header = request.headers.get("authorization", "").strip()
        if raw_auth_header:
            # Hash raw bearer token to avoid storing sensitive data in memory.
            token_hash = hashlib.sha256(raw_auth_header.encode("utf-8")).hexdigest()
            return f"token:{token_hash}"
        client_ip = request.client.host if request.client else "unknown"
        return f"ip:{client_ip}"
