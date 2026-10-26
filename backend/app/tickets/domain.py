"""In-process domain records for events and tickets.

These are plain, immutable-ish dataclasses the repository layer stores and the
API serializes. They are deliberately decoupled from the SQLAlchemy ORM so the
same shapes back both the in-memory repository (demo/dev/test, $0, no DB) and,
later, the Postgres-backed repository — only the repository implementation
changes, not the API or the frontend.

The dollar-delta fields (PLAN.md §7a) are computed by `app.tickets.money` and
stored here; they are never recomputed ad hoc elsewhere.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from app.tickets.money import value_ticket
from app.tickets.schemas import DebrisClass, TicketStatus


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass(slots=True)
class Event:
    """A disaster event scopes work within a tenant."""

    tenant_id: UUID
    name: str
    location: str | None = None
    status: str = "active"
    # $/CY by debris class, e.g. {"vegetative": 8, "construction_demolition": 12}.
    rate_table: dict[str, float] = field(default_factory=dict)
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=_now)

    def rate_for(self, debris_class: DebrisClass | str) -> Decimal:
        key = debris_class.value if isinstance(debris_class, DebrisClass) else debris_class
        return Decimal(str(self.rate_table.get(key, 0)))


@dataclass(slots=True)
class Ticket:
    """A load ticket: machine estimate vs. monitor call, with the signed delta."""

    tenant_id: UUID
    event_id: UUID
    debris_class: DebrisClass
    certified_cubic_yards: Decimal
    rate_per_cy: Decimal
    est_fill_pct: Decimal

    est_cubic_yards: Decimal
    est_dollar_value: Decimal

    truck_id: str | None = None
    clip_id: UUID | None = None

    monitor_call_fill_pct: Decimal | None = None
    monitor_cubic_yards: Decimal | None = None
    monitor_dollar_value: Decimal | None = None
    delta_cubic_yards: Decimal | None = None
    delta_dollar_value: Decimal | None = None

    status: TicketStatus = TicketStatus.DRAFT
    confirmed_fill_pct: Decimal | None = None
    evidence_frames: list[str] = field(default_factory=list)

    anomaly_count: int = 0

    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=_now)

    @property
    def is_overbill(self) -> bool:
        return self.delta_dollar_value is not None and self.delta_dollar_value > 0

    def apply_monitor_call(self, monitor_fill_pct: Decimal) -> None:
        """Set the monitor's call and recompute the persisted delta (§7a)."""
        v = value_ticket(
            certified_cubic_yards=self.certified_cubic_yards,
            rate_per_cy=self.rate_per_cy,
            est_fill_pct=self.est_fill_pct,
            monitor_fill_pct=monitor_fill_pct,
        )
        self.monitor_call_fill_pct = v.monitor_fill_pct
        self.monitor_cubic_yards = v.monitor_cubic_yards
        self.monitor_dollar_value = v.monitor_dollar_value
        self.delta_cubic_yards = v.delta_cubic_yards
        self.delta_dollar_value = v.delta_dollar_value


def new_ticket(
    *,
    tenant_id: UUID,
    event_id: UUID,
    debris_class: DebrisClass,
    certified_cubic_yards: Decimal | float | str,
    rate_per_cy: Decimal | float | str,
    est_fill_pct: Decimal | float | str,
    truck_id: str | None = None,
    clip_id: UUID | None = None,
    monitor_call_fill_pct: Decimal | float | str | None = None,
    evidence_frames: list[str] | None = None,
    anomaly_count: int = 0,
) -> Ticket:
    """Build a ticket, computing all volume/dollar/delta fields from the inputs."""
    v = value_ticket(
        certified_cubic_yards=certified_cubic_yards,
        rate_per_cy=rate_per_cy,
        est_fill_pct=est_fill_pct,
        monitor_fill_pct=monitor_call_fill_pct,
    )
    return Ticket(
        tenant_id=tenant_id,
        event_id=event_id,
        debris_class=debris_class,
        certified_cubic_yards=v.certified_cubic_yards,
        rate_per_cy=v.rate_per_cy,
        est_fill_pct=v.est_fill_pct,
        est_cubic_yards=v.est_cubic_yards,
        est_dollar_value=v.est_dollar_value,
        truck_id=truck_id,
        clip_id=clip_id,
        monitor_call_fill_pct=v.monitor_fill_pct,
        monitor_cubic_yards=v.monitor_cubic_yards,
        monitor_dollar_value=v.monitor_dollar_value,
        delta_cubic_yards=v.delta_cubic_yards,
        delta_dollar_value=v.delta_dollar_value,
        evidence_frames=evidence_frames or [],
        anomaly_count=anomaly_count,
    )
