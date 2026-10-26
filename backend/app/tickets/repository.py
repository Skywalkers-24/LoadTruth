"""Ticket/event repository — SQLAlchemy-backed, tenant-scoped.

Runs on the interim SQLite DB today and on Supabase Postgres once wired (same
code; only the engine URL changes). Every method filters by ``tenant_id`` in the
query (defense in depth; RLS is the Postgres backstop). Returns the domain
dataclasses from `app.tickets.domain`, so the API/serializers are unchanged.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import models
from app.tickets.domain import Event, Ticket
from app.tickets.schemas import DebrisClass, TicketStatus


class TicketNotFoundError(Exception):
    """Raised when a ticket id is absent (or belongs to another tenant)."""


class DashboardSummary:
    """Event-level roll-up for the dashboard (PLAN.md §3.4, §7a roll-up)."""

    __slots__ = (
        "accuracy_within_10pct",
        "anomaly_count",
        "event_id",
        "overbill_ticket_count",
        "reviewed_count",
        "ticket_count",
        "total_delta_cubic_yards",
        "total_delta_dollar_value",
    )

    def __init__(
        self,
        *,
        event_id: UUID,
        ticket_count: int,
        reviewed_count: int,
        anomaly_count: int,
        overbill_ticket_count: int,
        total_delta_cubic_yards: Decimal,
        total_delta_dollar_value: Decimal,
        accuracy_within_10pct: float | None,
    ) -> None:
        self.event_id = event_id
        self.ticket_count = ticket_count
        self.reviewed_count = reviewed_count
        self.anomaly_count = anomaly_count
        self.overbill_ticket_count = overbill_ticket_count
        self.total_delta_cubic_yards = total_delta_cubic_yards
        self.total_delta_dollar_value = total_delta_dollar_value
        self.accuracy_within_10pct = accuracy_within_10pct


class ReportsSummaryData:
    """Event-level reporting roll-up (data for the reports page).

    Counts tickets by status and by debris class, sums the estimated and delta
    dollars, isolates the overbilled subset, counts anomalies by severity,
    tracks review progress, and carries the benchmark accuracy fraction.
    """

    __slots__ = (
        "accuracy_within_10pct",
        "anomaly_counts_by_severity",
        "counts_by_debris_class",
        "counts_by_status",
        "event_id",
        "overbill_dollar_value",
        "overbill_ticket_count",
        "pending_count",
        "reviewed_count",
        "ticket_count",
        "total_delta_dollar_value",
        "total_est_dollar_value",
    )

    def __init__(
        self,
        *,
        event_id: UUID,
        ticket_count: int,
        counts_by_status: dict[str, int],
        counts_by_debris_class: dict[str, int],
        total_est_dollar_value: Decimal,
        total_delta_dollar_value: Decimal,
        overbill_ticket_count: int,
        overbill_dollar_value: Decimal,
        anomaly_counts_by_severity: dict[str, int],
        reviewed_count: int,
        pending_count: int,
        accuracy_within_10pct: float | None,
    ) -> None:
        self.event_id = event_id
        self.ticket_count = ticket_count
        self.counts_by_status = counts_by_status
        self.counts_by_debris_class = counts_by_debris_class
        self.total_est_dollar_value = total_est_dollar_value
        self.total_delta_dollar_value = total_delta_dollar_value
        self.overbill_ticket_count = overbill_ticket_count
        self.overbill_dollar_value = overbill_dollar_value
        self.anomaly_counts_by_severity = anomaly_counts_by_severity
        self.reviewed_count = reviewed_count
        self.pending_count = pending_count
        self.accuracy_within_10pct = accuracy_within_10pct


def _to_event(row: models.Event) -> Event:
    return Event(
        tenant_id=row.tenant_id,
        name=row.name,
        location=row.location,
        status=row.status,
        rate_table=dict(row.rate_table or {}),
        id=row.id,
        created_at=row.created_at,
    )


def _to_ticket(row: models.Ticket, anomaly_count: int) -> Ticket:
    return Ticket(
        tenant_id=row.tenant_id,
        event_id=row.event_id,
        debris_class=DebrisClass(row.debris_class),
        certified_cubic_yards=row.certified_cubic_yards,
        rate_per_cy=row.rate_per_cy,
        est_fill_pct=row.est_fill_pct,
        est_cubic_yards=row.est_cubic_yards,
        est_dollar_value=row.est_dollar_value,
        truck_id=row.truck_id,
        clip_id=row.clip_id,
        monitor_call_fill_pct=row.monitor_call_fill_pct,
        monitor_cubic_yards=row.monitor_cubic_yards,
        monitor_dollar_value=row.monitor_dollar_value,
        delta_cubic_yards=row.delta_cubic_yards,
        delta_dollar_value=row.delta_dollar_value,
        status=TicketStatus(row.status),
        confirmed_fill_pct=row.confirmed_fill_pct,
        evidence_frames=list(row.evidence_frames or []),
        anomaly_count=anomaly_count,
        id=row.id,
        created_at=row.created_at,
    )


class SqlTicketRepository:
    """Async SQLAlchemy repository. One per request, bound to a session."""

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def _anomaly_counts(self, tenant_id: UUID, ticket_ids: list[UUID]) -> dict[UUID, int]:
        if not ticket_ids:
            return {}
        rows = await self._s.execute(
            select(models.Anomaly.ticket_id, func.count())
            .where(models.Anomaly.tenant_id == tenant_id)
            .where(models.Anomaly.ticket_id.in_(ticket_ids))
            .group_by(models.Anomaly.ticket_id)
        )
        return {tid: int(n) for tid, n in rows.all()}

    async def list_events(self, tenant_id: UUID) -> list[Event]:
        rows = await self._s.execute(
            select(models.Event)
            .where(models.Event.tenant_id == tenant_id)
            .order_by(models.Event.name)
        )
        return [_to_event(r) for r in rows.scalars().all()]

    async def list_tickets(self, tenant_id: UUID, event_id: UUID | None = None) -> list[Ticket]:
        """All tickets for the tenant (optionally one event), newest first.

        This is the whole-event path used by the dashboard roll-up, CSV export,
        and the audit packet — callers that must aggregate every row. For a
        paginated page (the ticket-list UI), use ``list_tickets_page``.
        """
        stmt = select(models.Ticket).where(models.Ticket.tenant_id == tenant_id)
        if event_id is not None:
            stmt = stmt.where(models.Ticket.event_id == event_id)
        stmt = stmt.order_by(models.Ticket.created_at.desc())
        rows = list((await self._s.execute(stmt)).scalars().all())
        counts = await self._anomaly_counts(tenant_id, [r.id for r in rows])
        return [_to_ticket(r, counts.get(r.id, 0)) for r in rows]

    async def list_tickets_page(
        self,
        tenant_id: UUID,
        *,
        event_id: UUID | None = None,
        status: TicketStatus | None = None,
        debris_class: DebrisClass | None = None,
        limit: int,
        offset: int,
    ) -> tuple[list[Ticket], int]:
        """One page of tickets plus the total matching count (newest first).

        Tenant-scoped with optional ``event_id``/``status``/``debris_class``
        filters. Runs a COUNT over the filtered set and a separate LIMIT/OFFSET
        page query so the envelope's ``total`` reflects the full match, not the
        page. The two queries share the same filter predicates.
        """
        filters = [models.Ticket.tenant_id == tenant_id]
        if event_id is not None:
            filters.append(models.Ticket.event_id == event_id)
        if status is not None:
            filters.append(models.Ticket.status == status.value)
        if debris_class is not None:
            filters.append(models.Ticket.debris_class == debris_class.value)

        total = int(
            (
                await self._s.execute(
                    select(func.count()).select_from(models.Ticket).where(*filters)
                )
            ).scalar_one()
        )
        page_stmt = (
            select(models.Ticket)
            .where(*filters)
            .order_by(models.Ticket.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = list((await self._s.execute(page_stmt)).scalars().all())
        counts = await self._anomaly_counts(tenant_id, [r.id for r in rows])
        return [_to_ticket(r, counts.get(r.id, 0)) for r in rows], total

    async def _get_row(self, tenant_id: UUID, ticket_id: UUID) -> models.Ticket:
        row = (
            await self._s.execute(
                select(models.Ticket)
                .where(models.Ticket.tenant_id == tenant_id)
                .where(models.Ticket.id == ticket_id)
            )
        ).scalar_one_or_none()
        if row is None:
            raise TicketNotFoundError(str(ticket_id))
        return row

    async def get_ticket(self, tenant_id: UUID, ticket_id: UUID) -> Ticket:
        row = await self._get_row(tenant_id, ticket_id)
        counts = await self._anomaly_counts(tenant_id, [row.id])
        return _to_ticket(row, counts.get(row.id, 0))

    async def set_monitor_call(
        self, tenant_id: UUID, ticket_id: UUID, monitor_fill_pct: Decimal
    ) -> Ticket:
        row = await self._get_row(tenant_id, ticket_id)
        # Reuse the domain recompute for the §7a delta, then persist the fields.
        dom = _to_ticket(row, 0)
        dom.apply_monitor_call(monitor_fill_pct)
        row.monitor_call_fill_pct = dom.monitor_call_fill_pct
        row.monitor_cubic_yards = dom.monitor_cubic_yards
        row.monitor_dollar_value = dom.monitor_dollar_value
        row.delta_cubic_yards = dom.delta_cubic_yards
        row.delta_dollar_value = dom.delta_dollar_value
        await self._s.flush()
        return await self.get_ticket(tenant_id, ticket_id)

    async def set_status(self, tenant_id: UUID, ticket_id: UUID, status: TicketStatus) -> Ticket:
        row = await self._get_row(tenant_id, ticket_id)
        row.status = status.value
        if status in (TicketStatus.CONFIRMED, TicketStatus.OVERRIDDEN):
            row.confirmed_fill_pct = row.monitor_call_fill_pct or row.est_fill_pct
        await self._s.flush()
        return await self.get_ticket(tenant_id, ticket_id)

    async def add_from_pipeline(self, ticket: Ticket, anomalies: list[object]) -> Ticket:
        """Persist a pipeline-produced draft ticket and its anomalies.

        ``anomalies`` items expose ``.type``, ``.severity``, ``.explanation``,
        ``.evidence_frame`` (the Stage-6 Anomaly dataclass).
        """
        row = models.Ticket(
            id=ticket.id,
            tenant_id=ticket.tenant_id,
            event_id=ticket.event_id,
            truck_id=ticket.truck_id,
            certified_cubic_yards=ticket.certified_cubic_yards,
            debris_class=ticket.debris_class.value,
            rate_per_cy=ticket.rate_per_cy,
            est_fill_pct=ticket.est_fill_pct,
            est_cubic_yards=ticket.est_cubic_yards,
            est_dollar_value=ticket.est_dollar_value,
            status=ticket.status.value,
            evidence_frames=list(ticket.evidence_frames),
        )
        self._s.add(row)
        for a in anomalies:
            self._s.add(
                models.Anomaly(
                    tenant_id=ticket.tenant_id,
                    ticket_id=ticket.id,
                    type=str(a.type),  # type: ignore[attr-defined]
                    severity=str(a.severity),  # type: ignore[attr-defined]
                    explanation=a.explanation,  # type: ignore[attr-defined]
                    evidence_frame=a.evidence_frame,  # type: ignore[attr-defined]
                )
            )
        await self._s.flush()
        return await self.get_ticket(ticket.tenant_id, ticket.id)

    async def get_registry(self, tenant_id: UUID) -> list[tuple[str, str | None, Decimal]]:
        """Certified trucks for the tenant as (number, body_type, capacity)."""
        rows = await self._s.execute(
            select(models.Truck).where(models.Truck.tenant_id == tenant_id)
        )
        return [
            (r.truck_number, r.body_type, r.certified_cubic_yards) for r in rows.scalars().all()
        ]

    async def get_event(self, tenant_id: UUID, event_id: UUID) -> Event | None:
        row = (
            await self._s.execute(
                select(models.Event)
                .where(models.Event.tenant_id == tenant_id)
                .where(models.Event.id == event_id)
            )
        ).scalar_one_or_none()
        return _to_event(row) if row is not None else None

    async def dashboard(self, tenant_id: UUID, event_id: UUID) -> DashboardSummary:
        tickets = await self.list_tickets(tenant_id, event_id)
        reviewed = [
            t for t in tickets if t.status in (TicketStatus.CONFIRMED, TicketStatus.OVERRIDDEN)
        ]
        total_delta_cy = sum((t.delta_cubic_yards or Decimal(0) for t in tickets), Decimal(0))
        total_delta_usd = sum((t.delta_dollar_value or Decimal(0) for t in tickets), Decimal(0))
        return DashboardSummary(
            event_id=event_id,
            ticket_count=len(tickets),
            reviewed_count=len(reviewed),
            anomaly_count=sum(t.anomaly_count for t in tickets),
            overbill_ticket_count=sum(1 for t in tickets if t.is_overbill),
            total_delta_cubic_yards=total_delta_cy,
            total_delta_dollar_value=total_delta_usd,
            accuracy_within_10pct=_accuracy_for_event(event_id),
        )

    async def _anomaly_severity_counts(self, tenant_id: UUID, event_id: UUID) -> dict[str, int]:
        """Anomaly counts by severity for one event's tickets (tenant-scoped)."""
        rows = await self._s.execute(
            select(models.Anomaly.severity, func.count())
            .join(models.Ticket, models.Anomaly.ticket_id == models.Ticket.id)
            .where(models.Anomaly.tenant_id == tenant_id)
            .where(models.Ticket.event_id == event_id)
            .group_by(models.Anomaly.severity)
        )
        return {str(sev): int(n) for sev, n in rows.all()}

    async def reports_summary(self, tenant_id: UUID, event_id: UUID) -> ReportsSummaryData:
        """Build the reports-page roll-up for one event (tenant-scoped)."""
        tickets = await self.list_tickets(tenant_id, event_id)

        counts_by_status: dict[str, int] = {}
        counts_by_debris_class: dict[str, int] = {}
        total_est = Decimal(0)
        total_delta = Decimal(0)
        overbill_count = 0
        overbill_dollars = Decimal(0)
        reviewed = 0
        for t in tickets:
            counts_by_status[t.status.value] = counts_by_status.get(t.status.value, 0) + 1
            counts_by_debris_class[t.debris_class.value] = (
                counts_by_debris_class.get(t.debris_class.value, 0) + 1
            )
            total_est += t.est_dollar_value
            total_delta += t.delta_dollar_value or Decimal(0)
            if t.is_overbill:
                overbill_count += 1
                overbill_dollars += t.delta_dollar_value or Decimal(0)
            if t.status in (TicketStatus.CONFIRMED, TicketStatus.OVERRIDDEN):
                reviewed += 1

        return ReportsSummaryData(
            event_id=event_id,
            ticket_count=len(tickets),
            counts_by_status=counts_by_status,
            counts_by_debris_class=counts_by_debris_class,
            total_est_dollar_value=total_est,
            total_delta_dollar_value=total_delta,
            overbill_ticket_count=overbill_count,
            overbill_dollar_value=overbill_dollars,
            anomaly_counts_by_severity=await self._anomaly_severity_counts(tenant_id, event_id),
            reviewed_count=reviewed,
            pending_count=len(tickets) - reviewed,
            accuracy_within_10pct=_accuracy_for_event(event_id),
        )


# Benchmark accuracy isn't persisted yet (no benchmark run on SQLite). Surface the
# seeded demo figure for the demo event so the dashboard renders the signal.
_SEED_ACCURACY: dict[UUID, float] = {}


def set_seed_accuracy(event_id: UUID, fraction: float) -> None:
    _SEED_ACCURACY[event_id] = fraction


def _accuracy_for_event(event_id: UUID) -> float | None:
    return _SEED_ACCURACY.get(event_id)
