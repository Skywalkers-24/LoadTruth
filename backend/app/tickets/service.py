"""Ticket service business logic layer.

Coordinates repository data access, domain calculations, and schema conversions.
Follows the layered architecture pattern:
API Router -> Service -> Repository -> Model -> Schema
"""

from __future__ import annotations

from uuid import UUID

from app.tickets.repository import (
    EventNotFoundError,
    ReverifyResult,
    SqlTicketRepository,
)
from app.tickets.schemas import (
    AnomalyOut,
    DashboardOut,
    DebrisClass,
    EventOut,
    MonitorCallIn,
    PaginatedTickets,
    ReportsSummary,
    SortOrder,
    TicketOut,
    TicketPatch,
    TicketSort,
    TicketStatus,
    event_to_out,
    ticket_to_out,
)


class TicketService:
    """Business service orchestrating tickets, events, and audit operations."""

    def __init__(self, repo: SqlTicketRepository) -> None:
        self.repo = repo

    async def get_ticket(self, tenant_id: UUID, ticket_id: UUID) -> TicketOut:
        """Fetch a ticket by ID, enrich with anomalies, and return outgoing schema."""
        ticket = await self.repo.get_ticket(tenant_id, ticket_id)
        out = ticket_to_out(ticket)
        rows = await self.repo.list_anomalies_for_ticket(tenant_id, ticket_id)
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

    async def list_tickets_page(
        self,
        tenant_id: UUID,
        *,
        event_id: UUID | None = None,
        status: TicketStatus | None = None,
        debris_class: DebrisClass | None = None,
        limit: int = 20,
        offset: int = 0,
        sort: TicketSort = TicketSort.CREATED,
        order: SortOrder = SortOrder.DESC,
    ) -> PaginatedTickets:
        """List tickets with pagination, search, and sorting."""
        tickets, total = await self.repo.list_tickets_page(
            tenant_id,
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

    async def record_monitor_call(
        self,
        tenant_id: UUID,
        ticket_id: UUID,
        call: MonitorCallIn,
    ) -> TicketOut:
        """Record monitor call and recompute deterministic billing delta."""
        ticket = await self.repo.set_monitor_call(
            tenant_id,
            ticket_id,
            call.monitor_fill_pct,
        )
        return ticket_to_out(ticket)

    async def set_ticket_status(
        self,
        tenant_id: UUID,
        ticket_id: UUID,
        status: TicketStatus,
    ) -> TicketOut:
        """Update ticket lifecycle status."""
        ticket = await self.repo.set_status(tenant_id, ticket_id, status)
        return ticket_to_out(ticket)

    async def update_ticket(
        self,
        tenant_id: UUID,
        ticket_id: UUID,
        patch: TicketPatch,
    ) -> TicketOut:
        """Apply partial updates to a ticket."""
        ticket = await self.repo.update_ticket(
            tenant_id,
            ticket_id,
            truck_id=patch.truck_id,
            debris_class=patch.debris_class,
            fields_set=patch.model_fields_set,
        )
        return ticket_to_out(ticket)

    async def delete_ticket(self, tenant_id: UUID, ticket_id: UUID) -> None:
        """Delete a ticket by ID."""
        await self.repo.delete_ticket(tenant_id, ticket_id)

    async def reverify_ticket(self, tenant_id: UUID, ticket_id: UUID) -> ReverifyResult:
        """Replay geometry over SAM masks to prove deterministic fill % and hash."""
        return await self.repo.reverify_ticket(tenant_id, ticket_id)

    async def get_dashboard(self, tenant_id: UUID, event_id: UUID) -> DashboardOut:
        """Compute rollup metrics for an event dashboard."""
        summary = await self.repo.dashboard(tenant_id, event_id)
        return DashboardOut(
            event_id=event_id,
            ticket_count=summary.ticket_count,
            reviewed_count=summary.reviewed_count,
            anomaly_count=summary.anomaly_count,
            overbill_ticket_count=summary.overbill_ticket_count,
            total_delta_cubic_yards=summary.total_delta_cubic_yards,
            total_delta_dollar_value=summary.total_delta_dollar_value,
            accuracy_within_10pct=summary.accuracy_within_10pct,
        )

    async def get_reports_summary(self, tenant_id: UUID, event_id: UUID) -> ReportsSummary:
        """Fetch audit report summary metrics."""
        summary = await self.repo.reports_summary(tenant_id, event_id)
        return ReportsSummary(
            event_id=event_id,
            ticket_count=summary.ticket_count,
            total_est_dollar_value=summary.total_est_dollar_value,
            total_delta_dollar_value=summary.total_delta_dollar_value,
            overbill_ticket_count=summary.overbill_ticket_count,
            overbill_dollar_value=summary.overbill_dollar_value,
            reviewed_count=summary.reviewed_count,
            pending_count=summary.pending_count,
            counts_by_debris_class=summary.counts_by_debris_class,
            counts_by_status=summary.counts_by_status,
        )

    async def list_events(self, tenant_id: UUID) -> list[EventOut]:
        """List all events for a tenant."""
        events = await self.repo.list_events(tenant_id)
        return [event_to_out(ev) for ev in events]

    async def get_event(self, tenant_id: UUID, event_id: UUID) -> EventOut:
        """Get a single event by ID."""
        event = await self.repo.get_event(tenant_id, event_id)
        if not event:
            raise EventNotFoundError(event_id)
        return event_to_out(event)
