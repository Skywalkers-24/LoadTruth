"""Portable SQLAlchemy column types that work on both SQLite and Postgres.

The schema targets Supabase Postgres, but we run on SQLite until it is wired
(per the user's direction). These TypeDecorators let one set of ORM models back
both: a native type on Postgres, a portable fallback on SQLite — so moving to
Postgres is a connection-string change, not a model rewrite.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import CHAR
from sqlalchemy.dialects.postgresql import UUID as PgUUID  # noqa: N811 (SQLAlchemy type alias)
from sqlalchemy.types import TypeDecorator


class GUID(TypeDecorator[uuid.UUID]):
    """UUID stored natively on Postgres, as CHAR(36) on SQLite."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PgUUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value: Any, dialect: Any) -> uuid.UUID | None:
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
