"""Ticket, event, and dashboard API routes.

The review surface (PLAN.md §3.3) and the dashboard money-frame roll-up (§3.4,
§7a) are served here. Recording a monitor call recomputes and persists the
signed dollar-delta via the deterministic `value_ticket()` path — the UI never
does the math itself.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.api.cache import cached_api, invalidate_cache_tags
from app.api.deps import require
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_manage_settings, can_review_tickets
from app.pipeline import evidence_store
from app.pipeline.trace import display_stage_summary
from app.tickets.repository import EventNotFoundError, TicketNotFoundError
from app.tickets.schemas import (
    AnomalyOut,
    DashboardOut,
    DebrisClass,
    EventIn,
    EventOut,
    EventPatch,
    MonitorCallIn,
    PaginatedTickets,
    ReportsSummary,
    SortOrder,
    StatusIn,
    TicketOut,
    TicketPatch,
    TicketSort,
    TicketStatus,
    event_to_out,
    ticket_to_out,
)

router = APIRouter(tags=["tickets"])

# Managing events and their rate tables requires SuperAdmin;
# reviewing tickets (monitor call, confirm/override/dispute) needs review rights.
_NO_EVENTS = "Only SuperAdmin can manage workspace events and rate tables."
_NO_REVIEW = "You do not have permission to review tickets."
ManageEvents = Depends(require(can_manage_settings, _NO_EVENTS))
ReviewTickets = Depends(require(can_review_tickets, _NO_REVIEW))


async def _require_writable_ticket(repo: Repository, tenant: UUID, ticket_id: UUID) -> None:
    """Keep curated benchmark tickets immutable for every role."""
    try:
        ticket = await repo.get_ticket(tenant, ticket_id)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    event = await repo.get_event(tenant, ticket.event_id)
    if event is not None and "read-only" in event.tags:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This preprocessed showcase event is read-only.",
        )


@router.get("/events", response_model=list[EventOut])
async def list_events(repo: Repository, tenant: ActiveTenant) -> list[EventOut]:
    """List disaster events in the active tenant."""

    async def _compute() -> list[EventOut]:
        events = await repo.list_events(tenant)
        return [event_to_out(e) for e in events]

    return await cached_api(
        tags=[f"tenant:{tenant}:events"],
        key=f"events:{tenant}",
        compute=_compute,
        to_dict=lambda evts: [e.model_dump(mode="json") for e in evts],
        from_dict=lambda data: [EventOut.model_validate(e) for e in data],
    )


@router.post(
    "/events",
    response_model=EventOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ManageEvents],
)
async def create_event(repo: Repository, tenant: ActiveTenant, body: EventIn) -> EventOut:
    """Create a disaster event in the active tenant (admin screen)."""
    event = await repo.create_event(
        tenant,
        name=body.name,
        location=body.location,
        status=body.status,
        rate_table=body.rate_table,
        tags=body.tags,
    )
    await invalidate_cache_tags(f"tenant:{tenant}:events")
    return event_to_out(event)


@router.patch("/events/{event_id}", response_model=EventOut, dependencies=[ManageEvents])
async def update_event(
    repo: Repository, tenant: ActiveTenant, event_id: UUID, body: EventPatch
) -> EventOut:
    """Update an event; only supplied fields change."""
    event_row = await repo.get_event(tenant, event_id)
    if event_row is not None and "read-only" in event_row.tags:
        raise HTTPException(status.HTTP_409_CONFLICT, "This showcase event is read-only.")
    try:
        event = await repo.update_event(
            tenant,
            event_id,
            name=body.name,
            location=body.location,
            status=body.status,
            rate_table=body.rate_table,
            tags=body.tags,
            fields_set=set(body.model_fields_set),
        )
    except EventNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found") from exc
    await invalidate_cache_tags(f"tenant:{tenant}:events", f"event:{event_id}")
    return event_to_out(event)


@router.get("/tickets", response_model=PaginatedTickets)
async def list_tickets(
    repo: Repository,
    tenant: ActiveTenant,
    event_id: UUID | None = None,
    status: TicketStatus | None = None,
    debris_class: DebrisClass | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    sort: TicketSort = TicketSort.CREATED,
    order: SortOrder = SortOrder.DESC,
) -> PaginatedTickets:
    """List tickets as a paginated envelope.

    Supports optional ``event_id``/``status``/``debris_class`` filters,
    ``limit`` (1-100, default 20) / ``offset`` (default 0) paging, and
    ``sort``/``order`` (default newest first). ``total`` is the full matching
    count, not the size of the returned page. Sorting and paging happen on the
    server so the ledger can walk every row in the chosen order, not just the
    first window.
    """
    tickets, total = await repo.list_tickets_page(
        tenant,
        event_id=event_id,
        status=status,
        debris_class=debris_class,
        limit=limit,
        offset=offset,
        sort=sort,
        order=order,
    )
    return PaginatedTickets(
        items=[ticket_to_out(t) for t in tickets],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(repo: Repository, tenant: ActiveTenant, ticket_id: UUID) -> TicketOut:
    """Fetch a single ticket with its valuation, evidence, and itemized flags."""
    try:
        ticket = await repo.get_ticket(tenant, ticket_id)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    out = ticket_to_out(ticket)
    rows = await repo.list_anomalies_for_ticket(tenant, ticket_id)
    out.anomalies = [
        AnomalyOut(
            type=r.type,
            severity=r.severity,
            explanation=r.explanation or "",
            evidence_frame=r.evidence_frame,
        )
        for r in rows
    ]
    return out


class PipelineStageOut(BaseModel):
    """One persisted AI pipeline stage for a ticket."""

    key: str
    label: str
    model: str
    status: str
    summary: str
    confidence: float | None = None
    duration_ms: float = 0.0
    details: list[list[str]] = Field(default_factory=list)
    analysis: str = ""


@router.get("/tickets/{ticket_id}/pipeline", response_model=list[PipelineStageOut])
async def ticket_pipeline(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID
) -> list[PipelineStageOut]:
    """The persisted AI pipeline trace for a ticket (how its numbers were produced)."""
    rows = await repo.list_pipeline_stages(tenant, ticket_id)
    return [
        PipelineStageOut(
            key=r.stage_key,
            label=r.label,
            model=r.model,
            status=r.status,
            summary=display_stage_summary(r.stage_key, r.summary, r.details),
            confidence=float(r.confidence) if r.confidence is not None else None,
            duration_ms=float(r.duration_ms),
            details=[
                [str(d[0]), str(d[1])]
                for d in (r.details or [])
                if isinstance(d, list | tuple) and len(d) == 2
            ],
            analysis=r.analysis or "",
        )
        for r in rows
    ]


class EvidenceOut(BaseModel):
    """The processed clip behind a ticket and SAM's raw per-frame segmentation."""

    media_kind: str
    mime: str
    # Frame rate of the stored video when known; SAM frame N plays at N / fps.
    fps: float | None = None
    has_media: bool
    # Concept label ("truck bed", "debris pile") -> SAM 3.1 output text.
    segments: dict[str, str] = Field(default_factory=dict)


