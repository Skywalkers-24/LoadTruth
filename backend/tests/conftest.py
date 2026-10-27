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
from app.api.deps import current_member
from app.api.repo import get_repository
from app.auth.session import Session
from app.config import get_settings
from app.db.base import Base
from app.main import app
from app.tickets.repository import SqlTicketRepository
from app.tickets.seed import DEMO_TENANT_ID, seed_demo


@pytest.fixture(autouse=True)
def _no_meta_api_log(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Tests never append to the real logs/meta_api.jsonl."""
    monkeypatch.setenv("MODEL_API_LOG_PATH", "")
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _isolated_evidence_dir(
    tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch
) -> Iterator[None]:
    """Tests store evidence media in a temp dir, never the repo's media/."""
    monkeypatch.setenv("EVIDENCE_DIR", str(tmp_path_factory.mktemp("evidence")))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def make_session(role: str = "super_admin", email: str = "test@loadtruth.io") -> Session:
    """A test session identity for the demo tenant with the given role."""
    return Session(
        user_id="00000000-0000-0000-0000-0000000000aa",
        tenant_id=str(DEMO_TENANT_ID),
        email=email,
        role=role,
        full_name="Test User",
    )


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
    # Default to an authenticated super_admin so existing API tests pass; tests
    # that assert RBAC override current_member with as_role(...) below.
    app.dependency_overrides[current_member] = lambda: make_session()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def as_role(client: TestClient):
    """Return a callable that re-binds the signed-in role for RBAC tests."""

    def _set(role: str) -> None:
        app.dependency_overrides[current_member] = lambda: make_session(role=role)

    return _set
