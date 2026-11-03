"""Quantitative evaluation harness for LoadTruth pipeline models and deterministic stages."""

from __future__ import annotations

import math
import statistics
import time
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from app.pipeline.receipt import ReceiptInputs, compute_receipt
from app.tickets.money import value_ticket


@dataclass(frozen=True)
class EvaluationCase:
    case_id: str
    truck_id: str
    certified_cy: float
    true_fill_pct: float
    predicted_fill_pct: float
    human_monitor_call: float
    true_debris_class: str
    predicted_debris_class: str
    true_placard_ocr: str
    predicted_placard_ocr: str
    expected_radio_call: str
    transcribed_radio_call: str
    latency_ms: float


@dataclass
class BenchmarkMetrics:
    total_samples: int
    mean_absolute_error_pct: float
    root_mean_squared_error_pct: float
    accuracy_within_5pct: float
    accuracy_within_10pct: float
    human_monitor_mae_pct: float
    placard_ocr_f1: float
    radio_transcribe_f1: float
    latency_p50_ms: float
    latency_p95_ms: float
    receipt_reproducibility_pct: float


class EvaluationHarness:
    """Evaluates multi-model pipeline accuracy and determinism against ground truth datasets."""

    def __init__(self, cases: list[EvaluationCase]) -> None:
        self.cases = cases

    def evaluate(self) -> BenchmarkMetrics:
        if not self.cases:
            raise ValueError("No evaluation cases provided")

        abs_errors: list[float] = []
        squared_errors: list[float] = []
        human_errors: list[float] = []
        within_5 = 0
        within_10 = 0
        ocr_matches = 0
        radio_matches = 0
        latencies: list[float] = []
        receipt_matches = 0

        for case in self.cases:
            err = abs(case.predicted_fill_pct - case.true_fill_pct)
            abs_errors.append(err)
            squared_errors.append(err**2)
            human_errors.append(abs(case.human_monitor_call - case.true_fill_pct))

            if err <= 5.0:
                within_5 += 1
            if err <= 10.0:
                within_10 += 1

            if case.predicted_placard_ocr.upper() == case.true_placard_ocr.upper():
                ocr_matches += 1

            if case.transcribed_radio_call.strip().lower() == case.expected_radio_call.strip().lower():
                radio_matches += 1

            latencies.append(case.latency_ms)

            # Test cryptographic receipt determinism
            inputs = ReceiptInputs(
                content_hash="a" * 64,
                sam_output_hash="b" * 64,
                bed_area=1200.0,
                load_area=840.0,
                load_height_ratio=0.70,
                body_type="dump",
                truck_id=case.truck_id,
                debris_class=case.predicted_debris_class,
                certified_cubic_yards=str(case.certified_cy),
                rate_per_cy="12.00",
                est_fill_pct=f"{case.predicted_fill_pct:.2f}",
                est_cubic_yards=f"{(case.certified_cy * case.predicted_fill_pct / 100):.2f}",
                est_dollar_value="144.00",
                sam_model="sam-3.1",
                spark_model="muse-spark-1.3",
            )
            r1 = compute_receipt(inputs)
            r2 = compute_receipt(inputs)
            if r1.receipt_hash == r2.receipt_hash and len(r1.receipt_hash) == 64:
                receipt_matches += 1

        total = len(self.cases)
        mae = statistics.mean(abs_errors)
        rmse = math.sqrt(statistics.mean(squared_errors))
        human_mae = statistics.mean(human_errors)

        sorted_latencies = sorted(latencies)
        p50 = sorted_latencies[int(total * 0.50)]
        p95 = sorted_latencies[int(total * 0.95)]

        return BenchmarkMetrics(
            total_samples=total,
            mean_absolute_error_pct=round(mae, 2),
            root_mean_squared_error_pct=round(rmse, 2),
            accuracy_within_5pct=round(within_5 / total * 100, 1),
            accuracy_within_10pct=round(within_10 / total * 100, 1),
            human_monitor_mae_pct=round(human_mae, 2),
            placard_ocr_f1=round(ocr_matches / total * 100, 1),
            radio_transcribe_f1=round(radio_matches / total * 100, 1),
            latency_p50_ms=round(p50, 1),
            latency_p95_ms=round(p95, 1),
            receipt_reproducibility_pct=round(receipt_matches / total * 100, 1),
        )
