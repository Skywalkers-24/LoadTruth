"""Benchmark computation and ground-truth IO.

Pure, deterministic statistics over (predicted, true) fill pairs, plus the CSV
loader for the ground-truth manifest. The pipeline-running part lives in
``run.py`` so these functions stay free of IO and trivially testable.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

# A prediction is "correct" when within this many percentage points of truth.
TOLERANCE_PCT = 10.0


@dataclass(frozen=True, slots=True)
class GroundTruthRow:
    """One benchmark clip with its measured true fill % and capture conditions."""

    clip: str
    true_fill_pct: float
    material: str
    angle: str
    lighting: str


@dataclass(frozen=True, slots=True)
class BenchmarkRow:
    """A single clip's result: the known truth, the machine estimate, the error."""

    clip: str
    true_fill_pct: float
    predicted_fill_pct: float
    material: str
    angle: str
    lighting: str

    @property
    def abs_error(self) -> float:
        return abs(self.predicted_fill_pct - self.true_fill_pct)

    @property
    def within_tolerance(self) -> bool:
        return self.abs_error <= TOLERANCE_PCT


@dataclass(frozen=True, slots=True)
class ConditionStat:
    """Error roll-up for one slice (e.g. material = vegetative)."""

    label: str
    count: int
    mae: float
    within_pct: float


@dataclass(frozen=True, slots=True)
class BenchmarkReport:
    """The full benchmark result, ready to serialize to JSON."""

    clip_count: int
    mae: float
    rmse: float
    within_tolerance_pct: float
    tolerance_pct: float
    by_material: list[ConditionStat] = field(default_factory=list)
    by_angle: list[ConditionStat] = field(default_factory=list)
    by_lighting: list[ConditionStat] = field(default_factory=list)
    rows: list[BenchmarkRow] = field(default_factory=list)

    def to_json(self) -> dict[str, object]:
        return {
            "clip_count": self.clip_count,
            "mae": round(self.mae, 2),
            "rmse": round(self.rmse, 2),
            "within_tolerance_pct": round(self.within_tolerance_pct, 1),
            "tolerance_pct": self.tolerance_pct,
            "by_material": [_stat_json(s) for s in self.by_material],
            "by_angle": [_stat_json(s) for s in self.by_angle],
            "by_lighting": [_stat_json(s) for s in self.by_lighting],
            "rows": [
                {
                    "clip": r.clip,
                    "true_fill_pct": r.true_fill_pct,
                    "predicted_fill_pct": round(r.predicted_fill_pct, 2),
                    "abs_error": round(r.abs_error, 2),
                    "within_tolerance": r.within_tolerance,
                    "material": r.material,
                    "angle": r.angle,
                    "lighting": r.lighting,
                }
                for r in self.rows
            ],
        }


def _stat_json(s: ConditionStat) -> dict[str, object]:
    return {
        "label": s.label,
        "count": s.count,
        "mae": round(s.mae, 2),
        "within_pct": round(s.within_pct, 1),
    }


def load_ground_truth(path: Path) -> list[GroundTruthRow]:
    """Read the ground-truth manifest CSV.

    Columns: ``clip, true_fill_pct, material, angle, lighting``. Blank lines and a
    leading ``#`` comment row are skipped. Raises ``ValueError`` on a malformed
    ``true_fill_pct`` so a typo fails loudly rather than skewing the benchmark.
    """
    rows: list[GroundTruthRow] = []
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for raw in reader:
            clip = (raw.get("clip") or "").strip()
            if not clip or clip.startswith("#"):
                continue
            try:
                true_fill = float((raw.get("true_fill_pct") or "").strip())
            except ValueError as exc:
                raise ValueError(f"bad true_fill_pct for clip {clip!r}") from exc
            rows.append(
                GroundTruthRow(
                    clip=clip,
                    true_fill_pct=true_fill,
                    material=(raw.get("material") or "unknown").strip(),
                    angle=(raw.get("angle") or "unknown").strip(),
                    lighting=(raw.get("lighting") or "unknown").strip(),
                )
            )
    return rows


def _condition_stats(rows: list[BenchmarkRow], key: str) -> list[ConditionStat]:
    buckets: dict[str, list[BenchmarkRow]] = defaultdict(list)
    for r in rows:
        buckets[getattr(r, key)].append(r)
    out: list[ConditionStat] = []
    for label in sorted(buckets):
        group = buckets[label]
        mae = sum(r.abs_error for r in group) / len(group)
        within = 100.0 * sum(1 for r in group if r.within_tolerance) / len(group)
        out.append(ConditionStat(label=label, count=len(group), mae=mae, within_pct=within))
    return out


def summarize(rows: list[BenchmarkRow]) -> BenchmarkReport:
    """Compute MAE, RMSE, % within tolerance, and per-condition breakdowns."""
    if not rows:
        return BenchmarkReport(
            clip_count=0,
            mae=0.0,
            rmse=0.0,
            within_tolerance_pct=0.0,
            tolerance_pct=TOLERANCE_PCT,
        )
    n = len(rows)
    mae = sum(r.abs_error for r in rows) / n
    rmse = (sum(r.abs_error**2 for r in rows) / n) ** 0.5
    within = 100.0 * sum(1 for r in rows if r.within_tolerance) / n
    return BenchmarkReport(
        clip_count=n,
        mae=mae,
        rmse=rmse,
        within_tolerance_pct=within,
        tolerance_pct=TOLERANCE_PCT,
        by_material=_condition_stats(rows, "material"),
        by_angle=_condition_stats(rows, "angle"),
        by_lighting=_condition_stats(rows, "lighting"),
        rows=rows,
    )
