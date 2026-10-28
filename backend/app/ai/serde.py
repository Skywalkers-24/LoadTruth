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
        objects=objects, frame_count=int(d["frame_count"]), segments=segments, notes=notes
    )


def track_is_current(d: dict[str, Any]) -> bool:
    """False for track rows stored before SAM's raw output was kept.

    Those rows can't draw the Review overlay, so the cache recomputes them once.
    """
    return "sam_output" in d


def ocr_to_json(r: OCRResult) -> dict[str, Any]:
    return {
        "truck_id": r.truck_id,
        "confidence": r.confidence,
        "frame_ref": r.frame_ref,
        "raw": r.raw,
    }


def ocr_from_json(d: dict[str, Any]) -> OCRResult:
    truck = d.get("truck_id")
    frame = d.get("frame_ref")
    return OCRResult(
        truck_id=str(truck) if truck is not None else None,
        confidence=float(d["confidence"]),
        frame_ref=str(frame) if frame is not None else None,
        raw=str(d.get("raw") or ""),
    )


def classify_to_json(r: ClassifyResult) -> dict[str, Any]:
    return {"debris_class": r.debris_class, "confidence": r.confidence, "raw": r.raw}


def classify_from_json(d: dict[str, Any]) -> ClassifyResult:
    return ClassifyResult(
        debris_class=str(d["debris_class"]),
        confidence=float(d["confidence"]),
        raw=str(d.get("raw") or ""),
    )


def confidence_of(stage_key: str, payload: dict[str, Any]) -> float | None:
    """Lift a stage's confidence out for the queryable column (None for track)."""
    if stage_key in (STAGE_OCR, STAGE_CLASSIFY):
        c = payload.get("confidence")
        return float(cast("float", c)) if c is not None else None
    return None
