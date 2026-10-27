"""Source-connection API routes (deferred admin screen + multi-source ingest).

CRUD over the evidence sources attached to an event (PLAN.md §3, §5b), plus a
side-effect-free ``POST /sources/{id}/test`` that validates a source's config
through the adapter layer. ``upload`` is the only fully-wired fetch path; the
other kinds validate config but are not yet connected (no network I/O anywhere).
All queries are tenant-scoped via the ActiveTenant dependency.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_manage_sources
from app.pipeline.sources import get_adapter
from app.tickets.repository import EventNotFoundError, SourceNotFoundError
from app.tickets.schemas import SourceIn, SourceOut, SourcePatch, SourceTestResult

router = APIRouter(tags=["sources"])

# Connecting, editing, testing, or removing evidence sources is supervisor-and-up.
_NO_SOURCES = "You do not have permission to manage sources."
ManageSources = Depends(require(can_manage_sources, _NO_SOURCES))


@router.get("/events/{event_id}/sources", response_model=list[SourceOut])
async def list_sources(repo: Repository, tenant: ActiveTenant, event_id: UUID) -> list[SourceOut]:
    """List the evidence sources connected to an event."""
    return [SourceOut.model_validate(s) for s in await repo.list_sources(tenant, event_id)]


@router.post(
    "/events/{event_id}/sources",
    response_model=SourceOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ManageSources],
)
async def create_source(
    repo: Repository, tenant: ActiveTenant, event_id: UUID, body: SourceIn
) -> SourceOut:
    """Connect a new evidence source to an event."""
    try:
        row = await repo.create_source(
            tenant,
            event_id,
            kind=body.kind.value,
            name=body.name,
            config=body.config,
            status=body.status.value,
        )
    except EventNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found") from exc
    return SourceOut.model_validate(row)


@router.patch("/sources/{source_id}", response_model=SourceOut, dependencies=[ManageSources])
async def update_source(
    repo: Repository, tenant: ActiveTenant, source_id: UUID, body: SourcePatch
) -> SourceOut:
    """Update a source; only supplied fields change."""
    try:
        row = await repo.update_source(
            tenant,
            source_id,
            kind=body.kind.value if body.kind is not None else None,
            name=body.name,
            config=body.config,
            status=body.status.value if body.status is not None else None,
            fields_set=set(body.model_fields_set),
        )
    except SourceNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source not found") from exc
    return SourceOut.model_validate(row)


@router.delete(
    "/sources/{source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[ManageSources],
)
async def delete_source(repo: Repository, tenant: ActiveTenant, source_id: UUID) -> None:
    """Disconnect a source from its event."""
    try:
        await repo.delete_source(tenant, source_id)
    except SourceNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source not found") from exc


@router.post(
    "/sources/{source_id}/test", response_model=SourceTestResult, dependencies=[ManageSources]
)
async def test_source(repo: Repository, tenant: ActiveTenant, source_id: UUID) -> SourceTestResult:
    """Validate a source's config via its adapter. No network I/O is performed."""
    try:
        row = await repo.source_row(tenant, source_id)
    except SourceNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source not found") from exc
    adapter = get_adapter(row.kind, dict(row.config or {}))
    result = adapter.validate_config()
    return SourceTestResult(ok=result.ok, detail=result.detail)
