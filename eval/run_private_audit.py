"""Private and offline audit execution using Meta Muse Spark Open via Baseten partner inference."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.ai.providers import endpoint
from app.config import get_settings
from app.pipeline.receipt import ReceiptInputs, compute_receipt
from app.tickets.money import value_ticket


def run_private_audit(
    truck_id: str = "FL-DT-104",
    certified_cy: float = 30.0,
    measured_fill_pct: float = 64.2,
    monitor_call_fill_pct: float = 80.0,
    rate_per_cy: float = 12.0,
    provider: str = "baseten",
) -> dict[str, object]:
    """Execute private audit using open weights inference route (meta-models/muse-spark-open-1026)."""
    settings = get_settings()
    baseten_ep = endpoint("baseten")

    print("=" * 60)
    print("LoadTruth Private Audit Execution (Open Weights Mode)")
    print("=" * 60)
    print(f"Target Open-Weight Model  : {baseten_ep.model}")
    print(f"Inference Endpoint Provider: {baseten_ep.provider.capitalize()} ({baseten_ep.base_url})")
    print(f"Truck Reference Plated ID  : {truck_id}")
    print(f"Certified Truck Capacity   : {certified_cy} CY")
    print(f"Measured Fill (SAM/Muse)   : {measured_fill_pct}%")
    print(f"Tower Monitor Radio Call   : {monitor_call_fill_pct}%")

    # Compute deterministic money valuation
    valuation = value_ticket(
        certified_cubic_yards=certified_cy,
        rate_per_cy=rate_per_cy,
        est_fill_pct=measured_fill_pct,
        monitor_fill_pct=monitor_call_fill_pct,
    )

    # Generate immutable cryptographic receipt
    receipt = compute_receipt(
        ReceiptInputs(
            content_hash="f" * 64,
            sam_output_hash="e" * 64,
            bed_area=1250.0,
            load_area=802.5,
            load_height_ratio=0.642,
            body_type="dump",
            truck_id=truck_id,
            debris_class="vegetative",
            certified_cubic_yards=str(certified_cy),
            rate_per_cy=str(rate_per_cy),
            est_fill_pct=f"{measured_fill_pct:.2f}",
            est_cubic_yards=str(valuation.est_cubic_yards),
            est_dollar_value=str(valuation.est_dollar_value),
            sam_model="sam-3.1",
            spark_model=baseten_ep.model,
        )
    )

    print("-" * 60)
    print(f"Audited Machine Volume     : {valuation.est_cubic_yards} CY (${valuation.est_dollar_value})")
    print(f"Tower Monitor Claimed      : {valuation.monitor_cubic_yards} CY (${valuation.monitor_dollar_value})")
    print(f"Overbilled Net Discrepancy : +{valuation.delta_cubic_yards} CY (+${valuation.delta_dollar_value})")
    print(f"Cryptographic Receipt SHA  : {receipt.receipt_hash}")
    print("=" * 60)

    return {
        "status": "success",
        "provider": provider,
        "model": baseten_ep.model,
        "overbill_dollar_delta": float(valuation.delta_dollar_value or 0),
        "receipt_hash": receipt.receipt_hash,
    }


if __name__ == "__main__":
    run_private_audit()

