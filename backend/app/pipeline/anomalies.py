"""Stage 6 — deterministic anomaly rules (PLAN.md §5, Research.md §5).

These rules tell an auditor what deserves attention and *why*. They are plain
Python decisions over the ticket's measured facts — no model decides whether to
flag. (Muse Spark later writes a human-readable narrative for a flag the rules
already raised; it never recomputes the decision.)

An anomaly is a prompt for review, never proof of misconduct — the wording
reflects that. Severity is informational: `info` < `warn` < `high`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum


class AnomalyType(StrEnum):
    UNCERTIFIED_TRUCK = "uncertified_truck"
    IDENTITY_UNREADABLE = "identity_unreadable"
    CAPACITY_EXCEEDED = "capacity_exceeded"
    IMPOSSIBLE_CYCLE = "impossible_cycle"
    DUPLICATE_TRUCK = "duplicate_truck"
    SURFACE_DEPTH_MISMATCH = "surface_depth_mismatch"
    LOW_CONFIDENCE = "low_confidence"


class Severity(StrEnum):
    INFO = "info"
    WARN = "warn"
    HIGH = "high"


@dataclass(frozen=True, slots=True)
class Anomaly:
    type: AnomalyType
    severity: Severity
    explanation: str
    evidence_frame: str | None = None


@dataclass(frozen=True, slots=True)
class AnomalyInput:
    """Everything the rules need about one observed load."""

    truck_id: str | None
    truck_is_certified: bool
    certified_cubic_yards: Decimal | None
    est_cubic_yards: Decimal
    est_fill_pct: Decimal
    fill_confidence: float
    planar_coverage: float
    identity_confidence: float
    observed_at: datetime | None = None
    evidence_frame: str | None = None


# Minimum realistic minutes between two loads from the same truck at one site.
_MIN_CYCLE_MINUTES = 20.0
# The load surface reaches across most of the bed opening, yet the credited fill
# is low: high planar coverage with low measured depth. We report exactly what we
# measured (surface high, depth low); we do not claim to see interior voids.
_SURFACE_COVERAGE = 0.80
_LOW_DEPTH_FILL_PCT = Decimal(45)
_LOW_CONFIDENCE = 0.45
_CAPACITY_TOLERANCE = Decimal("1.02")  # allow 2% measurement slack


def evaluate(
    load: AnomalyInput,
    *,
    prior_loads: list[AnomalyInput] | None = None,
) -> list[Anomaly]:
    """Return every anomaly the load trips. ``prior_loads`` enables cross-load rules."""
    flags: list[Anomaly] = []
    ev = load.evidence_frame

    if load.truck_id and not load.truck_is_certified:
        flags.append(
            Anomaly(
                AnomalyType.UNCERTIFIED_TRUCK,
                Severity.HIGH,
                f"Truck {load.truck_id} has no active certification in the registry.",
                ev,
            )
        )

    if load.identity_confidence < _LOW_CONFIDENCE or not load.truck_id:
        flags.append(
            Anomaly(
                AnomalyType.IDENTITY_UNREADABLE,
                Severity.WARN,
                "Truck placard could not be read confidently; needs manual identification.",
                ev,
            )
        )

    if (
        load.certified_cubic_yards is not None
        and load.est_cubic_yards > load.certified_cubic_yards * _CAPACITY_TOLERANCE
    ):
        flags.append(
            Anomaly(
                AnomalyType.CAPACITY_EXCEEDED,
                Severity.HIGH,
                f"Measured volume ({load.est_cubic_yards} CY) exceeds the truck's certified "
                f"capacity ({load.certified_cubic_yards} CY).",
                ev,
            )
        )

    if load.planar_coverage >= _SURFACE_COVERAGE and load.est_fill_pct <= _LOW_DEPTH_FILL_PCT:
        flags.append(
            Anomaly(
                AnomalyType.SURFACE_DEPTH_MISMATCH,
                Severity.WARN,
                "The load surface spans most of the bed opening, but the measured depth is "
                "low. Review the surface against the depth before crediting the volume.",
                ev,
            )
        )

    if load.fill_confidence < _LOW_CONFIDENCE:
        flags.append(
            Anomaly(
                AnomalyType.LOW_CONFIDENCE,
                Severity.INFO,
                "Fill-% estimate confidence is low (occlusion or extreme fill); confirm manually.",
                ev,
            )
        )

    flags.extend(_cross_load_rules(load, prior_loads or []))
    return flags


def _cross_load_rules(load: AnomalyInput, prior: list[AnomalyInput]) -> list[Anomaly]:
    flags: list[Anomaly] = []
    if not load.truck_id or load.observed_at is None:
        return flags
    for p in prior:
        if p.truck_id != load.truck_id or p.observed_at is None:
            continue
        gap_min = abs((load.observed_at - p.observed_at).total_seconds()) / 60.0
        if gap_min < _MIN_CYCLE_MINUTES:
            flags.append(
                Anomaly(
                    AnomalyType.IMPOSSIBLE_CYCLE,
                    Severity.HIGH,
                    f"Truck {load.truck_id} recorded two loads {gap_min:.0f} min apart — "
                    f"below the {_MIN_CYCLE_MINUTES:.0f} min minimum round-trip for this site.",
                    load.evidence_frame,
                )
            )
            break
    return flags
