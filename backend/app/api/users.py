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

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import CurrentMember, require
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_act_on_user, can_manage_settings, can_manage_users
from app.tickets.repository import DuplicateUserError, UserNotFoundError
from app.tickets.schemas import UserIn, UserOut, UserPatch

router = APIRouter(tags=["users"])

# Viewing or managing members requires county-admin and up. The per-action
# hierarchy rule (no acting on a higher role) is enforced inside each route
# because it also depends on the *target* member's role.
ManageUsers = Depends(require(can_manage_users, "You do not have permission to manage users."))


@router.get("/users", response_model=list[UserOut], dependencies=[ManageUsers])
async def list_users(repo: Repository, tenant: ActiveTenant) -> list[UserOut]:
    """List members in the active tenant."""
    return [UserOut.model_validate(u) for u in await repo.list_users(tenant)]


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    repo: Repository, tenant: ActiveTenant, member: CurrentMember, body: UserIn
) -> UserOut:
    """Add a member (email unique per tenant). Cannot create a role above your own."""
    if not can_act_on_user(member.role, body.role.value):
        raise _forbidden("You cannot create a member with a role above your own.")
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
    repo: Repository, tenant: ActiveTenant, member: CurrentMember, user_id: UUID, body: UserPatch
) -> UserOut:
    """Update a member; only supplied fields change.

    You may only act on members at or below your own role, and may not promote
    anyone above your own role.
    """
    if not can_manage_users(member.role):
        raise _forbidden("You do not have permission to manage users.")
    target = await repo.get_user(tenant, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    if not can_act_on_user(member.role, target.role):
        raise _forbidden("You cannot modify a member with a role above your own.")
    if body.role is not None and not can_act_on_user(member.role, body.role.value):
        raise _forbidden("You cannot assign a role above your own.")
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
async def delete_user(
    repo: Repository, tenant: ActiveTenant, member: CurrentMember, user_id: UUID
) -> None:
    """Remove a member. You cannot remove yourself or a member above your role."""
    if not can_manage_users(member.role):
        raise _forbidden("You do not have permission to manage users.")
    if str(user_id) == member.user_id:
        raise _forbidden("You cannot remove your own account.")
    target = await repo.get_user(tenant, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    if not can_act_on_user(member.role, target.role):
        raise _forbidden("You cannot remove a member with a role above your own.")
    try:
        await repo.delete_user(tenant, user_id)
    except UserNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found") from exc
