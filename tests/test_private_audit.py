"""Unit tests for private audit execution with Baseten open-weights provider."""

from __future__ import annotations

from eval.run_private_audit import run_private_audit


def test_private_audit_runs_deterministically() -> None:
    res = run_private_audit()
    assert res["status"] == "success"
    assert res["provider"] == "baseten"
    assert res["model"] == "meta-models/muse-spark-open-1026"
    assert res["overbill_dollar_delta"] > 0
    assert len(str(res["receipt_hash"])) == 64

