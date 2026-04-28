"""Authentication helpers for validating bearer tokens."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import jwt
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError

from app.core.config import settings


@lru_cache(maxsize=1)
def get_clerk_jwks_client() -> PyJWKClient | None:
    jwks_url = (settings.CLERK_JWKS_URL or "").strip()
    if not jwks_url:
        return None
    return PyJWKClient(jwks_url)


def validate_clerk_bearer_token(token: str) -> dict[str, Any]:
    jwks_client = get_clerk_jwks_client()
    if jwks_client is None:
        raise InvalidTokenError("CLERK_JWKS_URL is not configured")

    issuer = (settings.CLERK_ISSUER or "").strip() or None
    audience = (settings.CLERK_AUDIENCE or "").strip() or None
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=issuer,
        audience=audience,
        options={
            "verify_iss": issuer is not None,
            "verify_aud": audience is not None,
        },
    )
