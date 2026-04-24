"""Domain-level exceptions.

These exceptions describe *business* failures and are transport-agnostic.
The API layer is responsible for mapping them to HTTP responses.
"""

from __future__ import annotations


class DomainError(Exception):
    """Base class for all domain errors."""

    default_message: str = "A domain error occurred."

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.default_message)
        self.message = message or self.default_message


class DocumentNotFound(DomainError):
    default_message = "Document not found."


class NoExtractableContent(DomainError):
    default_message = "No extractable text was found in the uploaded file."


class IngestionFailed(DomainError):
    default_message = "Failed to ingest the document."


class RetrievalFailed(DomainError):
    default_message = "Failed to retrieve context for the query."


class InvalidInput(DomainError):
    default_message = "Invalid input."
