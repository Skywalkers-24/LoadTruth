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


def fixture_keys() -> frozenset[str]:
    """The set of known scenario keys (used to validate a filename override)."""
    return frozenset(_load_fixtures())


# Scenarios an arbitrary (unsteered) upload should NOT randomly land on: the
# empty no-truck case and the anomaly cases are only produced when explicitly
# requested via a `scenario__…` filename, so a casual upload always drafts a
# believable, clean ticket.
_NON_DEFAULT = frozenset({"no-truck", "uncertified-truck"})


class MockAIClient:
    """Fixture-backed implementation of the AIClient protocol."""

    def _scenario(self, content_hash: str) -> dict[str, Any]:
        fixtures = _load_fixtures()
        if content_hash in fixtures:
            return fixtures[content_hash]
        # Unknown clip (a real upload with no scenario override): deterministically
        # pick a clean *positive* scenario from the content hash so each upload
        # drafts a believable ticket (varied truck/debris/fill), never the empty
        # no-truck or a forced-anomaly fixture.
        positives = [k for k in fixtures if k not in _NON_DEFAULT] or [_DEFAULT_KEY]
        positives.sort()  # stable order so the hash→scenario mapping is reproducible
        idx = int(content_hash[:8], 16) % len(positives) if content_hash else 0
        return fixtures[positives[idx]]

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
        # Deterministic, grounded narrative standing in for Muse Spark. The rules
        # in app.pipeline.anomalies already decided; this only phrases the facts
        # into a sentence a monitor can read. The live client asks Muse Spark to
        # phrase the same facts.
        truck = facts.get("truck", "the truck")
        fill = facts.get("fill_pct", "?")
        cy = facts.get("est_cy", "?")
        templates = {
            "uncertified_truck": (
                f"Truck {truck} has no active certification in the registry. "
                "Verify the truck before certifying this ticket."
            ),
            "identity_unreadable": (
                "The placard could not be read confidently from the evidence. "
                "Identify the truck manually before certifying."
            ),
            "capacity_exceeded": (
                f"The measured load ({cy} CY) exceeds this truck's certified capacity. "
                "Check the evidence for an overfilled or misidentified truck."
            ),
            "hollow_load": (
                f"The load covers most of the bed opening but credits only {fill}% fill, "
                "which can indicate a hollow or fluffed load. Review the surface against the depth."
            ),
            "low_confidence": (
                f"Fill-estimate confidence is low for this load (measured near {fill}%), "
                "likely from occlusion or extreme fill. Confirm the measurement manually."
            ),
            "impossible_cycle": (
                f"Truck {truck} recorded two loads closer together than a realistic round trip "
                "for this site. Check for a duplicate or mislabeled capture."
            ),
            "duplicate_truck": (
                f"Truck {truck} appears on overlapping loads. Confirm these are distinct hauls."
            ),
        }
        return templates.get(
            anomaly_type,
            f"This load was flagged for review ({anomaly_type.replace('_', ' ')}).",
        )
