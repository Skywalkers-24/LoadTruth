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

from app.ai.base import AIClient, OCRResult
from app.ai.config_store import get_ai_config_store
from app.config import get_settings
from app.pipeline.anomalies import Anomaly, AnomalyInput, evaluate
from app.pipeline.cache import ResultCache
from app.pipeline.geometry import MaskMeasurement, estimate_fill
from app.pipeline.ingest import IngestedArtifact
from app.pipeline.ledger import CostLedger
from app.pipeline.registry import TruckRegistry
from app.pipeline.trace import PipelineTrace
from app.tickets.domain import Ticket, new_ticket
from app.tickets.schemas import DebrisClass

# Stage names used in the cost ledger (also the dashboard's per-stage buckets).
_AI_STAGES = ("sam_track", "spark_ocr", "spark_classify")
_DETERMINISTIC_STAGES = ("geometry", "capacity", "anomalies", "dollar_math")


@dataclass(slots=True)
class PipelineResult:
    ticket: Ticket
    anomalies: list[Anomaly] = field(default_factory=list)
    identity_confidence: float = 0.0
    fill_confidence: float = 0.0
    no_truck: bool = False
    trace: PipelineTrace | None = None


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
            # Rebuild a trace for the cached run so the UI still shows the work.
            trace = PipelineTrace(content_hash=h)
            trace.cached = True
            trace.outcome = "cached" if not hit.no_truck else "no_truck"
            trace.stage("cache", "Result cache", "cache", "Served from the result cache (no model call).")  # noqa: E501
            trace.ticket_id = str(hit.ticket.id) if not hit.no_truck else None
            hit.trace = trace
            return hit

    trace = PipelineTrace(content_hash=h)
    result = await _compute_pipeline(
        artifact=artifact,
        tenant_id=tenant_id,
        event_id=event_id,
        registry=registry,
        rate_table=rate_table,
        ai=ai,
        ledger=ledger,
        trace=trace,
    )
    result.trace = trace
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
    trace: PipelineTrace | None = None,
) -> PipelineResult:
    """The uncached compute path (the stages themselves)."""
    h = artifact.content_hash
    sam = get_settings().sam_model
    spark = get_settings().spark_model

    # Stage 2 — SAM track + segment.
    tracks = await ai.track(h)
    await _record(ledger, "sam_track", ai)
    bed = tracks.by_label("truck bed")
    debris = tracks.by_label("debris pile")
    if bed is None or debris is None or not bed.mask_areas:
        # No measurable truck in frame — report it; draft nothing.
        if trace:
            trace.stage(
                "sam_track",
                "Track and segment",
                sam,
                "No truck or load could be segmented in the footage.",
                status="flagged",
            )
            trace.outcome = "no_truck"
        return PipelineResult(
            ticket=_empty_ticket(tenant_id, event_id, h),
            no_truck=True,
        )
    if trace:
        trace.stage(
            "sam_track",
            "Track and segment",
            sam,
            f"Tracked truck, bed, and debris across {tracks.frame_count} frames.",
        )

    # Stage 3 — identify the truck (Spark OCR).
    ocr = await ai.read_placard(h)
    await _record(ledger, "spark_ocr", ai)
    if trace:
        if ocr.truck_id:
            trace.stage(
                "spark_ocr",
                "Read placard",
                spark,
                f"Read truck placard {ocr.truck_id}.",
                confidence=ocr.confidence,
            )
        else:
            trace.stage(
                "spark_ocr",
                "Read placard",
                spark,
                "Could not read the placard confidently.",
                status="flagged",
                confidence=ocr.confidence,
            )

    # Stage 4 — capacity lookup.
    match = registry.lookup(ocr.truck_id)
    certified = match.truck.certified_cubic_yards if match.truck else Decimal(0)
    body_type = match.truck.body_type if match.truck else None
    await _record(ledger, "capacity", ai)
    if trace:
        trace.stage(
            "capacity",
            "Capacity lookup",
            "registry",
            (
                f"Matched certified capacity {certified} CY ({body_type})."
                if match.found
                else "Truck not found in the certified registry."
            ),
            status="ok" if match.found else "flagged",
        )

    # Stage 5 — fill % from geometry + debris class (Spark).
    bed_area = _avg(bed.mask_areas)
    load_area = _avg(debris.mask_areas)
    fill = estimate_fill(
        [_mask_measurement(bed_area, load_area, debris.load_height_ratio)],
        body_type=body_type,
    )
    await _record(ledger, "geometry", ai)
    if trace:
        trace.stage(
            "geometry",
            "Measure fill",
            "geometry",
            f"Measured bed fill at {fill.fill_pct}% from the segmentation masks.",
            confidence=fill.confidence,
        )
    classify = await ai.classify_debris(h)
    await _record(ledger, "spark_classify", ai)
    debris_class = _safe_debris_class(classify.debris_class)
    rate = Decimal(str(rate_table.get(debris_class.value, 0)))
    if trace:
        trace.stage(
            "spark_classify",
            "Classify debris",
            spark,
            f"Classified the load as {debris_class.value.replace('_', ' ')}.",
            confidence=classify.confidence,
        )

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
    if trace:
        trace.stage(
            "dollar_math",
            "Value the load",
            "deterministic",
            f"Valued the load at {ticket.est_dollar_value} ({fill.fill_pct}% of {certified} CY at ${rate}/CY).",  # noqa: E501
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
    # Stage 6b — Muse Spark phrases a human narrative for each flag (PLAN.md §5,
    # §6). The rules already decided; the model only explains. Falls back to the
    # rule's own text if narration fails.
    anomalies = await _narrate(anomalies, ai, ticket, ocr)
    await _record(ledger, "anomalies", ai)
    ticket.anomaly_count = len(anomalies)
    if trace:
        trace.stage(
            "anomalies",
            "Flag anomalies",
            spark,
            (
                f"Flagged {len(anomalies)} anomal{'y' if len(anomalies) == 1 else 'ies'} for review."  # noqa: E501
                if anomalies
                else "No anomalies flagged."
            ),
            status="flagged" if anomalies else "ok",
        )
        trace.ticket_id = str(ticket.id)
        trace.truck_id = ocr.truck_id
        trace.debris_class = debris_class.value
        trace.fill_pct = float(ticket.est_fill_pct)
        trace.dollar_value = float(ticket.est_dollar_value)
        trace.delta_dollar_value = (
            float(ticket.delta_dollar_value) if ticket.delta_dollar_value is not None else None
        )
        trace.anomaly_count = len(anomalies)
        trace.outcome = "drafted"
    await _record(ledger, "dollar_math", ai)
    return PipelineResult(
        ticket=ticket,
        anomalies=anomalies,
        identity_confidence=ocr.confidence,
        fill_confidence=fill.confidence,
    )


async def _narrate(
    anomalies: list[Anomaly],
    ai: AIClient,
    ticket: Ticket,
    ocr: OCRResult,
) -> list[Anomaly]:
    """Attach a Muse Spark narrative to each anomaly, grounded in the load facts."""
    narrated: list[Anomaly] = []
    for a in anomalies:
        facts = {
            "truck": ocr.truck_id or "unidentified",
            "debris_class": ticket.debris_class.value,
            "est_cy": str(ticket.est_cubic_yards),
            "fill_pct": str(ticket.est_fill_pct),
        }
        try:
            text = await ai.narrate_anomaly(a.type.value, facts)
        except Exception:  # noqa: BLE001 — never let narration break the pipeline
            text = a.explanation
        narrated.append(
            Anomaly(
                type=a.type,
                severity=a.severity,
                explanation=text,
                evidence_frame=a.evidence_frame,
            )
        )
    return narrated


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
    """Model name recorded for a stage.

    AI stages read the admin's per-task selection from the AI config store
    (:mod:`app.ai.config_store`) so the ledger and the admin pipeline panel
    reflect what the operator chose; deterministic stages record a marker.
    """
    if stage in _AI_STAGES:
        return get_ai_config_store().resolve(stage).model
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
