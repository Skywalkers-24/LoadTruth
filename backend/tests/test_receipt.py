"""Evidence receipt + Re-verify.

The receipt is a deterministic SHA-256 over every pinned input, and Re-verify
replays the geometry over the stored SAM masks to prove the fill % reproduces.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.pipeline.receipt import ReceiptInputs, compute_receipt, sam_output_hash
from app.tickets.seed import DEMO_EVENT_ID

CLIP = b"reverify-clip-bytes-0001"


def _inputs(**over: object) -> ReceiptInputs:
    base: dict[str, object] = {
        "content_hash": "c" * 64,
        "sam_output_hash": "d" * 64,
        "bed_area": 1000.0,
        "load_area": 600.0,
        "load_height_ratio": 0.5,
        "body_type": "dump",
        "truck_id": "FL-DT-3391",
        "debris_class": "vegetative",
        "certified_cubic_yards": "30",
        "rate_per_cy": "8",
        "est_fill_pct": "60.00",
        "est_cubic_yards": "18.00",
        "est_dollar_value": "144.00",
        "sam_model": "sam-3.1",
        "spark_model": "muse-spark-1.3",
    }
    base.update(over)
    return ReceiptInputs(**base)  # type: ignore[arg-type]


def test_receipt_is_deterministic() -> None:
    a = compute_receipt(_inputs())
    b = compute_receipt(_inputs())
    assert a.receipt_hash == b.receipt_hash
    assert len(a.receipt_hash) == 64


def test_receipt_changes_when_any_input_changes() -> None:
    base = compute_receipt(_inputs()).receipt_hash
    assert compute_receipt(_inputs(est_fill_pct="61.00")).receipt_hash != base
    assert compute_receipt(_inputs(truck_id="FL-DT-9999")).receipt_hash != base
    assert compute_receipt(_inputs(sam_model="sam-9.9")).receipt_hash != base
    assert (
        compute_receipt(
            _inputs(fill_source="muse_spark_frame_median", muse_frame_fill_pcts=[89.5, 90.5])
        ).receipt_hash
        != base
    )


def test_sam_output_hash_is_order_independent() -> None:
    one = sam_output_hash({"truck bed": "A", "debris pile": "B"})
    two = sam_output_hash({"debris pile": "B", "truck bed": "A"})
    assert one == two
    assert sam_output_hash({}) != one


def test_reverify_reproduces_fill_and_returns_a_receipt(client: TestClient) -> None:
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("haul.mp4", CLIP, "video/mp4")},
    )
    assert resp.status_code == 201
    ticket_id = resp.json()["id"]
    stored_fill = resp.json()["valuation"]["est_fill_pct"]

    rv = client.post(f"/tickets/{ticket_id}/reverify")
    assert rv.status_code == 200
    body = rv.json()
    assert body["reproducible"] is True
    assert body["recomputed_fill_pct"] == stored_fill
    assert len(body["receipt_hash"]) == 64
    assert body["receipt_inputs"]["content_hash"]

    # Re-verify is deterministic: the same ticket yields the same receipt.
    again = client.post(f"/tickets/{ticket_id}/reverify").json()
    assert again["receipt_hash"] == body["receipt_hash"]


def test_reverify_on_a_ticket_without_evidence_is_not_reproducible(client: TestClient) -> None:
    ticket_id = client.get("/tickets?limit=1").json()["items"][0]["id"]
    rv = client.post(f"/tickets/{ticket_id}/reverify")
    assert rv.status_code == 200
    body = rv.json()
    assert body["reproducible"] is False
    assert body["recomputed_fill_pct"] is None


def test_reverify_unknown_ticket_is_404(client: TestClient) -> None:
    rv = client.post("/tickets/00000000-0000-0000-0000-000000000000/reverify")
    assert rv.status_code == 404
