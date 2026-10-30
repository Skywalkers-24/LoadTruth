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

from app.ai import sam_measure, serde
from app.ai.base import (
    ClassifyResult,
    ClipMedia,
    Narration,
    OCRResult,
    StageExplanations,
    TrackedObject,
    TrackResult,
)
from app.ai.cached_client import CachingAIClient
from app.ai.sam_measure import Box, Detection
from app.db.base import Base
from app.tickets.repository import SqlTicketRepository
from app.tickets.seed import DEMO_TENANT_ID

TENANT = DEMO_TENANT_ID
HASH = "a" * 64
CLIP = ClipMedia(content_hash=HASH)


class CountingAIClient:
    """A stand-in AIClient that counts calls so we can assert "run once"."""

    def __init__(self) -> None:
        self.track_calls = 0
        self.ocr_calls = 0
        self.classify_calls = 0
        self.narrate_calls = 0

    async def track(self, clip: ClipMedia) -> TrackResult:
        self.track_calls += 1
        return TrackResult(
            objects=[
                TrackedObject("truck bed", "obj-1", [26000.0, 26100.0], 0.0),
                TrackedObject("debris pile", "obj-2", [20000.0, 20100.0], 0.82),
            ],
            frame_count=12,
        )

    async def read_placard(self, clip: ClipMedia) -> OCRResult:
        self.ocr_calls += 1
        return OCRResult(truck_id="FL-DT-3391", confidence=0.93, frame_ref="frame-7")

    async def classify_debris(self, clip: ClipMedia) -> ClassifyResult:
        self.classify_calls += 1
        return ClassifyResult(
            debris_class="construction_demolition",
            confidence=0.88,
            visual_fill_pct=72.35,
            frame_fill_pcts=(70.0, 72.35, 75.0),
        )

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> Narration:
        self.narrate_calls += 1
        return Narration("narrative")

    async def explain_pipeline(self, facts: dict[str, object]) -> StageExplanations:
        return StageExplanations(by_stage={})

    async def answer_question(self, prompt: str) -> Narration:
        return Narration("")


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

    track = await client.track(CLIP)
    ocr = await client.read_placard(CLIP)
    classify = await client.classify_debris(CLIP)

    # The real model ran exactly once per stage.
    assert (inner.track_calls, inner.ocr_calls, inner.classify_calls) == (1, 1, 1)
    # And the raw outputs are now persisted, tenant+hash+stage scoped.
    assert await repo.get_ai_stage_result(TENANT, HASH, "sam_track") is not None
    assert await repo.get_ai_stage_result(TENANT, HASH, "spark_ocr") is not None
    assert await repo.get_ai_stage_result(TENANT, HASH, serde.STAGE_CLASSIFY) is not None
    # Returned values are the model's.
    assert track.frame_count == 12
    assert ocr.truck_id == "FL-DT-3391"
    assert classify.debris_class == "construction_demolition"
    assert classify.visual_fill_pct == 72.35
    assert classify.frame_fill_pcts == (70.0, 72.35, 75.0)


@pytest.mark.asyncio
async def test_second_run_replays_from_db_without_model(session: AsyncSession) -> None:
    repo = SqlTicketRepository(session)
    inner = CountingAIClient()

    # First run (populates the store).
    first = CachingAIClient(inner, repo, TENANT)
    t1 = await first.track(CLIP)
    o1 = await first.read_placard(CLIP)
    c1 = await first.classify_debris(CLIP)

    # A brand-new client instance (simulating a fresh process/restart) over the
    # same durable store must NOT call the model again.
    second = CachingAIClient(inner, repo, TENANT)
    t2 = await second.track(CLIP)
    o2 = await second.read_placard(CLIP)
    c2 = await second.classify_debris(CLIP)

    assert (inner.track_calls, inner.ocr_calls, inner.classify_calls) == (1, 1, 1)
    # Replayed values round-trip exactly.
    assert t2 == t1
    assert o2 == o1
    assert c2 == c1
    assert c2.frame_fill_pcts == (70.0, 72.35, 75.0)
    # A replay is reported to the ledger as a $0 cache hit.
    assert t2.usage is not None and t2.usage.cached and t2.usage.cost_usd == 0.0


@pytest.mark.asyncio
async def test_results_are_tenant_scoped(session: AsyncSession) -> None:
    repo = SqlTicketRepository(session)
    inner = CountingAIClient()
    other_tenant = UUID("99999999-9999-9999-9999-999999999999")

    await CachingAIClient(inner, repo, TENANT).track(CLIP)
    # A different tenant with the same clip hash sees no cached result, so its
    # own model call runs (no cross-tenant leakage).
    await CachingAIClient(inner, repo, other_tenant).track(CLIP)

    assert inner.track_calls == 2
    assert await repo.get_ai_stage_result(TENANT, HASH, "sam_track") is not None
    assert await repo.get_ai_stage_result(other_tenant, HASH, "sam_track") is not None


_BED_TXT = "<0f>0<|box;x1=100;y1=100;x2=299;y2=199;w=1000;h=1000|>\n"
_RIM_TXT = "<0f>0<|box;x1=100;y1=160;x2=299;y2=199;w=1000;h=1000|>\n"
_LOAD_TXT = "<0f>0<|box;x1=100;y1=100;x2=299;y2=159;w=1000;h=1000|>\n"


