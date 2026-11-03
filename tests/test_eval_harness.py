"""Unit tests verifying the evaluation harness functionality and metrics output."""

from __future__ import annotations

from eval.runner import run


def test_eval_harness_execution() -> None:
    """Verify that evaluation benchmarks run and output positive metrics."""
    metrics = run()
    assert metrics.total_samples > 0
    assert metrics.mean_absolute_error_pct < 5.0
    assert metrics.receipt_reproducibility_pct == 100.0
    assert metrics.latency_p50_ms < 1000.0
