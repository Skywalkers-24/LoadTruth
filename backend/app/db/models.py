"""ORM models (PLAN.md §7), portable across SQLite (interim) and Postgres.

Columns mirror infra/rbac/20_loadtruth_schema.sql. Postgres-only concerns in that
file (RLS policies, pgvector embedding, rbac.groups FKs) are intentionally NOT
replicated here — they attach when Supabase Postgres is wired. ``debris_class``
and ``status`` are stored as text (validated by the DebrisClass/TicketStatus
enums at the Python layer), matching the SQL CHECK constraints.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import JSON, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TenantScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.types import GUID

# Volume in cubic yards: 10.3 digits. Dollars: 2 dp. Percent: 5.2.
_CY = Numeric(10, 3)
_USD = Numeric(12, 2)
_PCT = Numeric(5, 2)


class Event(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """A disaster event scopes work within a tenant."""

    __tablename__ = "events"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    # $/CY by debris class, e.g. {"vegetative": 8, "construction_demolition": 12}.
    rate_table: Mapped[dict[str, float]] = mapped_column(JSON, nullable=False, default=dict)


class Truck(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """Certified-truck registry entry (capacity lookup, Stage 4)."""

    __tablename__ = "trucks"

    truck_number: Mapped[str] = mapped_column(String(64), nullable=False)
    body_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    certified_cubic_yards: Mapped[Decimal] = mapped_column(_CY, nullable=False)
    registry_source: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (Index("ix_trucks_tenant_number", "tenant_id", "truck_number", unique=True),)


class Ticket(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """A verified-load ticket: machine estimate vs. monitor call, with the delta."""

    __tablename__ = "tickets"

    event_id: Mapped[uuid.UUID] = mapped_column(GUID(), nullable=False)
    clip_id: Mapped[uuid.UUID | None] = mapped_column(GUID(), nullable=True)
    # OCR'd/placard truck id as text (matched to a Truck row at Stage 4).
    truck_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    certified_cubic_yards: Mapped[Decimal] = mapped_column(_CY, nullable=False)
    debris_class: Mapped[str] = mapped_column(String(32), nullable=False)
    rate_per_cy: Mapped[Decimal] = mapped_column(_USD, nullable=False, default=Decimal(0))

    # LoadTruth's measured estimate (Stage 5).
    est_fill_pct: Mapped[Decimal] = mapped_column(_PCT, nullable=False)
    est_cubic_yards: Mapped[Decimal] = mapped_column(_CY, nullable=False)
    est_dollar_value: Mapped[Decimal] = mapped_column(_USD, nullable=False)

    # The human monitor's call — the baseline (set at review time).
    monitor_call_fill_pct: Mapped[Decimal | None] = mapped_column(_PCT, nullable=True)
    monitor_cubic_yards: Mapped[Decimal | None] = mapped_column(_CY, nullable=True)
    monitor_dollar_value: Mapped[Decimal | None] = mapped_column(_USD, nullable=True)

    # Persisted signed delta (monitor - LoadTruth) — the demo's money frame (§7a).
    delta_cubic_yards: Mapped[Decimal | None] = mapped_column(_CY, nullable=True)
    delta_dollar_value: Mapped[Decimal | None] = mapped_column(_USD, nullable=True)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    confirmed_fill_pct: Mapped[Decimal | None] = mapped_column(_PCT, nullable=True)
    evidence_frames: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    __table_args__ = (
        Index("ix_tickets_tenant_event", "tenant_id", "event_id"),
        Index("ix_tickets_tenant_status", "tenant_id", "status"),
    )


class Anomaly(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """A deterministic flag raised against a ticket (Stage 6)."""

    __tablename__ = "anomalies"

    ticket_id: Mapped[uuid.UUID] = mapped_column(GUID(), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(8), nullable=False, default="info")
    explanation: Mapped[str | None] = mapped_column(String(512), nullable=True)
    evidence_frame: Mapped[str | None] = mapped_column(String(128), nullable=True)

    __table_args__ = (Index("ix_anomalies_tenant_ticket", "tenant_id", "ticket_id"),)
