"""Login, logout, and current-member endpoints for the LoadTruth app.

This build authenticates against the seeded member directory: a caller signs in
as one of the tenant's members by email. A valid, active member receives a
signed session token (app.auth.session) that carries their tenant and role; the
token is then sent as a bearer on every request and enforced server-side.

There is no password store in this build, so login verifies that the email
belongs to an active member. The important security property for the demo is
that the role travels with the verified token and is enforced on every mutating
route, so a lower role genuinely cannot perform a higher-role action.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.api.deps import CurrentMember
from app.api.repo import Repository
from app.auth.roles import capabilities
from app.auth.session import Session, issue_token
from app.db import models
from app.tickets.seed import DEMO_TENANT_ID

router = APIRouter(prefix="/auth", tags=["auth"])

# Login reuses the shared repository dependency so tests can override it and so
# the active-tenant lookup is consistent with the rest of the API.
LoginRepo = Repository


class MemberOut(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str
    tenant_id: str
    capabilities: dict[str, bool]


class DirectoryMember(BaseModel):
    """A sign-in option shown on the login screen (demo member directory)."""

    email: str
    full_name: str | None
    role: str


class LoginIn(BaseModel):
    email: EmailStr


class LoginOut(BaseModel):
    token: str
    member: MemberOut


def _member_out(row: models.User) -> MemberOut:
    return MemberOut(
        id=str(row.id),
        email=row.email,
        full_name=row.full_name,
        role=row.role,
        tenant_id=str(row.tenant_id),
        capabilities=capabilities(row.role),
    )


@router.get("/directory", response_model=list[DirectoryMember])
async def directory(repo: LoginRepo) -> list[DirectoryMember]:
    """The tenant's members, offered as sign-in options on the login screen."""
    users = await repo.list_users(DEMO_TENANT_ID)
    return [
        DirectoryMember(email=u.email, full_name=u.full_name, role=u.role)
        for u in users
        if u.status == "active"
    ]


@router.post("/login", response_model=LoginOut)
async def login(repo: LoginRepo, body: LoginIn) -> LoginOut:
    """Sign in as a seeded member by email; returns a signed session token."""
    user = await repo.get_user_by_email(DEMO_TENANT_ID, str(body.email))
    if user is None or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That email is not an active member of this workspace.",
        )
    session = Session(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        email=user.email,
        role=user.role,
        full_name=user.full_name,
    )
    return LoginOut(token=issue_token(session), member=_member_out(user))


@router.get("/me", response_model=MemberOut)
async def me(repo: LoginRepo, member: CurrentMember) -> MemberOut:
    """Return the signed-in member, refreshed from the directory.

    Reading the live row means a role change takes effect on the next request,
    not only after re-login.
    """
    row = await repo.get_user(UUID(member.tenant_id), UUID(member.user_id))
    if row is None or row.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your account is no longer active.",
        )
    return _member_out(row)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(_: CurrentMember) -> None:
    """Log out. Tokens are stateless, so the client discards it; this confirms auth."""
    return None
