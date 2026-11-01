"""Benchmark harness statistics."""

from __future__ import annotations

from pathlib import Path

from app.bench.harness import BenchmarkRow, load_ground_truth, summarize


def _row(
    pred: float, true: float, material: str = "vegetative", angle: str = "side"
) -> BenchmarkRow:
    return BenchmarkRow(
        clip=f"c-{true}-{pred}",
        true_fill_pct=true,
        predicted_fill_pct=pred,
        material=material,
        angle=angle,
        lighting="daylight",
    )


def test_empty_summary_is_zeroed() -> None:
    report = summarize([])
    assert report.clip_count == 0
    assert report.mae == 0.0
    assert report.within_tolerance_pct == 0.0


def test_mae_rmse_and_tolerance_band() -> None:
    rows = [_row(50, 50), _row(60, 50), _row(30, 50)]  # errors 0, 10, 20
    report = summarize(rows)
    assert report.clip_count == 3
    assert report.mae == 10.0  # (0 + 10 + 20) / 3
    # within 10 points: errors 0 and 10 qualify (<=10), 20 does not -> 2/3.
    assert round(report.within_tolerance_pct, 1) == 66.7
    assert report.rmse > report.mae  # RMSE penalizes the big miss


def test_per_condition_breakdown() -> None:
    rows = [
        _row(50, 50, material="vegetative"),
        _row(70, 50, material="vegetative"),
        _row(42, 40, material="construction_demolition"),
    ]
    report = summarize(rows)
    by_material = {s.label: s for s in report.by_material}
    assert by_material["vegetative"].count == 2
    assert by_material["vegetative"].mae == 10.0
    assert by_material["construction_demolition"].within_pct == 100.0


def test_load_ground_truth_skips_comments_and_parses(tmp_path: Path) -> None:
    csv = tmp_path / "gt.csv"
    csv.write_text(
        "clip,true_fill_pct,material,angle,lighting\n"
        "# a comment row\n"
        "model-veg-050,50,vegetative,side,daylight\n"
        "\n"
        "model-cd-080,80,construction_demolition,rear,overcast\n",
        encoding="utf-8",
    )
    rows = load_ground_truth(csv)
    assert len(rows) == 2
    assert rows[0].clip == "model-veg-050" and rows[0].true_fill_pct == 50.0
    assert rows[1].material == "construction_demolition" and rows[1].angle == "rear"


def test_to_json_shape() -> None:
    report = summarize([_row(55, 50)])
    data = report.to_json()
    assert data["clip_count"] == 1
    assert data["tolerance_pct"] == 10.0
    assert isinstance(data["rows"], list)
    assert data["rows"][0]["within_tolerance"] is True
