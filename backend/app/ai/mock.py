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

from app.ai.base import (
    ClassifyResult,
    ClipMedia,
    Narration,
    OCRResult,
    StageExplanations,
    TrackedObject,
    TrackResult,
)

_FIXTURES_PATH = Path(__file__).parent / "fixtures" / "scenarios.json"
_DEFAULT_KEY = "clean-full-cd"


def _pct(value: object) -> str:
    """A 0..1 fraction as a rounded percentage string (e.g. 0.82 -> '82%')."""
    try:
        return f"{float(value):.0%}"  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "most of"


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

    async def track(self, clip: ClipMedia) -> TrackResult:
        t = self._scenario(clip.content_hash)["track"]
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

    async def read_placard(self, clip: ClipMedia) -> OCRResult:
        o = self._scenario(clip.content_hash)["ocr"]
        truck_id = o.get("truck_id")
        confidence = float(o["confidence"])
        if truck_id:
            analysis = (
                f"Muse Spark read the rear placard as {truck_id} from the clearest frame at "
                f"{confidence:.0%} confidence. This ID keys the certified capacity lookup, so the "
                "whole valuation depends on reading it right."
            )
        else:
            analysis = (
                "The rear placard could not be read confidently; the panel was too blurred or "
                "angled in every sampled frame. The ticket is flagged for manual identification "
                "before it can be certified."
            )
        return OCRResult(
            truck_id=truck_id,
            confidence=confidence,
            frame_ref=o.get("frame_ref"),
            analysis=analysis,
        )

    async def classify_debris(self, clip: ClipMedia) -> ClassifyResult:
        c = self._scenario(clip.content_hash)["classify"]
        debris_class = c["debris_class"]
        confidence = float(c["confidence"])
        label = debris_class.replace("_", " ")
        analysis = (
            f"Muse Spark classified the load as {label} at {confidence:.0%} confidence, from the "
            "material's shape, color, and texture across the sampled frames. This class selects "
            "the per-cubic-yard rate the valuation applies."
        )
        return ClassifyResult(
            debris_class=debris_class,
            confidence=confidence,
            analysis=analysis,
        )

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> Narration:
        return Narration(text=self._narrative(anomaly_type, facts))

    async def explain_pipeline(self, facts: dict[str, object]) -> StageExplanations:
        """Grounded, deterministic per-stage analysis standing in for Muse Spark.

        The live client asks the model to author the same paragraphs; here we
        phrase the measured facts the caller supplies so MOCK_AI mode shows the
        same "AI analysis" surface the demo relies on."""
        return StageExplanations(by_stage=self._explanations(facts))

    @staticmethod
    def _explanations(facts: dict[str, object]) -> dict[str, str]:
        def s(key: str, default: str = "") -> str:
            value = facts.get(key, default)
            return str(value) if value is not None else default

        truck = s("truck_id", "the truck")
        certified = s("certified_cubic_yards", "0")
        fill = s("fill_pct", "0")
        coverage = _pct(facts.get("planar_coverage"))
        debris = s("debris_class", "other").replace("_", " ")
        rate = s("rate_per_cy", "0")
        est_cy = s("est_cubic_yards", "0")
        value = s("est_dollar_value", "0")
        frame_count = s("frame_count", "the sampled")
        certified_truck = bool(facts.get("truck_certified"))
        anomalies = facts.get("anomalies")
        anomaly_list = anomalies if isinstance(anomalies, list) else []

        out: dict[str, str] = {
            "sam_track": (
                f"SAM 3.1 tracked the truck, its bed, and the load across {frame_count} frames "
                "and returned a segmentation mask for each. These masks are the pixel evidence "
                "every downstream measurement reads from, so the rest of the pipeline works from "
                "what was segmented, not from an assumption."
            ),
            "capacity": (
                f"Truck {truck} matched a certified record carrying {certified} cubic yards of "
                "registered capacity, which the volume math uses as the bed's full-load size. "
                "This matches the official certified registry record directly without guesswork."
                if certified_truck
                else f"Truck {truck} was not found in the certified registry, so no certified "
                "capacity could be applied. The load still measures, but it is flagged for "
                "verification before it can be certified."
            ),
            "geometry": (
                f"Calculated the bed at {fill}% full. The load covers "
                f"{coverage} of the bed opening above the tailgate rim, and the fill is that "
                "opening coverage, so the number traces to the masks rather than a guess."
            ),
            "dollar_math": (
                f"Exact arithmetic valued the load at ${value}: {fill}% of {certified} cubic "
                f"yards is {est_cy} cubic yards, and at the {debris} rate of ${rate} per cubic "
                "yard that is the measured dollar value. No model opinion enters this step."
            ),
        }
        if anomaly_list:
            count = len(anomaly_list)
            noun = "anomaly" if count == 1 else "anomalies"
            out["anomalies"] = (
                "Automated compliance rules checked the measured facts against this truck's "
                "certification, capacity, and the surface-versus-depth relationship, and raised "
                f"{count} {noun} for review. The rules decide whether a flag fires; the model only "
                "phrases each one in plain language for the monitor."
            )
        else:
            out["anomalies"] = (
                "Automated compliance rules checked the measured facts against certification, capacity, "
                "and the surface-versus-depth relationship, and found nothing to flag on this load."
            )
        return out

    async def answer_question(self, prompt: str) -> Narration:
        # No model in the mock: return empty so the analyst composes its own
        # deterministic, data-true answer from the tool evidence instead.
        return Narration(text="")

    @staticmethod
    def _narrative(anomaly_type: str, facts: dict[str, str]) -> str:
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
            "surface_depth_mismatch": (
                f"The load surface spans most of the bed opening but credits only {fill}% fill, "
                "so the measured depth is low. Review the surface against the depth."
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
