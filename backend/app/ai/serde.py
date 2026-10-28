"""(De)serialize AI stage outputs for durable persistence.

The pipeline consumes frozen dataclasses (``TrackResult``, ``OCRResult``,
``ClassifyResult``) that the model layer produces. To persist a stage result
once and replay it forever (see ``app.db.models.AIStageResult`` and
``app.ai.cached_client.CachingAIClient``), we need a stable, JSON-safe shape per
stage. These helpers are the single source of truth for that shape, so the stored
rows stay portable across SQLite and Postgres and survive restarts.

Round-trip is exact: ``from_json(to_json(x)) == x`` for each result type.
"""

from __future__ import annotations

from typing import Any, cast

from app.ai.base import ClassifyResult, OCRResult, TrackedObject, TrackResult

# Stage keys — must match the pipeline's AI stages and the cost-ledger buckets.
STAGE_TRACK = "sam_track"
STAGE_OCR = "spark_ocr"
STAGE_CLASSIFY = "spark_classify"


def track_to_json(r: TrackResult) -> dict[str, Any]:
    return {
        "frame_count": r.frame_count,
        "sam_output": dict(r.segments),
        "notes": dict(r.notes),
        "load_source": r.load_source,
        "coverage_spread": r.coverage_spread,
        "measure_version": r.measure_version,
        "bed_source": r.bed_source,
        "objects": [
            {
                "label": o.label,
                "sam_object_id": o.sam_object_id,
                "mask_areas": list(o.mask_areas),
                "load_height_ratio": o.load_height_ratio,
            }
            for o in r.objects
        ],
    }


def track_from_json(d: dict[str, Any]) -> TrackResult:
    objects = [
        TrackedObject(
            label=str(o["label"]),
            sam_object_id=str(o["sam_object_id"]),
            mask_areas=[float(a) for a in o.get("mask_areas", [])],
            load_height_ratio=float(o.get("load_height_ratio", 0.0)),
        )
        for o in d.get("objects", [])
    ]
    raw = d.get("sam_output")
    segments = {str(k): str(v) for k, v in raw.items()} if isinstance(raw, dict) else {}
    raw_notes = d.get("notes")
    notes = {str(k): str(v) for k, v in raw_notes.items()} if isinstance(raw_notes, dict) else {}
    return TrackResult(
        objects=objects,
        frame_count=int(d["frame_count"]),
        segments=segments,
        notes=notes,
        load_source=str(d.get("load_source") or "segmented"),
        coverage_spread=float(d.get("coverage_spread") or 0.0),
        measure_version=int(d.get("measure_version") or 0),
        bed_source=str(d.get("bed_source") or "bed"),
    )


def track_is_current(d: dict[str, Any]) -> bool:
    """False for track rows stored before SAM's raw output was kept.

    Those rows can't draw the Review overlay, so the cache recomputes them once.
    """
    return "sam_output" in d


def track_is_outdated(d: dict[str, Any], current_version: int) -> bool:
    """True when a stored live track came from an older measurement method.

    Fixture rows (no raw SAM output) are never outdated: there is nothing to
    re-measure and the mock carries its own numbers.
    """
    raw = d.get("sam_output")
    has_raw = isinstance(raw, dict) and any(str(v).strip() for v in raw.values())
    return has_raw and int(d.get("measure_version") or 0) < current_version


def track_can_remeasure(d: dict[str, Any], rim_key: str) -> bool:
    """True when the stored SAM output already holds every concept the current
    method reads (the tailgate rim), so it can be re-measured offline."""
    raw = d.get("sam_output")
    return isinstance(raw, dict) and rim_key in raw


def ocr_to_json(r: OCRResult) -> dict[str, Any]:
    return {
        "truck_id": r.truck_id,
        "confidence": r.confidence,
        "frame_ref": r.frame_ref,
        "raw": r.raw,
        "analysis": r.analysis,
    }


def ocr_from_json(d: dict[str, Any]) -> OCRResult:
    truck = d.get("truck_id")
    frame = d.get("frame_ref")
    return OCRResult(
        truck_id=str(truck) if truck is not None else None,
        confidence=float(d["confidence"]),
        frame_ref=str(frame) if frame is not None else None,
        raw=str(d.get("raw") or ""),
        analysis=str(d.get("analysis") or ""),
    )


def classify_to_json(r: ClassifyResult) -> dict[str, Any]:
    return {
        "debris_class": r.debris_class,
        "confidence": r.confidence,
        "raw": r.raw,
        "analysis": r.analysis,
        "visual_fill_pct": r.visual_fill_pct,
    }


def classify_from_json(d: dict[str, Any]) -> ClassifyResult:
    visual = d.get("visual_fill_pct")
    return ClassifyResult(
        debris_class=str(d["debris_class"]),
        confidence=float(d["confidence"]),
        raw=str(d.get("raw") or ""),
        analysis=str(d.get("analysis") or ""),
        visual_fill_pct=float(visual) if visual is not None else None,
    )


def confidence_of(stage_key: str, payload: dict[str, Any]) -> float | None:
    """Lift a stage's confidence out for the queryable column (None for track)."""
    if stage_key in (STAGE_OCR, STAGE_CLASSIFY):
        c = payload.get("confidence")
        return float(cast("float", c)) if c is not None else None
    return None
