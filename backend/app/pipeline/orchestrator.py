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

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID

from app.ai.base import AIClient, CallUsage, ClipMedia, OCRResult, StageExplanations
from app.ai.config_store import get_ai_config_store
from app.config import get_settings
from app.pipeline.anomalies import Anomaly, AnomalyInput, evaluate
from app.pipeline.cache import ResultCache
from app.pipeline.geometry import FillEstimate, MaskMeasurement, estimate_fill
from app.pipeline.ingest import IngestedArtifact
from app.pipeline.ledger import BudgetExceededError, CostLedger
from app.pipeline.registry import TruckRegistry
from app.pipeline.trace import PipelineTrace, StageRecord
from app.tickets.domain import Ticket, new_ticket
from app.tickets.schemas import DebrisClass

# How the load was measured, in the trace's plain words.
_LOAD_SOURCE_LABEL = {
    "segmented": "SAM load mask",
    "none": "No SAM load phrase matched inside the bed",
}
_BED_SOURCE_LABEL = {
    "bed": "SAM truck bed mask",
    "truck": "SAM whole-truck mask (no bed phrase matched)",
}

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
    # SAM's raw output per concept, for the Review console overlay.
    segments: dict[str, str] = field(default_factory=dict)


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
    data: bytes = b"",
    on_stage: Callable[[StageRecord], None] | None = None,
) -> PipelineResult:
    """Run the full pipeline for one ingested clip and return a draft ticket.

    ``data`` is the clip's bytes; the live client sends them to Meta (the mock
    and the durable cache only need the content hash, so tests may omit them).
    ``cache`` and ``ledger`` are optional and injected. When a ``cache`` is given
    and already holds a result for this event and clip content hash, the cached
    result is returned for free (every stage recorded as a $0 cache hit) and no
    AI call is made — the cost rule in LESSONS: no uncached model call on a
    repeated path.
    ``on_stage`` is called with each stage the instant it is recorded, so a live
    progress view can stream the run.
    """
    h = artifact.content_hash
    # Results include tenant/event-specific ticket fields and pricing, so they
    # must never be shared across tenants or events for identical media bytes.
    cache_key = f"{tenant_id}:{event_id}:{h}"

    if cache is not None:
        hit = await cache.get(cache_key)
        if hit is not None:
            await _record_cached(ledger)
            # Rebuild a trace for the cached run so the UI still shows the work.
            trace = PipelineTrace(content_hash=h, on_stage=on_stage)
            trace.cached = True
            trace.outcome = "cached" if not hit.no_truck else "no_truck"
            trace.stage(
                "cache", "Result cache", "cache", "Served from the result cache (no model call)."
            )  # noqa: E501
            trace.ticket_id = str(hit.ticket.id) if not hit.no_truck else None
            hit.trace = trace
            return hit

    if ledger is not None and ledger.budget_status().hard_cap_hit:
        raise BudgetExceededError(ledger.budget_status().spent_usd)

    trace = PipelineTrace(content_hash=h, on_stage=on_stage)
    result = await _compute_pipeline(
        artifact=artifact,
        tenant_id=tenant_id,
        event_id=event_id,
        registry=registry,
        rate_table=rate_table,
        ai=ai,
        ledger=ledger,
        trace=trace,
        data=data,
    )
    result.trace = trace
    if cache is not None:
        await cache.set(cache_key, result)
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
    data: bytes = b"",
) -> PipelineResult:
    """The uncached compute path (the stages themselves)."""
    h = artifact.content_hash
    sam = get_settings().sam_model
    spark = get_settings().spark_model
    clip = ClipMedia(
        content_hash=h, media_kind=artifact.media_kind, filename=artifact.filename, data=data
    )

    # Stage 2 — SAM track + segment.
    tracks = await ai.track(clip)
    await _record(ledger, "sam_track", tracks.usage)
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
                details=_notes(tracks.notes) + _usage_details(tracks.usage),
                duration_ms=_latency(tracks.usage),
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
            details=_notes(tracks.notes) + _usage_details(tracks.usage),
            duration_ms=_latency(tracks.usage),
        )

    # Stage 3 (Spark OCR) and the Stage 5 debris class (Spark classify) are
    # independent of each other and of the geometry, so they run concurrently.
    ocr, classify = await asyncio.gather(ai.read_placard(clip), ai.classify_debris(clip))
    await _record(ledger, "spark_ocr", ocr.usage)
    if trace:
        ocr_details = _answer(ocr.raw)
        if ocr.frame_ref:
            ocr_details.append(["Clearest view", ocr.frame_ref])
        ocr_details += _usage_details(ocr.usage)
        trace.stage(
            "spark_ocr",
            "Read placard",
            spark,
            (
                f"Read truck placard {ocr.truck_id}."
                if ocr.truck_id
                else "Could not read the placard confidently."
            ),
            status="ok" if ocr.truck_id else "flagged",
            confidence=ocr.confidence,
            details=ocr_details,
            duration_ms=_latency(ocr.usage),
            analysis=ocr.analysis,
        )

    # Stage 4 — capacity lookup.
    match = registry.lookup(ocr.truck_id)
    certified = match.truck.certified_cubic_yards if match.truck else Decimal(0)
    body_type = match.truck.body_type if match.truck else None
    await _record(ledger, "capacity")
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
            details=[
                ["Placard read", ocr.truck_id or "None"],
                ["Registry match", match.matched_id or "None"],
                ["Match score", f"{match.confidence:.0%}"],
                ["Certified capacity", f"{certified} CY"],
                ["Body type", body_type or "Unknown"],
            ],
        )

    # Stage 5 — fill % from geometry; Spark's visual read is only a cross-check.
    bed_area = _avg(bed.mask_areas)
    load_area = _avg(debris.mask_areas)
    fill = estimate_fill(
        [_mask_measurement(bed_area, load_area, debris.load_height_ratio)],
        load_source=tracks.load_source,
        bed_source=tracks.bed_source,
        coverage_spread=tracks.coverage_spread,
        cross_check_pct=classify.visual_fill_pct,
    )
    await _record(ledger, "geometry")
    if trace:
        weak = bool(fill.quality_notes)
        geometry_details = [
            ["Frames measured", str(len(bed.mask_areas))],
            ["Bed opening, average", f"{bed_area:,.0f} px"],
            ["Load inside the opening, average", f"{load_area:,.0f} px"],
            ["Bed measured by", _BED_SOURCE_LABEL.get(tracks.bed_source, tracks.bed_source)],
            ["Load measured by", _LOAD_SOURCE_LABEL.get(tracks.load_source, tracks.load_source)],
            ["Opening coverage", f"{fill.planar_coverage:.0%}"],
            ["Depth factor", f"{fill.depth_factor:.2f}"],
            ["Frame agreement (spread)", f"{tracks.coverage_spread:.0%}"],
        ]
        if classify.visual_fill_pct is not None:
            geometry_details.append(["Muse Spark visual read", f"{classify.visual_fill_pct:.0f}%"])
        geometry_details += [["Review note", n] for n in fill.quality_notes]
        geometry_details.append(["Fill", f"{fill.fill_pct}%"])
        trace.stage(
            "geometry",
            "Measure fill",
            "geometry",
            (
                f"Measured bed fill at {fill.fill_pct}%; flagged for review "
                "because the measurement is weak."
                if weak
                else f"Measured bed fill at {fill.fill_pct}% from the segmentation masks."
            ),
            status="flagged" if weak else "ok",
            confidence=fill.confidence,
            details=geometry_details,
        )
    await _record(ledger, "spark_classify", classify.usage)
    debris_class = _safe_debris_class(classify.debris_class)
    rate = Decimal(str(rate_table.get(debris_class.value, 0)))
    if trace:
        trace.stage(
            "spark_classify",
            "Classify debris",
            spark,
            f"Classified the load as {debris_class.value.replace('_', ' ')}.",
            confidence=classify.confidence,
            details=_answer(classify.raw)
            + [["Rate applied", f"${rate} per CY"]]
            + _usage_details(classify.usage),
            duration_ms=_latency(classify.usage),
            analysis=classify.analysis,
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
    # Note: the ticket (and its dollar value) is computed here because the
    # anomaly rules below need the measured facts. The trace stages, however,
    # are recorded in pipeline order — "Flag anomalies" (Stage 6) before
    # "Value the load" (Stage 7) — further down, so the visible 7-stage trace
    # reads in the correct sequence.

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
    anomalies, narration_usage = await _narrate(anomalies, ai, ticket, ocr)
    await _record(ledger, "anomalies", narration_usage)
    ticket.anomaly_count = len(anomalies)
    if trace:
        # Stage 6 — Flag anomalies (recorded before the Stage 7 valuation).
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
            details=[
                [a.type.value.replace("_", " ").capitalize(), f"{a.severity}: {a.explanation}"]
                for a in anomalies
            ]
            + (_usage_details(narration_usage) if narration_usage else []),
        )
        # Stage 7 — Value the load (the §7a dollar math, computed above).
        trace.stage(
            "dollar_math",
            "Value the load",
            "deterministic",
            f"Valued the load at {ticket.est_dollar_value} ({fill.fill_pct}% of {certified} CY at ${rate}/CY).",  # noqa: E501
            details=[
                ["Volume", f"{fill.fill_pct}% of {certified} CY = {ticket.est_cubic_yards} CY"],
                [
                    "Value",
                    f"{ticket.est_cubic_yards} CY at ${rate} per CY = ${ticket.est_dollar_value}",
                ],
            ],
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
        # Muse Spark authors the "AI analysis" paragraph for the stages that do
        # not already return their own (SAM track, capacity, geometry, anomaly
        # flags, valuation), grounded in the measured facts. One batched call,
        # cached with the rest of the run; a failure leaves the summary fallback.
        explain_usage = await _explain(
            ai,
            trace,
            facts=_explain_facts(
                ocr=ocr,
                match_found=match.found,
                certified=certified,
                body_type=body_type,
                fill=fill,
                debris_class=debris_class,
                rate=rate,
                ticket=ticket,
                anomalies=anomalies,
                frame_count=tracks.frame_count,
            ),
        )
        await _record(ledger, "spark_explain", explain_usage)
    await _record(ledger, "dollar_math")
    return PipelineResult(
        ticket=ticket,
        anomalies=anomalies,
        identity_confidence=ocr.confidence,
        fill_confidence=fill.confidence,
        segments=dict(tracks.segments),
    )


async def _narrate(
    anomalies: list[Anomaly],
    ai: AIClient,
    ticket: Ticket,
    ocr: OCRResult,
) -> tuple[list[Anomaly], CallUsage | None]:
    """Attach a Muse Spark narrative to each anomaly, grounded in the load facts.

    Narrations run concurrently. A failed narration falls back to the rule's own
    text, so narration can never break the pipeline. Returns the anomalies and
    the summed usage of the narration calls (None when nothing was billed).
    """
    facts = {
        "truck": ocr.truck_id or "unidentified",
        "debris_class": ticket.debris_class.value,
        "est_cy": str(ticket.est_cubic_yards),
        "fill_pct": str(ticket.est_fill_pct),
    }
    results = await asyncio.gather(
        *(ai.narrate_anomaly(a.type.value, facts) for a in anomalies), return_exceptions=True
    )
    narrated: list[Anomaly] = []
    usage: CallUsage | None = None
    for a, r in zip(anomalies, results, strict=True):
        text = a.explanation
        if not isinstance(r, BaseException):
            text = r.text or a.explanation
            if r.usage is not None:
                usage = r.usage if usage is None else usage.plus(r.usage)
        narrated.append(
            Anomaly(
                type=a.type,
                severity=a.severity,
                explanation=text,
                evidence_frame=a.evidence_frame,
            )
        )
    return narrated, usage


def _explain_facts(
    *,
    ocr: OCRResult,
    match_found: bool,
    certified: Decimal,
    body_type: str | None,
    fill: FillEstimate,
    debris_class: DebrisClass,
    rate: Decimal,
    ticket: Ticket,
    anomalies: list[Anomaly],
    frame_count: int,
) -> dict[str, object]:
    """The measured facts Muse Spark narrates into per-stage analysis.

    Only computed values the pipeline already produced; the model phrases them,
    it never fetches or invents figures."""
    return {
        "frame_count": frame_count,
        "truck_id": ocr.truck_id or "unidentified",
        "identity_confidence": round(ocr.confidence, 2),
        "truck_certified": match_found,
        "certified_cubic_yards": str(certified),
        "body_type": body_type or "unknown",
        "fill_pct": str(fill.fill_pct),
        "fill_confidence": round(fill.confidence, 2),
        "fill_review_notes": list(fill.quality_notes),
        "planar_coverage": round(fill.planar_coverage, 2),
        "depth_factor": round(fill.depth_factor, 2),
        "debris_class": debris_class.value,
        "rate_per_cy": str(rate),
        "est_cubic_yards": str(ticket.est_cubic_yards),
        "est_dollar_value": str(ticket.est_dollar_value),
        "anomalies": [
            {"type": a.type.value, "severity": a.severity, "explanation": a.explanation}
            for a in anomalies
        ],
    }


async def _explain(
    ai: AIClient, trace: PipelineTrace, *, facts: dict[str, object]
) -> CallUsage | None:
    """Attach Muse Spark's per-stage "AI analysis" to the trace.

    One batched call. A failure is swallowed: the stages keep their summary
    fallback, so authored analysis can never break the pipeline. Returns the
    call's usage for the cost ledger (None when nothing was billed)."""
    try:
        result: StageExplanations = await ai.explain_pipeline(facts)
    except Exception:  # noqa: BLE001 — analysis is best-effort, never fatal
        return None
    if result.by_stage:
        trace.set_analysis(result.by_stage)
    return result.usage


async def _record(ledger: CostLedger | None, stage: str, usage: CallUsage | None = None) -> None:
    """Record one ledger row for a stage.

    AI stages pass the usage the client reported (real tokens, latency, and
    dollars from the live client; a $0 ``cached`` row for a durable-cache
    replay). Deterministic stages and the fixture-backed mock report nothing, so
    their row is ``cost_usd=0``.
    """
    if ledger is None:
        return
    if usage is None:
        await ledger.record_run(stage=stage, model=_stage_model(stage), cost_usd=0.0)
        return
    await ledger.record_run(
        stage=stage,
        model=usage.model or _stage_model(stage),
        tokens_in=usage.tokens_in,
        tokens_out=usage.tokens_out,
        latency_ms=usage.latency_ms,
        cost_usd=usage.cost_usd,
        cached=usage.cached,
    )


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


def _answer(raw: str) -> list[list[str]]:
    """The model's raw answer as a trace row, when there is one."""
    return [["Model answer", raw]] if raw else []


def _notes(notes: dict[str, str]) -> list[list[str]]:
    return [[k, v] for k, v in notes.items()]


def _latency(usage: CallUsage | None) -> float | None:
    """A live call's own response time; None (use wall clock) otherwise."""
    if usage is None or usage.cached or usage.latency_ms <= 0:
        return None
    return usage.latency_ms


def _usage_details(usage: CallUsage | None) -> list[list[str]]:
    """Tokens, cost, and response time for an AI stage, in plain words."""
    if usage is None:
        return []
    if usage.cached:
        return [["Source", "Saved result from an earlier run, no model call"]]
    rows: list[list[str]] = []
    if usage.tokens_in or usage.tokens_out:
        reasoning = (
            f", {usage.reasoning_tokens:,} of them reasoning" if usage.reasoning_tokens else ""
        )
        rows.append(["Tokens", f"{usage.tokens_in:,} in, {usage.tokens_out:,} out{reasoning}"])
    if usage.requests > 1:
        rows.append(["Requests", str(usage.requests)])
    if usage.latency_ms > 0:
        rows.append(["Response time", f"{usage.latency_ms / 1000:.1f} s"])
    rows.append(["Cost", f"${usage.cost_usd:.4f}"])
    return rows


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
