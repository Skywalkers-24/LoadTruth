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
    """Ticket decision; only tickets needing attention stay in review."""

    DRAFT = "draft"
    CONFIRMED = "confirmed"
    OVERRIDDEN = "overridden"
    DISPUTED = "disputed"


class TicketSort(StrEnum):
    """Columns the ticket ledger can order by (server-side paging + sorting)."""

    CREATED = "created"
    DELTA = "delta"
    MEASURED = "measured"  # estimated cubic yards (the "Measured" ledger column)
    VALUE = "value"  # estimated dollar value


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


class Role(StrEnum):
    """The product's RBAC role vocabulary (PLAN.md §10)."""

    MONITOR = "monitor"
    SUPERVISOR = "supervisor"
    COUNTY_ADMIN = "county_admin"
    AUDITOR = "auditor"
    SUPER_ADMIN = "super_admin"


class UserStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class SourceKind(StrEnum):
    """Where evidence for an event comes from. Each kind validates its own
    connection configuration before it is saved or tested."""

    UPLOAD = "upload"
    S3 = "s3"
    GCS = "gcs"
    AZURE_BLOB = "azure_blob"
    GOOGLE_DRIVE = "google_drive"
    DROPBOX = "dropbox"
    RTSP = "rtsp"
    HLS = "hls"
    WEBHOOK = "webhook"


# Source kinds enabled for use right now. The others (cloud storage) stay fully
# wired — adapter, schema, and config — but are gated off here and in the admin
# UI, so re-enabling one is a single edit with no other code change. The field
# and push sources are the ones in use.
ENABLED_SOURCE_KINDS: frozenset[SourceKind] = frozenset(
    {SourceKind.UPLOAD, SourceKind.RTSP, SourceKind.HLS, SourceKind.WEBHOOK}
)


class SourceStatus(StrEnum):
    """Operational state of a connected source."""

    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"


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


class AnomalyOut(BaseModel):
    """One anomaly flag with its AI-written narrative (Stage 6 / §6)."""

    type: str
    severity: str
    explanation: str
    evidence_frame: str | None = None


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
    # Itemized flags with their narratives. Populated on the single-ticket GET;
    # empty on list responses (where only the count is carried).
    anomalies: list[AnomalyOut] = Field(default_factory=list)
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
    tags: list[str] = Field(default_factory=list)
    created_at: datetime


class EventIn(BaseModel):
    """Create or fully-specify a disaster event (admin screen)."""

    name: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    status: str = Field(default="active")
    rate_table: dict[str, float] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class EventPatch(BaseModel):
    """Partial update of an event; only supplied fields change."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    status: str | None = None
    rate_table: dict[str, float] | None = None
    tags: list[str] | None = None


class TruckOut(BaseModel):
    """A certified-truck registry entry as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    truck_number: str
    body_type: str | None = None
    certified_cubic_yards: Decimal
    registry_source: str | None = None
    created_at: datetime


class TruckIn(BaseModel):
    """Register a certified truck (truck_number unique per tenant)."""

    truck_number: str = Field(min_length=1, max_length=64)
    body_type: str | None = Field(default=None, max_length=64)
    certified_cubic_yards: Decimal = Field(gt=0)
    registry_source: str | None = Field(default=None, max_length=64)


class TruckPatch(BaseModel):
    """Partial update of a truck; only supplied fields change."""

    truck_number: str | None = Field(default=None, min_length=1, max_length=64)
    body_type: str | None = Field(default=None, max_length=64)
    certified_cubic_yards: Decimal | None = Field(default=None, gt=0)
    registry_source: str | None = Field(default=None, max_length=64)


class UserOut(BaseModel):
    """A tenant member as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    email: str
    full_name: str | None = None
    role: Role
    status: UserStatus
    created_at: datetime


class UserIn(BaseModel):
    """Invite/add a member (email unique per tenant)."""

    email: str = Field(min_length=3, max_length=200)
    full_name: str | None = Field(default=None, max_length=120)
    role: Role = Role.MONITOR
    status: UserStatus = UserStatus.ACTIVE


class UserPatch(BaseModel):
    """Partial update of a member; only supplied fields change."""

    email: str | None = Field(default=None, min_length=3, max_length=200)
    full_name: str | None = Field(default=None, max_length=120)
    role: Role | None = None
    status: UserStatus | None = None


class SourceOut(BaseModel):
    """A connected evidence source as returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    event_id: UUID
    kind: SourceKind
    name: str
    config: dict[str, object] = Field(default_factory=dict)
    status: SourceStatus
    created_at: datetime


class SourceIn(BaseModel):
    """Connect a new evidence source to an event."""

    kind: SourceKind
    name: str = Field(min_length=1, max_length=200)
    config: dict[str, object] = Field(default_factory=dict)
    status: SourceStatus = SourceStatus.ACTIVE


class SourcePatch(BaseModel):
    """Partial update of a source; only supplied fields change."""

    kind: SourceKind | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    config: dict[str, object] | None = None
    status: SourceStatus | None = None


class SourceTestResult(BaseModel):
    """Outcome of validating a source's config (no network I/O)."""

    ok: bool
    detail: str


class PaginatedTickets(BaseModel):
    """A page of tickets plus the envelope totals for the ticket-list UI."""

    items: list[TicketOut]
    total: int
    limit: int
    offset: int


class StatusIn(BaseModel):
    """Confirm or override a ticket (the review action)."""

    status: TicketStatus


class TicketPatch(BaseModel):
    """Edit a ticket's identity/classification; only supplied fields change.

    Setting ``truck_id`` re-looks up the certified capacity; setting
    ``debris_class`` re-reads the event rate. Either recomputes the valuation.
    ``truck_id`` may be an empty string or null to mark the truck unidentified.
    """

    truck_id: str | None = Field(default=None, max_length=64)
    debris_class: DebrisClass | None = None


class DashboardOut(BaseModel):
    """Event-level roll-up: the money frame summed + review + monitor-agreement signals.

    ``accuracy_within_10pct`` is the share of reviewed tickets whose measured fill
    lands within 10 points of the monitor's call. It is agreement with the human
    reviewer, not benchmark accuracy against an independently known volume (that
    lives in the benchmark harness, ``app.bench``).
    """

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
    # Number of tickets with a monitor call (the accuracy denominator); lets the
    # "All events" view weight combined accuracy exactly.
    benchmarked_count: int = 0


class BillingLineOut(BaseModel):
    """One invoice line: all loads of a debris class, billed at that rate."""

    debris_class: str
    rate_per_cy: Decimal
    ticket_count: int
    cubic_yards: Decimal
    amount: Decimal


class BillingPeriodOut(BaseModel):
    """One point in the billing-history series (a calendar month)."""

    period: str
    ticket_count: int
    amount: Decimal


class BillingSummaryOut(BaseModel):
    """County→contractor invoice roll-up for one event or all events."""

    scope: str
    event_id: str | None = None
    location: str | None = None
    ticket_count: int
    billed_count: int
    pending_count: int
    total_cubic_yards: Decimal
    total_amount: Decimal
    settled_amount: Decimal
    pending_amount: Decimal
    lines: list[BillingLineOut] = Field(default_factory=list)
    history: list[BillingPeriodOut] = Field(default_factory=list)


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
        tags=list(e.tags),
        created_at=e.created_at,
    )
