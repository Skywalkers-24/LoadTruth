"""Session tokens for the LoadTruth app's own login.

This build issues and verifies its own short-lived HS256 tokens (the Supabase
GoTrue flow is not wired here). A token carries the member's id, tenant, email,
and role. The signing secret is the configured SUPABASE_JWT_SECRET when present,
otherwise a stable dev fallback so local Docker runs work out of the box.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import jwt

from app.config import get_settings

_ALGORITHM = "HS256"
_ISSUER = "loadtruth"
_TTL_SECONDS = 60 * 60 * 12  # 12 hours
# Dev fallback secret. Fine for the local/demo build; production sets a real
# SUPABASE_JWT_SECRET in the environment.
_DEV_SECRET = "loadtruth-dev-session-secret-change-me"  # noqa: S105 (dev fallback, not a password)


class SessionError(Exception):
    """Raised when a session token is missing, malformed, or expired."""


@dataclass(frozen=True, slots=True)
class Session:
    """The identity carried by a verified session token."""

    user_id: str
    tenant_id: str
    email: str
    role: str
    full_name: str | None


def _secret() -> str:
    configured = get_settings().supabase_jwt_secret
    return configured or _DEV_SECRET


def issue_token(session: Session) -> str:
    """Sign a session token for the given identity."""
    now = int(time.time())
    payload = {
        "iss": _ISSUER,
        "iat": now,
        "exp": now + _TTL_SECONDS,
        "sub": session.user_id,
        "tenant_id": session.tenant_id,
        "email": session.email,
        "role": session.role,
        "full_name": session.full_name,
    }
    return jwt.encode(payload, _secret(), algorithm=_ALGORITHM)


def verify_token(token: str) -> Session:
    """Verify a session token and return its identity. Raises SessionError."""
    try:
        claims = jwt.decode(
            token,
            _secret(),
            algorithms=[_ALGORITHM],
            issuer=_ISSUER,
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise SessionError("invalid session") from exc

    sub = claims.get("sub")
    tenant_id = claims.get("tenant_id")
    email = claims.get("email")
    role = claims.get("role")
    if not all(isinstance(v, str) and v for v in (sub, tenant_id, email, role)):
        raise SessionError("session missing required claims")
    full_name = claims.get("full_name")
    return Session(
        user_id=sub,  # type: ignore[arg-type]
        tenant_id=tenant_id,  # type: ignore[arg-type]
        email=email,  # type: ignore[arg-type]
        role=role,  # type: ignore[arg-type]
        full_name=full_name if isinstance(full_name, str) else None,
    )
