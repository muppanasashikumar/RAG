"""Global exception handlers mapping domain errors to HTTP responses."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.domain.exceptions import (
    DocumentNotFound,
    DomainError,
    IngestionFailed,
    InvalidInput,
    NoExtractableContent,
    RetrievalFailed,
)

logger = logging.getLogger(__name__)

_STATUS_BY_ERROR: dict[type[DomainError], int] = {
    InvalidInput: 400,
    DocumentNotFound: 404,
    NoExtractableContent: 422,
    IngestionFailed: 500,
    RetrievalFailed: 500,
}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
        status = _STATUS_BY_ERROR.get(type(exc), 500)
        logger.warning("Domain error (%s): %s", type(exc).__name__, exc.message)
        return JSONResponse(
            status_code=status,
            content={"error": type(exc).__name__, "detail": exc.message},
        )

    @app.exception_handler(Exception)
    async def _unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled server error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": "InternalServerError", "detail": "Something went wrong."},
        )
