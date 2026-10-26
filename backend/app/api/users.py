"""Tenant member (user + role) API routes — the admin Users screen (PLAN.md §10).

CRUD over the per-tenant member list using the product's real role vocabulary
(monitor / supervisor / county_admin / auditor / super_admin). ``email`` is
unique per tenant: a duplicate returns 409, a missing id 404. All queries are
tenant-scoped via the ActiveTenant dependency.

In the full Supabase deployment these rows live in the vendored ``rbac.members``
tables under RLS; this interim SQLite build persists them in a tenant-scoped
``users`` table so the screen is real CRUD rather than a mock.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.repo import ActiveTenant, Repository
from app.tickets.repository import DuplicateUserError, UserNotFoundError
from app.tickets.schemas import UserIn, UserOut, UserPatch

router = APIRouter(tags=["users"])


@router.get("/users", response_model=list[UserOut])
async def list_users(repo: Repository, tenant: ActiveTenant) -> list[UserOut]:
    """List members in the active tenant."""
    return [UserOut.model_validate(u) for u in await repo.list_users(tenant)]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(repo: Repository, tenant: ActiveTenant, body: UserIn) -> UserOut:
    """Add a member (email unique per tenant)."""
    try:
        row = await repo.create_user(
            tenant,
            email=body.email,
            full_name=body.full_name,
            role=body.role.value,
            status=body.status.value,
        )
    except DuplicateUserError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already exists") from exc
    return UserOut.model_validate(row)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    repo: Repository, tenant: ActiveTenant, user_id: UUID, body: UserPatch
) -> UserOut:
    """Update a member; only supplied fields change."""
    try:
        row = await repo.update_user(
            tenant,
            user_id,
            email=body.email,
            full_name=body.full_name,
            role=body.role.value if body.role is not None else None,
            status=body.status.value if body.status is not None else None,
            fields_set=set(body.model_fields_set),
        )
    except UserNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found") from exc
    except DuplicateUserError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already exists") from exc
    return UserOut.model_validate(row)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(repo: Repository, tenant: ActiveTenant, user_id: UUID) -> None:
    """Remove a member from the tenant."""
    try:
        await repo.delete_user(tenant, user_id)
    except UserNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found") from exc
