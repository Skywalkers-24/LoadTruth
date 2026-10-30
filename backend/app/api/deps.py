"""Shared FastAPI dependencies: auth extraction and tenant-scoped DB sessions.

Two auth surfaces live here:

* The LoadTruth session login used by this build: `CurrentMember` reads the
  app's own bearer token (app.auth.session), confirming the caller's identity
  and role on every request. `require(...)` builds role guards from the
  capability predicates in app.auth.roles.
* The Supabase-JWT path (`CurrentUser`/`TenantSession`) remains for the
  `/auth-context` route and the eventual Postgres RLS deployment.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.session import Session, SessionError
from app.auth.session import verify_token as verify_session
from app.db.tenant import AuthContext, AuthError, tenant_session, verify_token

# ── LoadTruth session login (the build's real auth) ───────────────────────────


async def current_member(
    authorization: Annotated[str | None, Header()] = None,
) -> Session:
    """Resolve the caller from the `Authorization: Bearer <session>` header."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization[7:].strip()
    try:
        return verify_session(token)
    except SessionError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


CurrentMember = Annotated[Session, Depends(current_member)]


async def authorize_fresh_analysis(
    member: CurrentMember, bypass_cache: bool = Query(default=False)
) -> None:
    """Only the Administrator login may opt into additional model calls."""
    from app.auth.roles import is_super_admin

    if bypass_cache and not is_super_admin(member.role):
        raise HTTPException(403, "Only administrators can request fresh analysis.")


def require(
    predicate: Callable[[str], bool], message: str
) -> Callable[[Session], Awaitable[Session]]:
    """Build a dependency that allows the request only if the role passes.

    Usage: `member: Annotated[Session, Depends(require(can_manage_users, "..."))]`.
    Returns the member so the route can use its identity.
    """

    async def _guard(member: CurrentMember) -> Session:
        if not predicate(member.role):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)
        return member

    return _guard


# ── Supabase-JWT path (kept for /auth-context and future Postgres RLS) ─────────


async def current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthContext:
    """Verify the `Authorization: Bearer <token>` header into an AuthContext."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization[7:].strip()
    try:
        return verify_token(token)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


CurrentUser = Annotated[AuthContext, Depends(current_user)]


async def tenant_db(user: CurrentUser) -> AsyncIterator[AsyncSession]:
    """Yield an RLS-bound session scoped to the authenticated user."""
    async for session in tenant_session(user):
        yield session


TenantSession = Annotated[AsyncSession, Depends(tenant_db)]
