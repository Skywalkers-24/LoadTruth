"""Pydantic v2 schemas for load tickets (API layer).

These are the shapes the API returns and accepts. The monetary fields mirror the
`tickets` table in PLAN.md §7 and the valuation computed in `money.py` (§7a).
`Decimal` is used for all money/volume fields so values stay exact to the cent.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.tickets.money import Number, TicketValuation, value_ticket

if TYPE_CHECKING:
    from app.tickets.domain import Event as DomainEvent
    from app.tickets.domain import Ticket as DomainTicket


class DebrisClass(StrEnum):
    """FEMA debris categories, each paid at a different rate."""

    VEGETATIVE = "vegetative"
    CONSTRUCTION_DEMOLITION = "construction_demolition"
    WHITE_GOODS = "white_goods"
    HAZARDOUS = "hazardous"
    OTHER = "other"


class TicketStatus(StrEnum):
    """Lifecycle of a load ticket. A ticket is a draft until a human confirms."""

    DRAFT = "draft"
    CONFIRMED = "confirmed"
    OVERRIDDEN = "overridden"
    DISPUTED = "disputed"


class ValuationOut(BaseModel):
    """The money frame (PLAN.md §7a): estimate, monitor call, and signed delta."""

    model_config = ConfigDict(from_attributes=True)

    certified_cubic_yards: Decimal
    rate_per_cy: Decimal

    est_fill_pct: Decimal
    est_cubic_yards: Decimal
    est_dollar_value: Decimal

    monitor_fill_pct: Decimal | None = None
    monitor_cubic_yards: Decimal | None = None
    monitor_dollar_value: Decimal | None = None

    delta_cubic_yards: Decimal | None = None
    delta_dollar_value: Decimal | None = None
    is_overbill: bool = False

    @classmethod
    def from_valuation(cls, v: TicketValuation) -> ValuationOut:
        return cls(
            certified_cubic_yards=v.certified_cubic_yards,
            rate_per_cy=v.rate_per_cy,
            est_fill_pct=v.est_fill_pct,
            est_cubic_yards=v.est_cubic_yards,
            est_dollar_value=v.est_dollar_value,
            monitor_fill_pct=v.monitor_fill_pct,
            monitor_cubic_yards=v.monitor_cubic_yards,
            monitor_dollar_value=v.monitor_dollar_value,
            delta_cubic_yards=v.delta_cubic_yards,
            delta_dollar_value=v.delta_dollar_value,
            is_overbill=v.is_overbill,
        )


class MonitorCallIn(BaseModel):
    """The monitor's fill-% call entered in the review console (recomputes delta)."""

    monitor_fill_pct: Decimal = Field(ge=0, le=100)


class TicketOut(BaseModel):
    """A load ticket as returned by the API, with its valuation embedded."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    event_id: UUID
    clip_id: UUID | None = None
    truck_id: str | None = None
    debris_class: DebrisClass
    status: TicketStatus
    confirmed_fill_pct: Decimal | None = None
    evidence_frames: list[str] = Field(default_factory=list)
    anomaly_count: int = 0
    valuation: ValuationOut
    created_at: datetime


class EventOut(BaseModel):
    """A disaster event within a tenant."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    location: str | None = None
    status: str
    rate_table: dict[str, float] = Field(default_factory=dict)
    created_at: datetime


class PaginatedTickets(BaseModel):
    """A page of tickets plus the envelope totals for the ticket-list UI."""

    items: list[TicketOut]
    total: int
    limit: int
    offset: int


class StatusIn(BaseModel):
    """Confirm or override a ticket (the review action)."""

    status: TicketStatus


class DashboardOut(BaseModel):
    """Event-level roll-up: the money frame summed + review/accuracy signals."""

    event_id: UUID
    ticket_count: int
    reviewed_count: int
    anomaly_count: int
    overbill_ticket_count: int
    total_delta_cubic_yards: Decimal
    total_delta_dollar_value: Decimal
    accuracy_within_10pct: float | None = None


class ReportsSummary(BaseModel):
    """Reports-page roll-up: counts, dollars, overbill, anomalies, review state."""

    event_id: UUID
    ticket_count: int
    counts_by_status: dict[str, int] = Field(default_factory=dict)
    counts_by_debris_class: dict[str, int] = Field(default_factory=dict)
    total_est_dollar_value: Decimal
    total_delta_dollar_value: Decimal
    overbill_ticket_count: int
    overbill_dollar_value: Decimal
    anomaly_counts_by_severity: dict[str, int] = Field(default_factory=dict)
    reviewed_count: int
    pending_count: int
    accuracy_within_10pct: float | None = None


def build_valuation(
    *,
    certified_cubic_yards: Number,
    rate_per_cy: Number,
    est_fill_pct: Number,
    monitor_fill_pct: Number | None = None,
) -> ValuationOut:
    """Convenience bridge from raw inputs to the API valuation shape."""
    return ValuationOut.from_valuation(
        value_ticket(
            certified_cubic_yards=certified_cubic_yards,
            rate_per_cy=rate_per_cy,
            est_fill_pct=est_fill_pct,
            monitor_fill_pct=monitor_fill_pct,
        )
    )


def ticket_to_out(t: DomainTicket) -> TicketOut:
    """Serialize a domain Ticket into the API shape (valuation embedded)."""
    valuation = ValuationOut(
        certified_cubic_yards=t.certified_cubic_yards,
        rate_per_cy=t.rate_per_cy,
        est_fill_pct=t.est_fill_pct,
        est_cubic_yards=t.est_cubic_yards,
        est_dollar_value=t.est_dollar_value,
        monitor_fill_pct=t.monitor_call_fill_pct,
        monitor_cubic_yards=t.monitor_cubic_yards,
        monitor_dollar_value=t.monitor_dollar_value,
        delta_cubic_yards=t.delta_cubic_yards,
        delta_dollar_value=t.delta_dollar_value,
        is_overbill=t.is_overbill,
    )
    return TicketOut(
        id=t.id,
        tenant_id=t.tenant_id,
        event_id=t.event_id,
        clip_id=t.clip_id,
        truck_id=t.truck_id,
        debris_class=t.debris_class,
        status=t.status,
        confirmed_fill_pct=t.confirmed_fill_pct,
        evidence_frames=list(t.evidence_frames),
        anomaly_count=t.anomaly_count,
        valuation=valuation,
        created_at=t.created_at,
    )


def event_to_out(e: DomainEvent) -> EventOut:
    """Serialize a domain Event into the API shape."""
    return EventOut(
        id=e.id,
        tenant_id=e.tenant_id,
        name=e.name,
        location=e.location,
        status=e.status,
        rate_table=dict(e.rate_table),
        created_at=e.created_at,
    )
