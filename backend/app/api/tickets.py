"""Ticket, event, and dashboard API routes.

The review surface (PLAN.md §3.3) and the dashboard money-frame roll-up (§3.4,
§7a) are served here. Recording a monitor call recomputes and persists the
signed dollar-delta via the deterministic `value_ticket()` path — the UI never
does the math itself.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.repo import ActiveTenant, Repository
from app.tickets.repository import TicketNotFoundError
from app.tickets.schemas import (
    DashboardOut,
    DebrisClass,
    EventOut,
    MonitorCallIn,
    PaginatedTickets,
    ReportsSummary,
    StatusIn,
    TicketOut,
    TicketStatus,
    event_to_out,
    ticket_to_out,
)

router = APIRouter(tags=["tickets"])


@router.get("/events", response_model=list[EventOut])
async def list_events(repo: Repository, tenant: ActiveTenant) -> list[EventOut]:
    """List disaster events in the active tenant."""
    events = await repo.list_events(tenant)
    return [event_to_out(e) for e in events]


@router.get("/tickets", response_model=PaginatedTickets)
async def list_tickets(
    repo: Repository,
    tenant: ActiveTenant,
    event_id: UUID | None = None,
    status: TicketStatus | None = None,
    debris_class: DebrisClass | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedTickets:
    """List tickets as a paginated envelope, newest first.

    Supports optional ``event_id``/``status``/``debris_class`` filters and
    ``limit`` (1-100, default 20) / ``offset`` (default 0) paging. ``total`` is
    the full matching count, not the size of the returned page.
    """
    tickets, total = await repo.list_tickets_page(
        tenant,
        event_id=event_id,
        status=status,
        debris_class=debris_class,
        limit=limit,
        offset=offset,
    )
    return PaginatedTickets(
        items=[ticket_to_out(t) for t in tickets],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(repo: Repository, tenant: ActiveTenant, ticket_id: UUID) -> TicketOut:
    """Fetch a single ticket with its valuation and evidence frames."""
    try:
        return ticket_to_out(await repo.get_ticket(tenant, ticket_id))
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc


@router.patch("/tickets/{ticket_id}/monitor-call", response_model=TicketOut)
async def set_monitor_call(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID, body: MonitorCallIn
) -> TicketOut:
    """Record the monitor's fill-% call; recomputes and persists the §7a delta."""
    try:
        t = await repo.set_monitor_call(tenant, ticket_id, body.monitor_fill_pct)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    return ticket_to_out(t)


@router.patch("/tickets/{ticket_id}/status", response_model=TicketOut)
async def set_status(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID, body: StatusIn
) -> TicketOut:
    """Confirm, override, or dispute a ticket (the review action)."""
    if body.status is TicketStatus.DRAFT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot set a ticket back to draft")
    try:
        t = await repo.set_status(tenant, ticket_id, body.status)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    return ticket_to_out(t)


@router.get("/events/{event_id}/dashboard", response_model=DashboardOut)
async def event_dashboard(repo: Repository, tenant: ActiveTenant, event_id: UUID) -> DashboardOut:
    """Event roll-up: summed dollar-delta, review progress, anomalies, accuracy."""
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


@router.get("/events/{event_id}/reports/summary", response_model=ReportsSummary)
async def event_reports_summary(
    repo: Repository, tenant: ActiveTenant, event_id: UUID
) -> ReportsSummary:
    """Reports-page roll-up: counts by status/class, dollars, overbill, anomalies."""
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
    )
