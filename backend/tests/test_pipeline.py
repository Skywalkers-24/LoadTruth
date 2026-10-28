"""Tests for the deterministic pipeline stages (geometry, anomalies, registry,
ingest) and the end-to-end orchestrator against MOCK_AI fixtures. No credits.
"""

from decimal import Decimal

import pytest

from app.ai.mock import MockAIClient
from app.pipeline.anomalies import AnomalyInput, AnomalyType, evaluate
from app.pipeline.geometry import MaskMeasurement, estimate_fill
from app.pipeline.ingest import IngestedArtifact, content_hash, ingest_upload
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.registry import CertifiedTruck, TruckRegistry
from app.tickets.seed import DEMO_EVENT_ID, DEMO_TENANT_ID


# ── geometry ────────────────────────────────────────────────────────────────
def test_estimate_fill_full_load_reads_high() -> None:
    est = estimate_fill(
        [MaskMeasurement(bed_area=26000, load_area=24000, load_height_ratio=0.9)],
    )
    assert est.fill_pct > Decimal(70)
    assert 0.0 <= est.confidence <= 1.0


def test_estimate_fill_empty_bed_is_zero() -> None:
    est = estimate_fill([MaskMeasurement(bed_area=26000, load_area=0, load_height_ratio=0.0)])
    assert est.fill_pct == Decimal("0.00")


def test_gate_camera_fill_is_the_opening_coverage() -> None:
    est = estimate_fill([MaskMeasurement(bed_area=40000, load_area=24000, load_height_ratio=1.0)])
    assert est.fill_pct == Decimal("60.00")
    assert est.quality_notes == ()


def test_weak_measurements_cap_confidence_below_the_review_threshold() -> None:
    view = [MaskMeasurement(40000, 24000, 1.0)]
    for kwargs in (
        {"load_source": "none"},
        {"bed_source": "truck"},
        {"coverage_spread": 0.3},
        {"cross_check_pct": 95.0},  # Muse Spark read 95%, the masks measured 60%
    ):
        est = estimate_fill(view, **kwargs)
        assert est.confidence < 0.45, kwargs
        assert est.quality_notes, kwargs
        assert est.fill_pct == Decimal("60.00")  # confidence only; the number holds


def test_agreeing_cross_check_keeps_confidence() -> None:
    est = estimate_fill([MaskMeasurement(40000, 24000, 1.0)], cross_check_pct=65.0)
    assert est.confidence >= 0.6
    assert est.quality_notes == ()


def test_estimate_fill_requires_a_view() -> None:
    with pytest.raises(ValueError, match="at least one view"):
        estimate_fill([])


def test_two_views_lower_confidence_on_disagreement() -> None:
    agree = estimate_fill(
        [
            MaskMeasurement(26000, 13000, 0.5),
            MaskMeasurement(26000, 13000, 0.5),
        ]
    )
    disagree = estimate_fill(
        [
            MaskMeasurement(26000, 5000, 0.2),
            MaskMeasurement(26000, 22000, 0.9),
        ]
    )
    assert disagree.confidence < agree.confidence


# ── anomalies ───────────────────────────────────────────────────────────────
def _base(**kw: object) -> AnomalyInput:
    import dataclasses

    base = AnomalyInput(
        truck_id="FL-DT-1",
        truck_is_certified=True,
        certified_cubic_yards=Decimal(20),
        est_cubic_yards=Decimal(10),
        est_fill_pct=Decimal(50),
        fill_confidence=0.9,
        planar_coverage=0.5,
        identity_confidence=0.95,
    )
    return dataclasses.replace(base, **kw)  # type: ignore[arg-type]


def test_uncertified_truck_flagged() -> None:
    flags = evaluate(_base(truck_is_certified=False))
    assert any(f.type is AnomalyType.UNCERTIFIED_TRUCK for f in flags)


def test_capacity_exceeded_flagged() -> None:
    flags = evaluate(_base(est_cubic_yards=Decimal(30), certified_cubic_yards=Decimal(20)))
    assert any(f.type is AnomalyType.CAPACITY_EXCEEDED for f in flags)


def test_surface_depth_mismatch_flagged() -> None:
    flags = evaluate(_base(planar_coverage=0.9, est_fill_pct=Decimal(30)))
    assert any(f.type is AnomalyType.SURFACE_DEPTH_MISMATCH for f in flags)


def test_unreadable_identity_flagged() -> None:
    flags = evaluate(_base(truck_id=None, identity_confidence=0.2))
    assert any(f.type is AnomalyType.IDENTITY_UNREADABLE for f in flags)


def test_clean_load_has_no_flags() -> None:
    assert evaluate(_base()) == []


# ── registry ────────────────────────────────────────────────────────────────
def _registry() -> TruckRegistry:
    return TruckRegistry(
        [
            CertifiedTruck("FL-DT-3391", Decimal(20), "tandem"),
            CertifiedTruck("FL-DT-1182", Decimal(30), "tandem"),
        ]
    )


