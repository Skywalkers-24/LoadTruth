"""The durable, content-hash-keyed AI result store (CachingAIClient).

Proves the "run the vision models once per clip, then serve from the DB"
guarantee: the wrapped client is called at most once per stage per clip, the raw
outputs are persisted, and a second run (a restart, or a re-ingest) replays them
from the database with no model call.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.ai.base import ClassifyResult, OCRResult, TrackedObject, TrackResult
from app.ai.cached_client import CachingAIClient
from app.db.base import Base
from app.tickets.repository import SqlTicketRepository
from app.tickets.seed import DEMO_TENANT_ID

TENANT = DEMO_TENANT_ID
HASH = "a" * 64


class CountingAIClient:
    """A stand-in AIClient that counts calls so we can assert "run once"."""

    def __init__(self) -> None:
        self.track_calls = 0
        self.ocr_calls = 0
        self.classify_calls = 0
        self.narrate_calls = 0

    async def track(self, content_hash: str) -> TrackResult:
        self.track_calls += 1
        return TrackResult(
            objects=[
                TrackedObject("truck bed", "obj-1", [26000.0, 26100.0], 0.0),
                TrackedObject("debris pile", "obj-2", [20000.0, 20100.0], 0.82),
            ],
            frame_count=12,
        )

    async def read_placard(self, content_hash: str) -> OCRResult:
        self.ocr_calls += 1
        return OCRResult(truck_id="FL-DT-3391", confidence=0.93, frame_ref="frame-7")

    async def classify_debris(self, content_hash: str) -> ClassifyResult:
        self.classify_calls += 1
        return ClassifyResult(debris_class="construction_demolition", confidence=0.88)

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> str:
        self.narrate_calls += 1
        return "narrative"


@pytest_asyncio.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker: async_sessionmaker[AsyncSession] = async_sessionmaker(
        bind=engine, expire_on_commit=False
    )
    async with maker() as s:
        yield s
    await engine.dispose()


@pytest.mark.asyncio
async def test_first_run_calls_model_and_persists(session: AsyncSession) -> None:
    repo = SqlTicketRepository(session)
    inner = CountingAIClient()
    client = CachingAIClient(inner, repo, TENANT, model_label="sam-3.1 · muse-spark-1.3")

    track = await client.track(HASH)
    ocr = await client.read_placard(HASH)
    classify = await client.classify_debris(HASH)

    # The real model ran exactly once per stage.
    assert (inner.track_calls, inner.ocr_calls, inner.classify_calls) == (1, 1, 1)
    # And the raw outputs are now persisted, tenant+hash+stage scoped.
    assert await repo.get_ai_stage_result(TENANT, HASH, "sam_track") is not None
    assert await repo.get_ai_stage_result(TENANT, HASH, "spark_ocr") is not None
    assert await repo.get_ai_stage_result(TENANT, HASH, "spark_classify") is not None
    # Returned values are the model's.
    assert track.frame_count == 12
    assert ocr.truck_id == "FL-DT-3391"
    assert classify.debris_class == "construction_demolition"


@pytest.mark.asyncio
async def test_second_run_replays_from_db_without_model(session: AsyncSession) -> None:
    repo = SqlTicketRepository(session)
    inner = CountingAIClient()

    # First run (populates the store).
    first = CachingAIClient(inner, repo, TENANT)
    t1 = await first.track(HASH)
    o1 = await first.read_placard(HASH)
    c1 = await first.classify_debris(HASH)

    # A brand-new client instance (simulating a fresh process/restart) over the
    # same durable store must NOT call the model again.
    second = CachingAIClient(inner, repo, TENANT)
    t2 = await second.track(HASH)
    o2 = await second.read_placard(HASH)
    c2 = await second.classify_debris(HASH)

    assert (inner.track_calls, inner.ocr_calls, inner.classify_calls) == (1, 1, 1)
    # Replayed values round-trip exactly.
    assert t2 == t1
    assert o2 == o1
    assert c2 == c1


@pytest.mark.asyncio
async def test_results_are_tenant_scoped(session: AsyncSession) -> None:
    repo = SqlTicketRepository(session)
    inner = CountingAIClient()
    other_tenant = UUID("99999999-9999-9999-9999-999999999999")

    await CachingAIClient(inner, repo, TENANT).track(HASH)
    # A different tenant with the same clip hash sees no cached result, so its
    # own model call runs (no cross-tenant leakage).
    await CachingAIClient(inner, repo, other_tenant).track(HASH)

    assert inner.track_calls == 2
    assert await repo.get_ai_stage_result(TENANT, HASH, "sam_track") is not None
    assert await repo.get_ai_stage_result(other_tenant, HASH, "sam_track") is not None
