"""JWT verification + tenant-scoped database sessions (RLS binding).

This is the thin bridge between a Supabase access token and the vendored
supabase-tenant-rbac RLS layer (infra/rbac/). The RBAC helpers resolve a user's
claims via `rbac.get_claims()`, which falls back to the `rbac.user_claims` cache
keyed on `auth.uid()`. So all the API has to do, per request, is:

  1. verify the Supabase JWT (HS256 with the project's JWT secret),
  2. open a transaction,
  3. SET LOCAL role = 'authenticated' and bind `request.jwt.claims`,

and every `rbac.is_member(...)` / `rbac.has_permission(...)` policy then evaluates
for the real user — no group data needs to be packed into our own tokens.

`SET LOCAL` scopes the settings to the transaction, so they never leak across
pooled connections. We use a parameterized `set_config(..., is_local => true)`
rather than string-interpolating the claims, to avoid any SQL injection via token
contents (the claims are untrusted until verified, and even after, treated as data).
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass

import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.engine import get_sessionmaker
from app.log import get_logger

log = get_logger("db.tenant")

# Supabase signs access tokens with HS256 by default; audience is "authenticated".
_ALGORITHMS = ["HS256"]
_AUDIENCE = "authenticated"


class AuthError(Exception):
    """Raised when a token is missing, malformed, expired, or fails verification."""


@dataclass(frozen=True, slots=True)
class AuthContext:
    """The verified identity for one request."""

    user_id: str
    email: str | None
    role: str
    raw_claims: dict[str, object]


def verify_token(token: str) -> AuthContext:
    """Verify a Supabase access token and return its identity.

    Raises AuthError on any failure. Never logs the token or its secret.
    """
    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise AuthError("SUPABASE_JWT_SECRET is not configured")
    try:
        claims = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=_ALGORITHMS,
            audience=_AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as exc:  # expired, bad signature, bad audience, etc.
        raise AuthError("invalid token") from exc

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise AuthError("token missing subject")

    return AuthContext(
        user_id=sub,
        email=claims.get("email") if isinstance(claims.get("email"), str) else None,
        role=claims.get("role", "authenticated")
        if isinstance(claims.get("role"), str)
        else "authenticated",
        raw_claims=claims,
    )


async def tenant_session(auth: AuthContext) -> AsyncIterator[AsyncSession]:
    """Yield a session whose transaction runs as the user under RLS.

    The whole session body executes inside one transaction with role
    `authenticated` and the user's JWT claims bound, so RBAC policies see the
    real caller. Commits on success, rolls back on error.
    """
    # Minimal claims PostgREST/GoTrue-compatible RLS needs: sub (-> auth.uid())
    # and role. We pass through the verified claims as-is; they are already trusted.
    request_claims = json.dumps({"sub": auth.user_id, "role": "authenticated", "email": auth.email})
    async with get_sessionmaker()() as session, session.begin():
        # Downgrade to the RLS-governed role and bind claims for this txn only.
        await session.execute(text("SET LOCAL ROLE authenticated"))
        await session.execute(
            text("SELECT set_config('request.jwt.claims', :claims, true)"),
            {"claims": request_claims},
        )
        yield session
