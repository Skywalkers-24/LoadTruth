"""Async SQLAlchemy engine and session factory.

One engine per process; sessions are per-request. The engine connects with the
application DB role; each request then downgrades the transaction to the
Postgres `authenticated` role and binds the caller's JWT claims (see tenant.py),
so Row-Level Security applies exactly as it would for a Supabase client call.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache
from pathlib import Path

from sqlalchemy import Connection, inspect, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings
from app.log import get_logger

log = get_logger("db.engine")
_ALEMBIC_CONFIG_PATH = Path(__file__).resolve().parents[2] / "alembic.ini"


@lru_cache
def get_engine() -> AsyncEngine:
    """Cached async engine.

    SQLite (interim) ignores connection-pool sizing; Postgres (asyncpg) uses a
    small pool sized for a demo deployment.
    """
    settings = get_settings()
    if settings.is_sqlite:
        return create_async_engine(settings.database_url, echo=False)
    return create_async_engine(
        settings.database_url,
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        echo=False,
    )


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=get_engine(),
        expire_on_commit=False,
        autoflush=False,
    )


async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield a plain session (no tenant context). For service-role/worker use."""
    async with get_sessionmaker()() as session:
        yield session


async def init_db() -> None:
    """Apply backend Alembic migrations, then add nullable compatibility columns."""
    from alembic import command
    from alembic.config import Config

    engine = get_engine()
    async with engine.begin() as conn:
        config = Config(str(_ALEMBIC_CONFIG_PATH))

        def upgrade(sync_conn: Connection) -> None:
            config.attributes["connection"] = sync_conn
            command.upgrade(config, "head")

        await conn.run_sync(upgrade)
        await conn.run_sync(_add_missing_columns)


def _add_missing_columns(sync_conn: Connection) -> None:
    """Add nullable columns that exist in the models but not yet in the DB.

    ``create_all`` only creates missing tables, so a new nullable column on an
    existing table (e.g. ``pipeline_stages.details``) would otherwise be absent
    on a database created by an older build. Only additive, nullable columns are
    handled; anything else needs a real migration.
    """
    from app.db.base import Base

    insp = inspect(sync_conn)
    preparer = sync_conn.dialect.identifier_preparer
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing or not col.nullable:
                continue
            col_type = col.type.compile(dialect=sync_conn.dialect)
            # Identifiers come from our own ORM metadata (never user input) and
            # are quoted by the dialect's preparer.
            ddl = (
                f"ALTER TABLE {preparer.quote(table.name)} "  # noqa: S608
                f"ADD COLUMN {preparer.quote(col.name)} {col_type}"
            )
            sync_conn.execute(text(ddl))
            log.info("db_column_added", table=table.name, column=col.name)
