"""Root test suite: verifies deterministic load ticket contracts and receipt fingerprints."""

from __future__ import annotations

from decimal import Decimal

from app.pipeline.receipt import ReceiptInputs, compute_receipt
from app.tickets.money import cubic_yards, dollar_value, value_ticket


def test_deterministic_ticket_valuation_math() -> None:
    """Verify that debris billing uses exact Decimal math without floating point drift."""
    v = value_ticket(
        certified_cubic_yards=20,
        rate_per_cy=12,
        est_fill_pct=62,
        monitor_fill_pct=80,
    )
    assert v.est_cubic_yards == Decimal("12.400")
    assert v.est_dollar_value == Decimal("148.80")
    assert v.monitor_cubic_yards == Decimal("16.000")
    assert v.monitor_dollar_value == Decimal("192.00")
    assert v.delta_cubic_yards == Decimal("3.600")
    assert v.delta_dollar_value == Decimal("43.20")
    assert v.is_overbill is True


def test_sha256_receipt_fingerprint_is_strictly_reproducible() -> None:
    """Verify cryptographic receipt fingerprint is strictly deterministic given identical inputs."""
    inputs1 = ReceiptInputs(
        content_hash="c" * 64,
        sam_output_hash="d" * 64,
        bed_area=1000.0,
        load_area=600.0,
        load_height_ratio=0.5,
        body_type="dump",
        truck_id="FL-DT-3391",
        debris_class="vegetative",
        certified_cubic_yards="30",
        rate_per_cy="8",
        est_fill_pct="60.00",
        est_cubic_yards="18.00",
        est_dollar_value="144.00",
        sam_model="sam-3.1",
        spark_model="muse-spark-1.3",
    )
    inputs2 = ReceiptInputs(
        content_hash="c" * 64,
        sam_output_hash="d" * 64,
        bed_area=1000.0,
        load_area=600.0,
        load_height_ratio=0.5,
        body_type="dump",
        truck_id="FL-DT-3391",
        debris_class="vegetative",
        certified_cubic_yards="30",
        rate_per_cy="8",
        est_fill_pct="60.00",
        est_cubic_yards="18.00",
        est_dollar_value="144.00",
        sam_model="sam-3.1",
        spark_model="muse-spark-1.3",
    )
    r1 = compute_receipt(inputs1)
    r2 = compute_receipt(inputs2)
    assert r1.receipt_hash == r2.receipt_hash
    assert len(r1.receipt_hash) == 64
