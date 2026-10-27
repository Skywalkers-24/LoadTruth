"""Certified-truck registry API routes (deferred admin screen).

CRUD over the per-tenant truck registry (PLAN.md §3, capacity lookup at Stage 4).
``truck_number`` is unique per tenant: a duplicate returns 409, a missing id 404.
All queries are tenant-scoped via the ActiveTenant dependency.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_manage_trucks
from app.tickets.repository import DuplicateTruckError, TruckNotFoundError
from app.tickets.schemas import TruckIn, TruckOut, TruckPatch

router = APIRouter(tags=["trucks"])

# Managing the truck registry is a supervisor-and-up action.
ManageTrucks = Depends(require(can_manage_trucks, "You do not have permission to manage trucks."))


@router.get("/trucks", response_model=list[TruckOut])
async def list_trucks(repo: Repository, tenant: ActiveTenant) -> list[TruckOut]:
    """List certified trucks in the active tenant."""
    return [TruckOut.model_validate(t) for t in await repo.list_trucks(tenant)]


@router.post(
    "/trucks",
    response_model=TruckOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ManageTrucks],
)
async def create_truck(repo: Repository, tenant: ActiveTenant, body: TruckIn) -> TruckOut:
    """Register a certified truck (truck_number unique per tenant)."""
    try:
        row = await repo.create_truck(
            tenant,
            truck_number=body.truck_number,
            body_type=body.body_type,
            certified_cubic_yards=body.certified_cubic_yards,
            registry_source=body.registry_source,
        )
    except DuplicateTruckError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "truck_number already exists") from exc
    return TruckOut.model_validate(row)


@router.patch("/trucks/{truck_id}", response_model=TruckOut, dependencies=[ManageTrucks])
async def update_truck(
    repo: Repository, tenant: ActiveTenant, truck_id: UUID, body: TruckPatch
) -> TruckOut:
    """Update a truck; only supplied fields change."""
    try:
        row = await repo.update_truck(
            tenant,
            truck_id,
            truck_number=body.truck_number,
            body_type=body.body_type,
            certified_cubic_yards=body.certified_cubic_yards,
            registry_source=body.registry_source,
            fields_set=set(body.model_fields_set),
        )
    except TruckNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "truck not found") from exc
    except DuplicateTruckError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "truck_number already exists") from exc
    return TruckOut.model_validate(row)


@router.delete(
    "/trucks/{truck_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[ManageTrucks],
)
async def delete_truck(repo: Repository, tenant: ActiveTenant, truck_id: UUID) -> None:
    """Remove a truck from the registry."""
    try:
        await repo.delete_truck(tenant, truck_id)
    except TruckNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "truck not found") from exc
