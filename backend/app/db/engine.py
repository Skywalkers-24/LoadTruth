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
    """Create the app's tables from the ORM metadata (idempotent).

    Runs on both the interim SQLite DB and the local Docker Postgres so the app
    is runnable end-to-end without a migration step — `create_all` only creates
    missing tables. (The production Supabase deploy applies the richer
    `infra/rbac/*.sql` with RLS + pgvector instead; this is the pragmatic local
    path and is safe to run on top of an already-provisioned schema.)
    """
    from app.db import models  # noqa: F401  (register models on the metadata)
    from app.db.base import Base

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
