"""Stage 5 — fill-% estimation from segmentation geometry (PLAN.md §5).

This is the technical core and it is deliberately *deterministic*: the fill %
traces back to pixels, not to a model's opinion. SAM 3.1 gives per-frame masks
for the truck bed and the load; :mod:`app.ai.sam_measure` turns them into the
bed **opening** (the inside of the bed above the tailgate rim) and the load
inside it. This module turns those into a credited fill percentage.

Model (measurement v2):

    opening area     A_open = the bed opening, wall to wall, above the tailgate rim
    load area        A_load = load pixels inside the opening (+ load above the front rim)
    coverage         c      = A_load / A_open                          (0..1)
    depth            d      = share of the bed's depth that coverage stands for (0..1)

    fill %  = clamp(c * d, 0, 1) * 100

From the gate camera, coverage already reads depth: a load sitting low in the
bed leaves more of the inner walls and headboard visible, so the live
measurement reports d = 1.0 and the fill is the opening coverage. Fixture
scenarios carry a hand-set d so their intended fills hold. The earlier model
divided by the whole bed mask, tailgate face included, which read a full bed at
roughly a third of its real fill; it also keyed a depth prior by debris class
while being handed the truck's body type, so the prior never applied.

Confidence starts from how extreme the estimate is and how well views agree,
then is capped by measurement quality: no load phrase matched inside the bed,
the bed outline came from the whole truck, frames that disagree, or a large gap
from Muse Spark's independent visual read of the same clip. A capped confidence
trips the low-confidence review flag rather than letting a weak number pass
silently. Every input here comes from SAM or Muse Spark; this module is the
local arithmetic that cross-checks them.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

_PCT = Decimal("0.01")

# Confidence cap when the fill rests on a weak measurement. Below the anomaly
# engine's low-confidence threshold (0.45), so the ticket is flagged for review.
_WEAK_CAP = 0.40
# Points of disagreement with Muse Spark's visual read that count as a conflict.
_CROSS_CHECK_POINTS = 20.0
# Per-frame coverage spread (interquartile, 0..1) above which frames disagree.
_SPREAD_LIMIT = 0.20


@dataclass(frozen=True, slots=True)
class MaskMeasurement:
    """One view's measured areas, in pixels (or any consistent unit).

    ``bed_area`` is the bed opening; ``load_area`` is the load inside it;
    ``load_height_ratio`` is the share of the bed's depth that coverage stands
    for (1.0 when the coverage already reads depth, as from the gate camera).
    All are >= 0.
    """

    bed_area: float
    load_area: float
    load_height_ratio: float


@dataclass(frozen=True, slots=True)
class FillEstimate:
    """Result of Stage 5: a fill % with a confidence and its inputs for audit."""

    fill_pct: Decimal
    confidence: float
    planar_coverage: float
    depth_factor: float
    views_used: int
    # Why confidence was capped, in plain words (empty when it was not).
    quality_notes: tuple[str, ...] = ()


def _view_fill(m: MaskMeasurement) -> float:
    """Fraction-full (0..1) for a single view."""
    if m.bed_area <= 0:
        return 0.0
    coverage = _clamp(m.load_area / m.bed_area, 0.0, 1.0)
    return _clamp(coverage * _clamp(m.load_height_ratio, 0.0, 1.0), 0.0, 1.0)


def estimate_fill(
    views: list[MaskMeasurement],
    *,
    load_source: str = "segmented",
    bed_source: str = "bed",
    coverage_spread: float = 0.0,
    cross_check_pct: float | None = None,
) -> FillEstimate:
    """Estimate fill % from one or more mask measurements.

    ``load_source``, ``bed_source``, ``coverage_spread``, and ``cross_check_pct``
    only shape the
    confidence, never the fill %, so Re-verify reproduces the number from the
    stored areas alone. Raises ValueError if no views are given.
    """
    if not views:
        raise ValueError("at least one view is required")

    fractions = [_view_fill(v) for v in views]
    mean = sum(fractions) / len(fractions)
    primary = views[0]
    coverage = _clamp(primary.load_area / primary.bed_area, 0.0, 1.0) if primary.bed_area else 0.0
    fill_pct = Decimal(str(mean * 100)).quantize(_PCT, rounding=ROUND_HALF_UP)

    confidence = _confidence(fractions, mean)
    notes: list[str] = []
    if load_source == "none":
        notes.append("SAM found no load inside the bed; confirm the bed is empty.")
    if bed_source == "truck":
        notes.append("SAM found no truck bed, so the whole truck outline was measured.")
    if coverage_spread > _SPREAD_LIMIT:
        notes.append(f"Frames disagree on coverage (spread {coverage_spread:.0%}).")
    if cross_check_pct is not None and abs(cross_check_pct - mean * 100) > _CROSS_CHECK_POINTS:
        notes.append(
            f"Muse Spark's visual read ({cross_check_pct:.0f}%) differs from the "
            f"measurement by more than {_CROSS_CHECK_POINTS:.0f} points."
        )
    if notes:
        confidence = min(confidence, _WEAK_CAP)

    return FillEstimate(
        fill_pct=fill_pct,
        confidence=round(confidence, 3),
        planar_coverage=round(coverage, 3),
        depth_factor=round(_clamp(primary.load_height_ratio, 0.0, 1.0), 3),
        views_used=len(views),
        quality_notes=tuple(notes),
    )


def _confidence(fractions: list[float], mean: float) -> float:
    """Confidence 0..1: lower at extremes and when multiple views disagree."""
    # Extremity penalty: estimates hugging 0 or 1 are harder to pin precisely.
    extremity = 1.0 - 2.0 * abs(mean - 0.5)  # 1 at mid-fill, 0 at the ends
    base = 0.6 + 0.4 * extremity
    if len(fractions) >= 2:
        spread = max(fractions) - min(fractions)
        base *= _clamp(1.0 - spread, 0.0, 1.0)
    return _clamp(base, 0.0, 1.0)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))