@router.get("/tickets/{ticket_id}/evidence", response_model=EvidenceOut)
async def ticket_evidence(repo: Repository, tenant: ActiveTenant, ticket_id: UUID) -> EvidenceOut:
    """What the models saw for this ticket, for the Review console overlay."""
    row = await repo.get_ticket_evidence(tenant, ticket_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no evidence for this ticket")
    stored = await evidence_store.load(row.content_hash)
    raw = row.segments if isinstance(row.segments, dict) else {}
    return EvidenceOut(
        media_kind=row.media_kind,
        mime=stored.mime if stored else row.mime,
        fps=float(row.fps) if row.fps is not None else (stored.fps if stored else None),
        has_media=stored is not None,
        segments={str(k): str(v) for k, v in raw.items()},
    )


@router.get("/tickets/{ticket_id}/evidence/media")
async def ticket_evidence_media(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID
) -> RedirectResponse:
    """Authorize once, then play private B2 evidence without proxying video bytes."""
    row = await repo.get_ticket_evidence(tenant, ticket_id)
    stored = await evidence_store.load(row.content_hash) if row is not None else None
    if row is None or stored is None:
        raise HTTPException(404, "no evidence media for this ticket")
    return RedirectResponse(
        await evidence_store.media_url(row.content_hash),
        status_code=307,
        headers={"Cache-Control": "no-store"},
    )


@router.get("/tickets/{ticket_id}/evidence/url")
async def ticket_evidence_url(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID
) -> dict[str, str]:
    row = await repo.get_ticket_evidence(tenant, ticket_id)
    if row is None or await evidence_store.load(row.content_hash) is None:
        raise HTTPException(404, "no evidence media for this ticket")
    return {"url": await evidence_store.media_url(row.content_hash)}


class ReverifyOut(BaseModel):
    """The result of reproducing a ticket's number from its stored evidence.

    ``reproducible`` is true when the fill % recomputed from the stored Muse
    per-frame estimates (or SAM masks for legacy/fixture results) matches the
    ticket. ``receipt_hash`` fingerprints every pinned input.
    """

    ticket_id: UUID
    reproducible: bool
    reason: str
    stored_fill_pct: Decimal
    recomputed_fill_pct: Decimal | None = None
    receipt_hash: str | None = None
    receipt_inputs: dict[str, object] = Field(default_factory=dict)


@router.post("/tickets/{ticket_id}/reverify", response_model=ReverifyOut)
async def reverify_ticket(repo: Repository, tenant: ActiveTenant, ticket_id: UUID) -> ReverifyOut:
    """Reproduce the ticket's measured fill % from its stored evidence.

    Deterministic and offline: combines stored Muse frame estimates using the
    ingestion median (or replays SAM geometry for legacy/fixture results) and
    rebuilds the evidence receipt without any model call.
    """
    try:
        r = await repo.reverify_ticket(tenant, ticket_id)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    return ReverifyOut(
        ticket_id=ticket_id,
        reproducible=r.reproducible,
        reason=r.reason,
        stored_fill_pct=r.stored_fill_pct,
        recomputed_fill_pct=r.recomputed_fill_pct,
        receipt_hash=r.receipt_hash,
        receipt_inputs=r.receipt_inputs,
    )


@router.patch(
    "/tickets/{ticket_id}/monitor-call", response_model=TicketOut, dependencies=[ReviewTickets]
)
async def set_monitor_call(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID, body: MonitorCallIn
) -> TicketOut:
    """Record the monitor's fill-% call; recomputes and persists the §7a delta."""
    await _require_writable_ticket(repo, tenant, ticket_id)
    try:
        t = await repo.set_monitor_call(tenant, ticket_id, body.monitor_fill_pct)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    await invalidate_cache_tags(f"event:{t.event_id}", f"tenant:{tenant}:billing")
    return ticket_to_out(t)


@router.patch("/tickets/{ticket_id}/status", response_model=TicketOut, dependencies=[ReviewTickets])
async def set_status(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID, body: StatusIn
) -> TicketOut:
    """Confirm, override, or dispute a ticket (the review action)."""
    await _require_writable_ticket(repo, tenant, ticket_id)
    if body.status is TicketStatus.DRAFT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot set a ticket back to draft")
    try:
        t = await repo.set_status(tenant, ticket_id, body.status)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    await invalidate_cache_tags(f"event:{t.event_id}", f"tenant:{tenant}:billing")
    return ticket_to_out(t)


@router.patch("/tickets/{ticket_id}", response_model=TicketOut, dependencies=[ReviewTickets])
async def update_ticket(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID, body: TicketPatch
) -> TicketOut:
    """Edit a ticket's truck ID and/or debris class; recomputes the valuation.

    Setting the truck re-derives its certified capacity from the registry;
    setting the debris class re-reads the event rate. Both re-run the §7a dollar
    math so cubic yards, the monitor delta, and the value stay consistent.
    """
    fields = set(body.model_fields_set)
    await _require_writable_ticket(repo, tenant, ticket_id)
    if not fields:
        # Nothing to change — return the ticket as-is.
        try:
            return ticket_to_out(await repo.get_ticket(tenant, ticket_id))
        except TicketNotFoundError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    try:
        t = await repo.update_ticket(
            tenant,
            ticket_id,
            truck_id=body.truck_id,
            debris_class=body.debris_class,
            fields_set=fields,
        )
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    await invalidate_cache_tags(f"event:{t.event_id}", f"tenant:{tenant}:billing")
    return ticket_to_out(t)


@router.get("/events/{event_id}/dashboard", response_model=DashboardOut)
async def event_dashboard(repo: Repository, tenant: ActiveTenant, event_id: UUID) -> DashboardOut:
    """Event roll-up: summed dollar-delta, review progress, anomalies, accuracy."""

    async def _compute() -> DashboardOut:
        summary = await repo.dashboard(tenant, event_id)
        return DashboardOut(
            event_id=summary.event_id,
            ticket_count=summary.ticket_count,
            reviewed_count=summary.reviewed_count,
            anomaly_count=summary.anomaly_count,
            overbill_ticket_count=summary.overbill_ticket_count,
            total_delta_cubic_yards=summary.total_delta_cubic_yards,
            total_delta_dollar_value=summary.total_delta_dollar_value,
            accuracy_within_10pct=summary.accuracy_within_10pct,
        )

    return await cached_api(
        tags=[f"event:{event_id}"],
        key=f"dashboard:{tenant}:{event_id}",
        compute=_compute,
        to_dict=lambda d: d.model_dump(mode="json"),
        from_dict=DashboardOut.model_validate,
    )


@router.get("/events/{event_id}/reports/summary", response_model=ReportsSummary)
async def event_reports_summary(
    repo: Repository, tenant: ActiveTenant, event_id: UUID
) -> ReportsSummary:
    """Reports-page roll-up: counts by status/class, dollars, overbill, anomalies."""

    async def _compute() -> ReportsSummary:
        s = await repo.reports_summary(tenant, event_id)
        return ReportsSummary(
            event_id=s.event_id,
            ticket_count=s.ticket_count,
            counts_by_status=s.counts_by_status,
            counts_by_debris_class=s.counts_by_debris_class,
            total_est_dollar_value=s.total_est_dollar_value,
            total_delta_dollar_value=s.total_delta_dollar_value,
            overbill_ticket_count=s.overbill_ticket_count,
            overbill_dollar_value=s.overbill_dollar_value,
            anomaly_counts_by_severity=s.anomaly_counts_by_severity,
            reviewed_count=s.reviewed_count,
            pending_count=s.pending_count,
            accuracy_within_10pct=s.accuracy_within_10pct,
            benchmarked_count=s.benchmarked_count,
        )

    return await cached_api(
        tags=[f"event:{event_id}"],
        key=f"reports_summary:{tenant}:{event_id}",
        compute=_compute,
        to_dict=lambda s: s.model_dump(mode="json"),
        from_dict=ReportsSummary.model_validate,
    )
