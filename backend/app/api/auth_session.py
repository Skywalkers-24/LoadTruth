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

import hashlib
import hmac
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.api.deps import CurrentMember
from app.api.repo import Repository
from app.auth.roles import capabilities
from app.auth.session import Session, issue_token
from app.config import get_settings
from app.db import models
from app.tickets.schemas import Role
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


class SuperAdminLoginIn(BaseModel):
    username: str
    password: str


def _verify_superadmin_auth(username: str, password: str) -> bool:
    settings = get_settings()
    u_input = username.strip()
    p_input = password

    u_hash = hashlib.sha256(u_input.encode("utf-8")).hexdigest()
    p_hash = hashlib.sha256(p_input.encode("utf-8")).hexdigest()

    target_u_hash = (settings.superadmin_username_hash or "").strip().lower()
    target_p_hash = (settings.superadmin_password_hash or "").strip().lower()

    target_u_plain = (settings.superadmin_username or "").strip()
    target_p_plain = settings.superadmin_password or ""

    u_ok = False
    if target_u_hash and hmac.compare_digest(u_hash, target_u_hash):
        u_ok = True
    elif target_u_plain and hmac.compare_digest(u_input, target_u_plain):
        u_ok = True

    p_ok = False
    if target_p_hash and hmac.compare_digest(p_hash, target_p_hash):
        p_ok = True
    elif target_p_plain and hmac.compare_digest(p_input, target_p_plain):
        p_ok = True

    return u_ok and p_ok


@router.get("/directory", response_model=list[DirectoryMember])
async def directory(
    repo: LoginRepo, exclude_superadmin: bool = False
) -> list[DirectoryMember]:
    """The tenant's members, offered as sign-in options on the login screen."""
    users = await repo.list_users(DEMO_TENANT_ID)
    return [
        DirectoryMember(email=u.email, full_name=u.full_name, role=u.role)
        for u in users
        if u.status == "active" and (not exclude_superadmin or u.role != Role.SUPER_ADMIN.value)
    ]


@router.post("/login", response_model=LoginOut)
async def login(repo: LoginRepo, body: LoginIn) -> LoginOut:
    """Sign in as a seeded member by email; returns a signed session token.

    Dedicated Developer / SuperAdmin portal logins use /auth/superadmin/login with username and password.
    """
    user = await repo.get_user_by_email(DEMO_TENANT_ID, str(body.email))
    if user is None or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That email is not an active member of this workspace.",
        )
    if user.email.lower() == "developer@loadtruth.io":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Developer / SuperAdmin accounts must log in via the SuperAdmin developer portal.",
        )
    session = Session(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        email=user.email,
        role=user.role,
        full_name=user.full_name,
    )
    return LoginOut(token=issue_token(session), member=_member_out(user))


@router.post("/superadmin/login", response_model=LoginOut)
async def superadmin_login(repo: LoginRepo, body: SuperAdminLoginIn) -> LoginOut:
    """Developer / SuperAdmin login with username and password verified against hashed credentials in .env."""
    if not _verify_superadmin_auth(body.username, body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid SuperAdmin username or password.",
        )

    # Find existing super_admin user or root, or link developer
    user = await repo.get_user_by_email(DEMO_TENANT_ID, "developer@loadtruth.io")
    if user is None:
        user = await repo.get_user_by_email(DEMO_TENANT_ID, "root@loadtruth.io")
    if user is None:
        user = await repo.create_user(
            tenant_id=DEMO_TENANT_ID,
            email="developer@loadtruth.io",
            full_name="Developer (SuperAdmin)",
            role=Role.SUPER_ADMIN.value,
            status="active",
        )
    elif user.role != Role.SUPER_ADMIN.value:
        user = await repo.update_user(
            DEMO_TENANT_ID,
            user.id,
            email=user.email,
            full_name=user.full_name,
            role=Role.SUPER_ADMIN.value,
            status=user.status,
            fields_set={"role"},
        )

    session = Session(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        email=user.email,
        role=Role.SUPER_ADMIN.value,
        full_name=user.full_name or "Developer (SuperAdmin)",
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
