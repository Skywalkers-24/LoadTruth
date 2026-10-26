"""Shared FastAPI dependencies: auth extraction and tenant-scoped DB sessions.

A route that depends on `CurrentUser` receives the verified identity; a route that
depends on `TenantSession` receives an AsyncSession already bound to that user
under RLS (see app.db.tenant). Together they enforce the plan's defense-in-depth:
RLS in the database, plus explicit checks in the API layer.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tenant import AuthContext, AuthError, tenant_session, verify_token


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
