"""Billing / invoicing routes — what a county pays the contractor.

Per-event and combined (all-events) invoice roll-ups, plus a printable HTML
invoice export (print to PDF). All read-only and tenant-scoped; the dollar math
is reused from the pipeline/valuation layer and never recomputed here.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse

from app.api.repo import ActiveTenant, Repository
from app.tickets.billing import BillingSummary, build_summary
from app.tickets.domain import Ticket
from app.tickets.export import invoice_html
from app.tickets.schemas import (
    BillingLineOut,
    BillingPeriodOut,
    BillingSummaryOut,
)

router = APIRouter(tags=["billing"])


def _to_out(summary: BillingSummary) -> BillingSummaryOut:
    return BillingSummaryOut(
        scope=summary.scope,
        event_id=summary.event_id,
        location=summary.location,
        ticket_count=summary.ticket_count,
        billed_count=summary.billed_count,
        pending_count=summary.pending_count,
        total_cubic_yards=summary.total_cubic_yards,
        total_amount=summary.total_amount,
        settled_amount=summary.settled_amount,
        pending_amount=summary.pending_amount,
        lines=[
            BillingLineOut(
                debris_class=line.debris_class,
                rate_per_cy=line.rate_per_cy,
                ticket_count=line.ticket_count,
                cubic_yards=line.cubic_yards,
                amount=line.amount,
            )
            for line in summary.lines
        ],
        history=[
            BillingPeriodOut(period=p.period, ticket_count=p.ticket_count, amount=p.amount)
            for p in summary.history
        ],
    )


async def _all_tickets(repo: Repository, tenant: ActiveTenant) -> list[Ticket]:
    """Every ticket across all events the tenant owns (for the combined invoice)."""
    return await repo.list_tickets(tenant)


@router.get("/events/{event_id}/billing", response_model=BillingSummaryOut)
async def event_billing(
    repo: Repository, tenant: ActiveTenant, event_id: UUID
) -> BillingSummaryOut:
    """Invoice roll-up for a single event."""
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    tickets = await repo.list_tickets(tenant, event_id)
    summary = build_summary(
        scope=event.name,
        event_id=str(event_id),
        location=event.location,
        tickets=tickets,
    )
    return _to_out(summary)


@router.get("/billing", response_model=BillingSummaryOut)
async def combined_billing(repo: Repository, tenant: ActiveTenant) -> BillingSummaryOut:
    """Combined invoice roll-up across every event the tenant owns."""
    tickets = await _all_tickets(repo, tenant)
    summary = build_summary(
        scope="All events",
        event_id=None,
        location=None,
        tickets=tickets,
    )
    return _to_out(summary)


def _invoice_response(summary: BillingSummary, filename: str) -> HTMLResponse:
    doc = invoice_html(
        scope=summary.scope,
        location=summary.location,
        event_id=summary.event_id,
        ticket_count=summary.ticket_count,
        billed_count=summary.billed_count,
        pending_count=summary.pending_count,
        total_cubic_yards=summary.total_cubic_yards,
        total_amount=summary.total_amount,
        settled_amount=summary.settled_amount,
        pending_amount=summary.pending_amount,
        lines=list(summary.lines),
    )
    return HTMLResponse(
        doc,
        headers={"content-disposition": f'inline; filename="{filename}"'},
    )


@router.get("/events/{event_id}/invoice.html", response_class=HTMLResponse)
async def event_invoice_html(
    repo: Repository, tenant: ActiveTenant, event_id: UUID
) -> HTMLResponse:
    """Printable invoice for one event (HTML; print to PDF)."""
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    tickets = await repo.list_tickets(tenant, event_id)
    summary = build_summary(
        scope=event.name,
        event_id=str(event_id),
        location=event.location,
        tickets=tickets,
    )
    return _invoice_response(summary, f"loadtruth-invoice-{event_id}.html")


@router.get("/billing/invoice.html", response_class=HTMLResponse)
async def combined_invoice_html(repo: Repository, tenant: ActiveTenant) -> HTMLResponse:
    """Printable combined invoice across all events (HTML; print to PDF)."""
    tickets = await _all_tickets(repo, tenant)
    summary = build_summary(
        scope="All events",
        event_id=None,
        location=None,
        tickets=tickets,
    )
    return _invoice_response(summary, "loadtruth-invoice-all.html")
