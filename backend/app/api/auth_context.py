"""GET /auth-context — the signed-in user's tenants and roles.

Powers the frontend tenant switcher (PLAN.md §3.1). The query runs under the
user's RLS context, so it returns only the memberships that user can actually
see — a second, independent proof that tenant isolation holds.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.api.deps import CurrentUser, TenantSession

router = APIRouter(tags=["auth"])


class TenantMembership(BaseModel):
    tenant_id: str
    tenant_name: str
    roles: list[str]


class AuthContextResponse(BaseModel):
    user_id: str
    email: str | None
    memberships: list[TenantMembership]


@router.get("/auth-context", response_model=AuthContextResponse)
async def get_auth_context(user: CurrentUser, db: TenantSession) -> AuthContextResponse:
    """Return the user's identity plus the tenants/roles they belong to."""
    rows = (
        await db.execute(
            text(
                """
                SELECT g.id::text AS tenant_id, g.name AS tenant_name, m.roles AS roles
                FROM rbac.members m
                JOIN rbac.groups g ON g.id = m.group_id
                WHERE m.user_id = :uid
                ORDER BY g.name
                """
            ),
            {"uid": user.user_id},
        )
    ).mappings()
    memberships = [
        TenantMembership(
            tenant_id=r["tenant_id"],
            tenant_name=r["tenant_name"],
            roles=list(r["roles"] or []),
        )
        for r in rows
    ]
    return AuthContextResponse(user_id=user.user_id, email=user.email, memberships=memberships)
