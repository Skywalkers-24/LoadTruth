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
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)


class Source(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """A connected evidence source for an event (PLAN.md §3, §5b): not upload-only.

    ``kind`` is stored as text validated by the ``SourceKind`` enum at the Python
    layer (matching the SQL CHECK). ``config`` holds the per-kind connection
    settings (e.g. an RTSP ``url``, a bucket + prefix) as portable JSON.
    """

    __tablename__ = "sources"

    event_id: Mapped[uuid.UUID] = mapped_column(GUID(), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    config: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")

    __table_args__ = (
        Index("ix_sources_tenant", "tenant_id"),
        Index("ix_sources_event", "event_id"),
    )


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


class User(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """A tenant member and their role (PLAN.md §10 role vocabulary).

    In the full Supabase deployment, membership + roles live in the vendored
    ``rbac.members``/``rbac.groups`` tables governed by RLS. In this interim
    SQLite build (single seeded tenant, no auth), we persist members in a
    tenant-scoped table so the admin Users screen is real CRUD, not a mock.
    ``role`` is one of the product roles, validated by the ``Role`` enum at the
    Python layer. ``email`` is unique per tenant.
    """

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(200), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(24), nullable=False, default="monitor")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")

    __table_args__ = (Index("ix_users_tenant_email", "tenant_id", "email", unique=True),)


class Anomaly(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """A deterministic flag raised against a ticket (Stage 6)."""

    __tablename__ = "anomalies"

    ticket_id: Mapped[uuid.UUID] = mapped_column(GUID(), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(8), nullable=False, default="info")
    explanation: Mapped[str | None] = mapped_column(String(512), nullable=True)
    evidence_frame: Mapped[str | None] = mapped_column(String(128), nullable=True)

    __table_args__ = (Index("ix_anomalies_tenant_ticket", "tenant_id", "ticket_id"),)


class PipelineStageRow(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """One persisted AI pipeline stage for a ticket (Stage 2-7 trace).

    Stored so each ticket keeps its full AI analysis permanently — the visible
    "how the numbers were produced" trace survives restarts and the in-memory
    job buffer. Ordered by ``position`` within a ticket.
    """

    __tablename__ = "pipeline_stages"

    ticket_id: Mapped[uuid.UUID] = mapped_column(GUID(), nullable=False)
    position: Mapped[int] = mapped_column(Numeric(4, 0), nullable=False, default=0)
    stage_key: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(48), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="ok")
    summary: Mapped[str] = mapped_column(String(512), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    duration_ms: Mapped[float] = mapped_column(Numeric(10, 1), nullable=False, default=0)
    # Ordered [label, value] facts from the model's response (raw answer,
    # tokens, cost, objects found, measurement inputs).
    details: Mapped[list[list[str]] | None] = mapped_column(JSON, nullable=True)
    # Model-authored "AI analysis" paragraph for the Pipeline screen (nullable:
    # older rows and deterministic-only runs have none, the UI falls back to the
    # summary). Added additively by _add_missing_columns on existing DBs.
    analysis: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    __table_args__ = (Index("ix_pipeline_stages_tenant_ticket", "tenant_id", "ticket_id"),)


class AIStageResult(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """A raw AI stage output, persisted durably and keyed by the clip's content hash.

    This is the backbone of "run the vision models once, serve everything else
    from the DB." Each row stores the full structured output of one model stage
    (SAM track, Spark OCR, Spark classify) for one clip, so a re-ingest of the
    same bytes — or a later recompute with improved deterministic math — replays
    the stored result instead of re-calling (and re-paying) the model.

    Keyed by ``(tenant_id, content_hash, stage_key)`` and unique on that triple,
    so a stage runs at most once per clip per tenant. ``result_json`` holds the
    serialized dataclass (see ``app.ai.serde``); ``model`` records which model
    produced it so a config change is visible; ``confidence`` is lifted out for
    cheap querying/auditing.
    """

    __tablename__ = "ai_stage_results"

    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    stage_key: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(48), nullable=False, default="")
    result_json: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)

    __table_args__ = (
        Index(
            "ix_ai_stage_results_lookup",
            "tenant_id",
            "content_hash",
            "stage_key",
            unique=True,
        ),
    )


class TicketEvidence(UUIDPrimaryKeyMixin, TenantScopedMixin, TimestampMixin, Base):
    """The processed clip behind a ticket and SAM 3.1's raw segmentation of it.

    ``content_hash`` names the media file in the evidence store (the exact video
    or image the models saw). ``segments`` maps each SAM concept ("truck bed",
    "debris pile") to the model's raw output text, so the Review console can
    draw SAM's boxes and masks over the video frame by frame. ``fps`` is the
    frame rate of the stored video when known (it maps SAM frame indexes to
    playback time).
    """

    __tablename__ = "ticket_evidence"

    ticket_id: Mapped[uuid.UUID] = mapped_column(GUID(), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    media_kind: Mapped[str] = mapped_column(String(8), nullable=False, default="video")
    mime: Mapped[str] = mapped_column(String(48), nullable=False, default="video/mp4")
    fps: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    ai_cache_namespace: Mapped[str | None] = mapped_column(String(16), nullable=True)
    segments: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_ticket_evidence_tenant_ticket", "tenant_id", "ticket_id", unique=True),
    )
