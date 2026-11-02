"""Run the pipeline over the ground-truth clips and emit a benchmark report.

Usage (from the backend dir, with the venv active):

    python -m app.bench.run --clips ../scratch/benchmark/clips \\
        --truth ../scratch/benchmark/ground_truth.csv \\
        --out ../scratch/benchmark/results.json

For each row in the manifest it ingests the matching clip file through the real
pipeline (SAM + Spark, or fixtures under MOCK_AI), reads the measured fill %, and
compares it to the known true value, then writes a report to the requested path.

The pipeline is the same code the API runs, so the benchmark measures the real
estimator, not a reimplementation.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from uuid import uuid4

from app.ai import get_ai_client
from app.bench.harness import (
    BenchmarkReport,
    BenchmarkRow,
    GroundTruthRow,
    load_ground_truth,
    summarize,
)
from app.log import get_logger
from app.pipeline.ingest import ingest_upload
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.registry import TruckRegistry

log = get_logger("bench")

# A permissive rate table and an empty registry: the benchmark only reads the
# geometry fill %, not dollars or capacity flags, so these do not affect it.
_RATE_TABLE: dict[str, float] = {
    "vegetative": 8.0,
    "construction_demolition": 10.0,
    "white_goods": 12.0,
    "hazardous": 20.0,
    "other": 6.0,
}


def _find_clip(clips_dir: Path, name: str) -> Path | None:
    """Resolve a manifest clip name to a file, trying it verbatim then by stem."""
    direct = clips_dir / name
    if direct.is_file():
        return direct
    matches = sorted(clips_dir.glob(f"{Path(name).stem}.*"))
    return matches[0] if matches else None


async def _measure_one(gt: GroundTruthRow, data: bytes, filename: str) -> float:
    """Ingest one clip through the pipeline and return the measured fill %."""
    artifact = ingest_upload(filename, data, allow_scenario_override=False)
    ai = get_ai_client()
    tenant_id = uuid4()
    event_id = uuid4()
    result = await run_pipeline(
        artifact=artifact,
        tenant_id=tenant_id,
        event_id=event_id,
        registry=TruckRegistry([]),
        rate_table=_RATE_TABLE,
        ai=ai,
        data=data,
    )
    if result.no_truck:
        # No measurable load: report 0% so the error is visible, not hidden.
        return 0.0
    return float(result.ticket.est_fill_pct)


async def run_benchmark(clips_dir: Path, truth_csv: Path) -> BenchmarkReport:
    """Run the full benchmark and return the report (no file IO for the result)."""
    ground_truth = load_ground_truth(truth_csv)
    rows: list[BenchmarkRow] = []
    for gt in ground_truth:
        clip_path = _find_clip(clips_dir, gt.clip)
        if clip_path is None:
            log.warning("bench_clip_missing", clip=gt.clip)
            continue
        data = clip_path.read_bytes()
        predicted = await _measure_one(gt, data, clip_path.name)
        rows.append(
            BenchmarkRow(
                clip=gt.clip,
                true_fill_pct=gt.true_fill_pct,
                predicted_fill_pct=predicted,
                material=gt.material,
                angle=gt.angle,
                lighting=gt.lighting,
            )
        )
        log.info(
            "bench_clip_done",
            clip=gt.clip,
            true=gt.true_fill_pct,
            predicted=round(predicted, 2),
        )
    return summarize(rows)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="LoadTruth fill-% benchmark harness")
    p.add_argument("--clips", type=Path, required=True, help="directory of benchmark clips")
    p.add_argument("--truth", type=Path, required=True, help="ground_truth.csv manifest")
    p.add_argument("--out", type=Path, required=True, help="where to write results.json")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    report = asyncio.run(run_benchmark(args.clips, args.truth))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report.to_json(), indent=2) + "\n", encoding="utf-8")
    print(
        f"Benchmarked {report.clip_count} clips: "
        f"MAE {report.mae:.2f} points, "
        f"{report.within_tolerance_pct:.1f}% within {report.tolerance_pct:.0f} points. "
        f"Wrote {args.out}."
    )


if __name__ == "__main__":
    main()
