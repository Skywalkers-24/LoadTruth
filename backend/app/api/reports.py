"""Report export routes — CSV + FEMA/FROC audit packet (PLAN.md §3.4)."""

from __future__ import annotations

import re
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse, PlainTextResponse

from app.api.repo import ActiveTenant, Repository
from app.tickets.export import audit_packet_html, tickets_to_csv

router = APIRouter(tags=["reports"])


def _event_filename(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "event"


@router.get("/events/{event_id}/export.csv", response_class=PlainTextResponse)
async def export_csv(repo: Repository, tenant: ActiveTenant, event_id: UUID) -> PlainTextResponse:
    """Download the event's tickets as CSV."""
    # 404 on an unknown/other-tenant event rather than returning an empty 200.
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    tickets = await repo.list_tickets(tenant, event_id)
    csv_text = tickets_to_csv(tickets)
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={
            "content-disposition": (
                f'attachment; filename="loadtruth-{_event_filename(event.name)}.csv"'
            )
        },
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
        provenance_note=(
            "Historical recovery demonstration dataset. Records are synthetic and have not "
            "been verified against official government records."
            if "synthetic-demo" in event.tags
            else None
        ),
    )
    return HTMLResponse(
        doc,
        headers={
            "content-disposition": (
                f'attachment; filename="loadtruth-audit-{_event_filename(event.name)}.html"'
            )
        },
    )
