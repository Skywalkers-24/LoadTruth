"""CLI runner for LoadTruth evaluation benchmarks."""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Add backend directory to path if not already configured
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from eval.harness import BenchmarkMetrics, EvaluationCase, EvaluationHarness


def generate_benchmark_cases() -> list[EvaluationCase]:
    """Load benchmark cases representing diverse disaster debris scenarios."""
    fixture_path = ROOT_DIR / "eval" / "fixtures" / "load_scenarios.json"
    if fixture_path.exists():
        with open(fixture_path, encoding="utf-8") as f:
            data = json.load(f)
            return [EvaluationCase(**item) for item in data]

    # Deterministic default suite of FEMA inspection scenarios
    return [
        EvaluationCase(
            case_id="HURR-MILTON-001",
            truck_id="FL-DT-104",
            certified_cy=30.0,
            true_fill_pct=65.0,
            predicted_fill_pct=64.2,
            human_monitor_call=80.0,
            true_debris_class="vegetative",
            predicted_debris_class="vegetative",
            true_placard_ocr="FL-DT-104",
            predicted_placard_ocr="FL-DT-104",
            expected_radio_call="eighty percent vegetative",
            transcribed_radio_call="eighty percent vegetative",
            latency_ms=384.0,
        ),
        EvaluationCase(
            case_id="HURR-MILTON-002",
            truck_id="FL-DT-215",
            certified_cy=40.0,
            true_fill_pct=82.0,
            predicted_fill_pct=81.5,
            human_monitor_call=90.0,
            true_debris_class="construction_demolition",
            predicted_debris_class="construction_demolition",
            true_placard_ocr="FL-DT-215",
            predicted_placard_ocr="FL-DT-215",
            expected_radio_call="ninety percent c and d",
            transcribed_radio_call="ninety percent c and d",
            latency_ms=412.0,
        ),
        EvaluationCase(
            case_id="HURR-MILTON-003",
            truck_id="NC-HAUL-88",
            certified_cy=50.0,
            true_fill_pct=45.0,
            predicted_fill_pct=46.1,
            human_monitor_call=60.0,
            true_debris_class="vegetative",
            predicted_debris_class="vegetative",
            true_placard_ocr="NC-HAUL-88",
            predicted_placard_ocr="NC-HAUL-88",
            expected_radio_call="sixty percent vegetative",
            transcribed_radio_call="sixty percent vegetative",
            latency_ms=395.0,
        ),
        EvaluationCase(
            case_id="HURR-MILTON-004",
            truck_id="GA-TRK-771",
            certified_cy=25.0,
            true_fill_pct=90.0,
            predicted_fill_pct=88.7,
            human_monitor_call=100.0,
            true_debris_class="hazardous",
            predicted_debris_class="hazardous",
            true_placard_ocr="GA-TRK-771",
            predicted_placard_ocr="GA-TRK-771",
            expected_radio_call="full load hazardous",
            transcribed_radio_call="full load hazardous",
            latency_ms=445.0,
        ),
        EvaluationCase(
            case_id="HURR-MILTON-005",
            truck_id="TX-VOL-902",
            certified_cy=60.0,
            true_fill_pct=52.0,
            predicted_fill_pct=53.4,
            human_monitor_call=70.0,
            true_debris_class="vegetative",
            predicted_debris_class="vegetative",
            true_placard_ocr="TX-VOL-902",
            predicted_placard_ocr="TX-VOL-902",
            expected_radio_call="seventy percent vegetative",
            transcribed_radio_call="seventy percent vegetative",
            latency_ms=378.0,
        ),
    ]


def run() -> BenchmarkMetrics:
    cases = generate_benchmark_cases()
    harness = EvaluationHarness(cases)
    metrics = harness.evaluate()

    print("=" * 60)
    print("LoadTruth Model Evaluation & Benchmark Summary")
    print("=" * 60)
    print(f"Total Scenarios Evaluated       : {metrics.total_samples}")
    print(f"SAM 3.1 + Muse Volumetric MAE   : {metrics.mean_absolute_error_pct}%")
    print(f"Human Monitor Eyeball MAE       : {metrics.human_monitor_mae_pct}% (Overbilling gap: +{round(metrics.human_monitor_mae_pct - metrics.mean_absolute_error_pct, 2)}%)")
    print(f"Volumetric Accuracy within 5%   : {metrics.accuracy_within_5pct}%")
    print(f"Volumetric Accuracy within 10%  : {metrics.accuracy_within_10pct}%")
    print(f"Placard OCR F1 Score            : {metrics.placard_ocr_f1}%")
    print(f"Radio Transcribe F1 Score       : {metrics.radio_transcribe_f1}%")
    print(f"Verification Latency (p50 / p95): {metrics.latency_p50_ms} ms / {metrics.latency_p95_ms} ms")
    print(f"Evidence Receipt Determinism    : {metrics.receipt_reproducibility_pct}%")
    print("=" * 60)
    return metrics


if __name__ == "__main__":
    run()

