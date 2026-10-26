"""SQLAlchemy 2.0 declarative base and shared column mixins.

All operational tables carry ``tenant_id`` (PLAN.md §2 tenancy model). On
Postgres this is backstopped by RLS keyed on the JWT ``tenant_id`` claim; on
SQLite (the interim DB) isolation is enforced in the query/repository layer. The
ORM filters by tenant either way (defense in depth, PLAN.md §10).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.types import GUID


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


class UUIDPrimaryKeyMixin:
    """Application-generated UUID primary key (portable across dialects)."""

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    """Creation timestamp. Set in Python so it is identical on SQLite and PG."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
    )


class TenantScopedMixin:
    """Every operational row is scoped to a tenant. Indexed for tenant-filtered reads."""

    tenant_id: Mapped[uuid.UUID] = mapped_column(GUID(), nullable=False, index=True)
