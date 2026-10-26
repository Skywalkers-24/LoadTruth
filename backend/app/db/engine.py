"""Async SQLAlchemy engine and session factory.

One engine per process; sessions are per-request. The engine connects with the
application DB role; each request then downgrades the transaction to the
Postgres `authenticated` role and binds the caller's JWT claims (see tenant.py),
so Row-Level Security applies exactly as it would for a Supabase client call.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings


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
    """Create tables from the ORM metadata.

    Used on the interim SQLite database where there is no Alembic/Postgres SQL
    migration to run. A no-op-safe `create_all` (only creates missing tables).
    On Postgres the schema comes from infra/rbac/*.sql instead, so this is
    skipped there.
    """
    from app.config import get_settings
    from app.db import models  # noqa: F401  (register models on the metadata)
    from app.db.base import Base

    if not get_settings().is_sqlite:
        return
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
