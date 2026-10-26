"""Pipeline orchestrator — runs Stages 0-7 for one clip (PLAN.md §5).

Ties the deterministic stages (ingest/hash, geometry, capacity, dollar math,
anomaly rules) to the AI seam (SAM tracking, Spark OCR/classification) and
produces a draft ticket + its anomalies. Under MOCK_AI the AI calls resolve from
fixtures, so the whole flow runs end-to-end at $0.

The orchestrator is pure application logic: it takes an ingested artifact and the
tenant's registry/rate table, and returns a result the caller persists. It does
not touch the DB itself, which keeps it trivially testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID

from app.ai.base import AIClient
from app.config import get_settings
from app.pipeline.anomalies import Anomaly, AnomalyInput, evaluate
from app.pipeline.cache import ResultCache
from app.pipeline.geometry import MaskMeasurement, estimate_fill
from app.pipeline.ingest import IngestedArtifact
from app.pipeline.ledger import CostLedger
from app.pipeline.registry import TruckRegistry
from app.tickets.domain import Ticket, new_ticket
from app.tickets.schemas import DebrisClass

# Stage names used in the cost ledger (also the dashboard's per-stage buckets).
_AI_STAGES = ("sam_track", "spark_ocr", "spark_classify")
_DETERMINISTIC_STAGES = ("geometry", "capacity", "anomalies", "dollar_math")


@dataclass(frozen=True, slots=True)
class PipelineResult:
    ticket: Ticket
    anomalies: list[Anomaly] = field(default_factory=list)
    identity_confidence: float = 0.0
    fill_confidence: float = 0.0
    no_truck: bool = False


def _mask_measurement(track_bed_area: float, load_area: float, height: float) -> MaskMeasurement:
    return MaskMeasurement(bed_area=track_bed_area, load_area=load_area, load_height_ratio=height)


async def run_pipeline(
    *,
    artifact: IngestedArtifact,
    tenant_id: UUID,
    event_id: UUID,
    registry: TruckRegistry,
    rate_table: dict[str, float],
    ai: AIClient,
    cache: ResultCache[PipelineResult] | None = None,
    ledger: CostLedger | None = None,
) -> PipelineResult:
    """Run the full pipeline for one ingested clip and return a draft ticket.

    ``cache`` and ``ledger`` are optional and injected. When a ``cache`` is given
    and already holds a result for this clip's content hash, the cached result is
    returned for free (every stage recorded as a $0 cache hit) and no AI call is
    made — the cost rule in LESSONS: no uncached model call on a repeated path.
    """
    h = artifact.content_hash

    if cache is not None:
        hit = await cache.get(h)
        if hit is not None:
            await _record_cached(ledger)
            return hit

    result = await _compute_pipeline(
        artifact=artifact,
        tenant_id=tenant_id,
        event_id=event_id,
        registry=registry,
        rate_table=rate_table,
        ai=ai,
        ledger=ledger,
    )
    if cache is not None:
        await cache.set(h, result)
    return result


async def _compute_pipeline(
    *,
    artifact: IngestedArtifact,
    tenant_id: UUID,
    event_id: UUID,
    registry: TruckRegistry,
    rate_table: dict[str, float],
    ai: AIClient,
    ledger: CostLedger | None,
) -> PipelineResult:
    """The uncached compute path (the stages themselves)."""
    h = artifact.content_hash

    # Stage 2 — SAM track + segment.
    tracks = await ai.track(h)
    await _record(ledger, "sam_track", ai)
    bed = tracks.by_label("truck bed")
    debris = tracks.by_label("debris pile")
    if bed is None or debris is None or not bed.mask_areas:
        # No measurable truck in frame — report it; draft nothing.
        return PipelineResult(
            ticket=_empty_ticket(tenant_id, event_id, h),
            no_truck=True,
        )

    # Stage 3 — identify the truck (Spark OCR).
    ocr = await ai.read_placard(h)
    await _record(ledger, "spark_ocr", ai)

    # Stage 4 — capacity lookup.
    match = registry.lookup(ocr.truck_id)
    certified = match.truck.certified_cubic_yards if match.truck else Decimal(0)
    body_type = match.truck.body_type if match.truck else None
    await _record(ledger, "capacity", ai)

    # Stage 5 — fill % from geometry + debris class (Spark).
    bed_area = _avg(bed.mask_areas)
    load_area = _avg(debris.mask_areas)
    fill = estimate_fill(
        [_mask_measurement(bed_area, load_area, debris.load_height_ratio)],
        body_type=body_type,
    )
    await _record(ledger, "geometry", ai)
    classify = await ai.classify_debris(h)
    await _record(ledger, "spark_classify", ai)
    debris_class = _safe_debris_class(classify.debris_class)
    rate = Decimal(str(rate_table.get(debris_class.value, 0)))

    # Stage 7 — draft the ticket (dollar math via the §7a value path).
    ticket = new_ticket(
        tenant_id=tenant_id,
        event_id=event_id,
        debris_class=debris_class,
        certified_cubic_yards=certified,
        rate_per_cy=rate,
        est_fill_pct=fill.fill_pct,
        truck_id=ocr.truck_id,
        clip_id=None,
        evidence_frames=[f for f in [ocr.frame_ref] if f],
    )

    # Stage 6 — anomaly rules over the measured facts.
    anomalies = evaluate(
        AnomalyInput(
            truck_id=ocr.truck_id,
            truck_is_certified=match.found,
            certified_cubic_yards=certified if match.found else None,
            est_cubic_yards=ticket.est_cubic_yards,
            est_fill_pct=ticket.est_fill_pct,
            fill_confidence=fill.confidence,
            planar_coverage=fill.planar_coverage,
            identity_confidence=ocr.confidence,
            evidence_frame=ocr.frame_ref,
        )
    )
    await _record(ledger, "anomalies", ai)
    ticket.anomaly_count = len(anomalies)
    await _record(ledger, "dollar_math", ai)
    return PipelineResult(
        ticket=ticket,
        anomalies=anomalies,
        identity_confidence=ocr.confidence,
        fill_confidence=fill.confidence,
    )


async def _record(ledger: CostLedger | None, stage: str, ai: AIClient) -> None:
    """Record a $0 ledger row for a stage.

    Deterministic stages and the fixture-backed MockAIClient cost nothing, so every
    row here is ``cost_usd=0``. When the live SAM/Spark client is wired it will
    surface real tokens/cost and this is where the orchestrator will record them.
    """
    if ledger is None:
        return
    model = _stage_model(stage)
    await ledger.record_run(stage=stage, model=model, cost_usd=0.0, cached=False)


async def _record_cached(ledger: CostLedger | None) -> None:
    """Record every stage as a $0 cache hit for a result served from cache."""
    if ledger is None:
        return
    for stage in (*_AI_STAGES, *_DETERMINISTIC_STAGES):
        await ledger.record_run(stage=stage, model=_stage_model(stage), cost_usd=0.0, cached=True)


def _stage_model(stage: str) -> str:
    """Model name recorded for a stage (settings model name for AI, else marker)."""
    if stage == "sam_track":
        return get_settings().sam_model
    if stage in ("spark_ocr", "spark_classify"):
        return get_settings().spark_model
    return "deterministic"


def _empty_ticket(tenant_id: UUID, event_id: UUID, _hash: str) -> Ticket:
    return new_ticket(
        tenant_id=tenant_id,
        event_id=event_id,
        debris_class=DebrisClass.OTHER,
        certified_cubic_yards=0,
        rate_per_cy=0,
        est_fill_pct=0,
    )


def _avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _safe_debris_class(value: str) -> DebrisClass:
    try:
        return DebrisClass(value)
    except ValueError:
        return DebrisClass.OTHER
