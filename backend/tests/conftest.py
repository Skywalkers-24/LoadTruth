"""Shared test fixtures: an isolated SQLite database per test.

Each test gets a fresh in-memory SQLite engine with the schema created and the
demo tenant seeded, wired into the app via a `get_repository` dependency
override. This exercises the real SQLAlchemy repository (not a mock), so the
tests track what runs in the demo build and will track Postgres later.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.ai import get_ai_client
from app.api.repo import get_repository
from app.config import get_settings
from app.db.base import Base
from app.main import app
from app.tickets.repository import SqlTicketRepository
from app.tickets.seed import seed_demo


@pytest_asyncio.fixture
async def sessionmaker() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """A fresh in-memory SQLite DB with schema + demo seed, per test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        await seed_demo(session)
    try:
        yield maker
    finally:
        await engine.dispose()


@pytest.fixture
def client(sessionmaker: async_sessionmaker[AsyncSession]) -> Iterator[TestClient]:
    async def _override() -> AsyncIterator[SqlTicketRepository]:
        async with sessionmaker() as session:
            try:
                yield SqlTicketRepository(session)
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    os.environ["LOADTRUTH_SKIP_STARTUP_DB"] = "1"
    os.environ["MOCK_AI"] = "1"  # pipeline resolves from fixtures, never live
    get_settings.cache_clear()
    get_ai_client.cache_clear()
    app.dependency_overrides[get_repository] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
