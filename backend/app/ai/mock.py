"""MockAIClient — replays committed fixtures (PLAN.md §5b). Zero credits.

Keyed by the clip's content hash, exactly as the live cache is, so swapping to
the real client later changes nothing for callers. Unknown hashes fall back to a
reasonable default scenario so new demo clips still flow through the pipeline.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

from app.ai.base import ClassifyResult, OCRResult, TrackedObject, TrackResult

_FIXTURES_PATH = Path(__file__).parent / "fixtures" / "scenarios.json"
_DEFAULT_KEY = "clean-full-cd"


@lru_cache
def _load_fixtures() -> dict[str, dict[str, Any]]:
    raw = cast("dict[str, Any]", json.loads(_FIXTURES_PATH.read_text(encoding="utf-8")))
    out: dict[str, dict[str, Any]] = {}
    for key, value in raw.items():
        if not str(key).startswith("_"):
            out[str(key)] = cast("dict[str, Any]", value)
    return out


class MockAIClient:
    """Fixture-backed implementation of the AIClient protocol."""

    def _scenario(self, content_hash: str) -> dict[str, Any]:
        fixtures = _load_fixtures()
        return fixtures.get(content_hash, fixtures[_DEFAULT_KEY])

    async def track(self, content_hash: str) -> TrackResult:
        t = self._scenario(content_hash)["track"]
        objects = [
            TrackedObject(
                label=o["label"],
                sam_object_id=o["sam_object_id"],
                mask_areas=list(o.get("mask_areas", [])),
                load_height_ratio=float(o.get("load_height_ratio", 0.0)),
            )
            for o in t["objects"]
        ]
        return TrackResult(objects=objects, frame_count=int(t["frame_count"]))

    async def read_placard(self, content_hash: str) -> OCRResult:
        o = self._scenario(content_hash)["ocr"]
        return OCRResult(
            truck_id=o.get("truck_id"),
            confidence=float(o["confidence"]),
            frame_ref=o.get("frame_ref"),
        )

    async def classify_debris(self, content_hash: str) -> ClassifyResult:
        c = self._scenario(content_hash)["classify"]
        return ClassifyResult(
            debris_class=c["debris_class"],
            confidence=float(c["confidence"]),
        )

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> str:
        # Deterministic, fixture-style narrative (no model). The live client asks
        # Muse Spark to phrase the same facts; the decision was already made by
        # the rules in app.pipeline.anomalies.
        detail = "; ".join(f"{k}={v}" for k, v in sorted(facts.items()))
        return (
            f"[{anomaly_type}] flagged for review ({detail})."
            if detail
            else (f"[{anomaly_type}] flagged for review.")
        )