def test_registry_exact_match() -> None:
    m = _registry().lookup("FL-DT-3391")
    assert m.found and m.confidence == 1.0


def test_registry_fuzzy_match_over_ocr_noise() -> None:
    m = _registry().lookup("fl dt 3391")  # separators/case noise
    assert m.found and m.matched_id == "FL-DT-3391"


def test_registry_unknown_is_not_found() -> None:
    m = _registry().lookup("ZZ-9999")
    assert not m.found


def test_registry_none_id() -> None:
    assert not _registry().lookup(None).found


# ── ingest ──────────────────────────────────────────────────────────────────
def test_ingest_hashes_and_detects_kind() -> None:
    a = ingest_upload("clip.mp4", b"abc")
    assert a.media_kind == "video"
    assert a.content_hash == content_hash(b"abc")
    img = ingest_upload("frame.jpg", b"xyz")
    assert img.media_kind == "image"


def test_ingest_rejects_empty() -> None:
    with pytest.raises(ValueError, match="empty upload"):
        ingest_upload("clip.mp4", b"")


# ── orchestrator (end-to-end against fixtures) ───────────────────────────────
@pytest.mark.asyncio
async def test_pipeline_drafts_ticket_from_fixture() -> None:
    artifact = _artifact("clean-full-cd")
    registry = TruckRegistry([CertifiedTruck("FL-DT-3391", Decimal(20), "tandem")])
    result = await run_pipeline(
        artifact=artifact,
        tenant_id=DEMO_TENANT_ID,
        event_id=DEMO_EVENT_ID,
        registry=registry,
        rate_table={"construction_demolition": 12.0},
        ai=MockAIClient(),
    )
    assert not result.no_truck
    assert result.ticket.truck_id == "FL-DT-3391"
    assert result.ticket.est_dollar_value > 0
    assert result.ticket.est_fill_pct > Decimal(60)


@pytest.mark.asyncio
async def test_pipeline_reports_no_truck() -> None:
    result = await run_pipeline(
        artifact=_artifact("no-truck"),
        tenant_id=DEMO_TENANT_ID,
        event_id=DEMO_EVENT_ID,
        registry=TruckRegistry([]),
        rate_table={},
        ai=MockAIClient(),
    )
    assert result.no_truck


@pytest.mark.asyncio
async def test_pipeline_records_ledger_rows_per_stage() -> None:
    from app.pipeline.ledger import CostLedger

    ledger = CostLedger()
    await run_pipeline(
        artifact=_artifact("clean-full-cd"),
        tenant_id=DEMO_TENANT_ID,
        event_id=DEMO_EVENT_ID,
        registry=TruckRegistry([CertifiedTruck("FL-DT-3391", Decimal(20), "tandem")]),
        rate_table={"construction_demolition": 12.0},
        ai=MockAIClient(),
        ledger=ledger,
    )
    summary = ledger.summarize()
    # One row per stage, all $0 (deterministic + mock AI), nothing cached. Eight
    # stages: the seven pipeline stages plus the batched per-stage analysis call.
    assert summary.total_runs == 8
    assert summary.total_cost_usd == 0.0
    assert summary.cache_hits == 0
    assert "sam_track" in summary.per_stage
    assert "spark_explain" in summary.per_stage


@pytest.mark.asyncio
async def test_pipeline_second_run_is_a_cache_hit() -> None:
    from app.pipeline.cache import InMemoryResultCache
    from app.pipeline.ledger import CostLedger
    from app.pipeline.orchestrator import PipelineResult

    cache: InMemoryResultCache[PipelineResult] = InMemoryResultCache()
    ledger = CostLedger()
    kwargs = {
        "tenant_id": DEMO_TENANT_ID,
        "event_id": DEMO_EVENT_ID,
        "registry": TruckRegistry([CertifiedTruck("FL-DT-3391", Decimal(20), "tandem")]),
        "rate_table": {"construction_demolition": 12.0},
        "ai": MockAIClient(),
        "cache": cache,
        "ledger": ledger,
    }
    first = await run_pipeline(artifact=_artifact("clean-full-cd"), **kwargs)  # type: ignore[arg-type]
    second = await run_pipeline(artifact=_artifact("clean-full-cd"), **kwargs)  # type: ignore[arg-type]

    assert second is first  # cached result object returned as-is
    assert len(cache) == 1
    summary = ledger.summarize()
    # First run: 8 compute rows (7 stages + the batched analysis). Second run is
    # served whole from the result cache, which replays the 7 standard stages as
    # $0 cache-hit rows (the analysis call is not re-run), so 8 + 7 = 15.
    assert summary.total_runs == 15
    assert summary.cache_hits == 7


def _artifact(content_hash_key: str) -> IngestedArtifact:
    return IngestedArtifact(
        filename="clip.mp4",
        media_kind="video",
        content_hash=content_hash_key,
        size_bytes=100,
    )