def _old_track_row(*, with_rim: bool, with_load: bool = True) -> dict[str, object]:
    """A live track stored by an older measurement version.

    ``with_load`` controls whether a SAM load phrase matched (``load_source``):
    a track with no load can't be replayed offline and must re-run SAM.
    """
    sam_output = {"truck bed": _BED_TXT, "debris pile": _LOAD_TXT if with_load else ""}
    if with_rim:
        sam_output["tailgate"] = _RIM_TXT
    return {
        "frame_count": 1,
        "sam_output": sam_output,
        "load_source": "segmented" if with_load else "none",
        "measure_version": 1,
        "sam_prompt_version": sam_measure.SAM_PROMPT_VERSION,
        "objects": [
            {"label": "truck bed", "sam_object_id": "bed-0", "mask_areas": [1.0]},
            {
                "label": "debris pile",
                "sam_object_id": "load",
                "mask_areas": [1.0 if with_load else 0.0],
            },
        ],
    }


@pytest.mark.asyncio
async def test_outdated_track_with_every_concept_is_remeasured_offline(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Stand in for the SAM parser: each stored text decodes to one box.
    boxes = {
        _BED_TXT: Box(100, 100, 300, 200),
        _RIM_TXT: Box(100, 160, 300, 200),
        _LOAD_TXT: Box(100, 100, 300, 160),
    }
    monkeypatch.setattr(
        sam_measure,
        "parse_segmentation",
        lambda text, media_kind: (
            [Detection(0, "0", boxes[text], media_size=(1000, 1000))] if text in boxes else []
        ),
    )
    repo = SqlTicketRepository(session)
    await repo.save_ai_stage_result(
        TENANT, HASH, "sam_track", result_json=_old_track_row(with_rim=True)
    )
    inner = CountingAIClient()
    track = await CachingAIClient(inner, repo, TENANT).track(CLIP)

    assert inner.track_calls == 0  # no model call: offline re-measure
    assert track.measure_version >= 3
    bed = track.by_label("truck bed")
    assert bed is not None and bed.mask_areas == [200.0 * 60]  # opening above the rim
    stored = await repo.get_ai_stage_result(TENANT, HASH, "sam_track")
    assert stored is not None and stored["measure_version"] == track.measure_version


@pytest.mark.asyncio
async def test_outdated_track_missing_the_rim_reruns_sam(session: AsyncSession) -> None:
    repo = SqlTicketRepository(session)
    await repo.save_ai_stage_result(
        TENANT, HASH, "sam_track", result_json=_old_track_row(with_rim=False)
    )
    inner = CountingAIClient()
    await CachingAIClient(inner, repo, TENANT).track(CLIP)
    assert inner.track_calls == 1  # SAM must supply the tailgate the new method reads


@pytest.mark.asyncio
async def test_outdated_track_with_no_load_reruns_sam(session: AsyncSession) -> None:
    # The LT-804655 case: a cached track that found no load must re-run SAM so
    # the current (named + expanded) load concepts get a chance, not replay 0%.
    repo = SqlTicketRepository(session)
    await repo.save_ai_stage_result(
        TENANT, HASH, "sam_track", result_json=_old_track_row(with_rim=True, with_load=False)
    )
    inner = CountingAIClient()
    await CachingAIClient(inner, repo, TENANT).track(CLIP)
    assert inner.track_calls == 1


@pytest.mark.asyncio
async def test_provider_namespaces_isolate_results_and_preserve_repeat_cache(
    session: AsyncSession,
) -> None:
    repo = SqlTicketRepository(session)
    inner = CountingAIClient()
    baseten = CachingAIClient(
        inner, repo, TENANT, model_label="baseten/muse-spark-open", cache_namespace="baseten-route"
    )
    modal = CachingAIClient(
        inner, repo, TENANT, model_label="modal/muse-spark-open", cache_namespace="modal-route"
    )
    await baseten.read_placard(CLIP)
    await modal.read_placard(CLIP)
    repeated = await baseten.read_placard(CLIP)
    assert inner.ocr_calls == 2
    assert repeated.usage is not None and repeated.usage.cached
    assert repeated.usage.model == "baseten/muse-spark-open"


@pytest.mark.asyncio
async def test_parallel_perception_does_not_share_a_database_session_concurrently(
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    repo = SqlTicketRepository(session)
    original_get = repo.get_ai_stage_result
    original_save = repo.save_ai_stage_result
    busy = False

    async def checked_get(*args, **kwargs):  # type: ignore[no-untyped-def]
        nonlocal busy
        assert not busy
        busy = True
        try:
            await asyncio.sleep(0)
            return await original_get(*args, **kwargs)
        finally:
            busy = False

    async def checked_save(*args, **kwargs):  # type: ignore[no-untyped-def]
        nonlocal busy
        assert not busy
        busy = True
        try:
            await asyncio.sleep(0)
            return await original_save(*args, **kwargs)
        finally:
            busy = False

    monkeypatch.setattr(repo, "get_ai_stage_result", checked_get)
    monkeypatch.setattr(repo, "save_ai_stage_result", checked_save)
    client = CachingAIClient(CountingAIClient(), repo, TENANT)
    await asyncio.gather(client.read_placard(CLIP), client.classify_debris(CLIP))
    assert await original_get(TENANT, HASH, "spark_ocr") is not None
    assert await original_get(TENANT, HASH, serde.STAGE_CLASSIFY) is not None
