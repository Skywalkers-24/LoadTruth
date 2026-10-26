"""Stage 5 — fill-% estimation from segmentation geometry (PLAN.md §5).

This is the technical core and it is deliberately *deterministic*: the fill %
traces back to pixels, not to a model's opinion. SAM 3.1 gives us per-frame masks
for the truck bed and the debris pile; this module turns those masks into a
credited-volume fill percentage the monitor can audit.

Model (single-view, with an optional depth prior):

    bed opening area      A_bed   = area of the "truck bed" mask (top-down-ish)
    load surface area     A_load  = area of the "debris pile" mask within the bed
    planar coverage       c       = A_load / A_bed                      (0..1)
    depth factor          d       = how full the load is through the bed's depth,
                                    approximated from the load-surface height
                                    against the bed rails, scaled by a body-type
                                    depth prior (vegetative loads mound; C&D packs).

    fill %  = clamp(c * d, 0, 1) * 100

Everything is a ratio of mask measurements, so it is reproducible and explainable.
When two views are available the per-view estimates are averaged (reduces the
single-view bias noted in Research.md §3). Confidence falls when coverage is
extreme (near 0 or 1) or the two views disagree.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# Depth priors by body type: how a unit of planar coverage maps to volume for a
# typical load of that shape. Mounding loads (vegetative) read fuller on the
# surface than they are; dense loads (C&D) pack closer to the planar coverage.
_DEPTH_PRIOR: dict[str, float] = {
    "vegetative": 0.82,
    "construction_demolition": 0.95,
    "white_goods": 0.90,
    "hazardous": 0.90,
    "other": 0.88,
    "default": 0.88,
}

_PCT = Decimal("0.01")


@dataclass(frozen=True, slots=True)
class MaskMeasurement:
    """One view's mask areas, in pixels (or any consistent unit).

    ``bed_area`` is the truck-bed opening; ``load_area`` is the debris mask within
    it; ``load_height_ratio`` is the load surface height measured against the bed
    rails (0 = empty floor, 1 = heaped to the top rail). All are >= 0.
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


def _view_fill(m: MaskMeasurement, depth_prior: float) -> float:
    """Fraction-full (0..1) for a single view."""
    if m.bed_area <= 0:
        return 0.0
    coverage = _clamp(m.load_area / m.bed_area, 0.0, 1.0)
    # Blend planar coverage with the measured load height, weighted by the
    # body-type depth prior. Height carries the through-bed signal coverage lacks.
    height = _clamp(m.load_height_ratio, 0.0, 1.0)
    depth_factor = _clamp((0.5 * coverage + 0.5 * height) * depth_prior / 0.88, 0.0, 1.0)
    return _clamp(coverage * depth_factor + height * (1 - coverage) * 0.15, 0.0, 1.0)


def estimate_fill(
    views: list[MaskMeasurement],
    *,
    body_type: str | None = None,
) -> FillEstimate:
    """Estimate fill % from one or two mask measurements.

    Raises ValueError if no views are given. With two views the estimates are
    averaged and disagreement lowers confidence.
    """
    if not views:
        raise ValueError("at least one view is required")

    prior = _DEPTH_PRIOR.get((body_type or "default"), _DEPTH_PRIOR["default"])
    fractions = [_view_fill(v, prior) for v in views]
    mean = sum(fractions) / len(fractions)

    # Coverage/depth reported from the primary (first) view for explainability.
    primary = views[0]
    coverage = _clamp(primary.load_area / primary.bed_area, 0.0, 1.0) if primary.bed_area else 0.0

    confidence = _confidence(fractions, mean)
    fill_pct = Decimal(str(mean * 100)).quantize(_PCT, rounding=ROUND_HALF_UP)
    return FillEstimate(
        fill_pct=fill_pct,
        confidence=round(confidence, 3),
        planar_coverage=round(coverage, 3),
        depth_factor=round(prior, 3),
        views_used=len(views),
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
