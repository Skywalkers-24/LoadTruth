"""Report export routes — CSV + FEMA/FROC audit packet (PLAN.md §3.4)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse, PlainTextResponse

from app.api.repo import ActiveTenant, Repository
from app.tickets.export import audit_packet_html, tickets_to_csv

router = APIRouter(tags=["reports"])


@router.get("/events/{event_id}/export.csv", response_class=PlainTextResponse)
async def export_csv(repo: Repository, tenant: ActiveTenant, event_id: UUID) -> PlainTextResponse:
    """Download the event's tickets as CSV."""
    tickets = await repo.list_tickets(tenant, event_id)
    csv_text = tickets_to_csv(tickets)
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"content-disposition": f'attachment; filename="loadtruth-{event_id}.csv"'},
    )


@router.get("/events/{event_id}/audit-packet.html", response_class=HTMLResponse)
async def export_audit_packet(
    repo: Repository, tenant: ActiveTenant, event_id: UUID
) -> HTMLResponse:
    """Download a printable FEMA/FROC audit packet (HTML; print to PDF)."""
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    tickets = await repo.list_tickets(tenant, event_id)
    summary = await repo.dashboard(tenant, event_id)
    doc = audit_packet_html(
        event_name=event.name,
        event_location=event.location,
        tickets=tickets,
        accuracy_within_10pct=summary.accuracy_within_10pct,
    )
    return HTMLResponse(
        doc,
        headers={"content-disposition": f'attachment; filename="loadtruth-audit-{event_id}.html"'},
    )
