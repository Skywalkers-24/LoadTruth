"""API tests for the billing / invoicing routes, on the seeded SQLite DB."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.tickets.seed import DEMO_EVENT_ID


def test_event_billing_summary(client: TestClient) -> None:
    resp = client.get(f"/events/{DEMO_EVENT_ID}/billing")
    assert resp.status_code == 200
    body = resp.json()
    assert body["event_id"] == str(DEMO_EVENT_ID)
    assert body["ticket_count"] > 0
    # total = settled + pending, to the cent.
    total = float(body["total_amount"])
    assert total > 0
    assert round(float(body["settled_amount"]) + float(body["pending_amount"]), 2) == round(
        total, 2
    )
    # Line items present and summing to the total.
    assert body["lines"]
    line_sum = round(sum(float(line["amount"]) for line in body["lines"]), 2)
    assert line_sum == round(total, 2)
    assert "history" in body


def test_event_billing_unknown_event_404(client: TestClient) -> None:
    resp = client.get("/events/99999999-9999-9999-9999-999999999999/billing")
    assert resp.status_code == 404


def test_combined_billing_summary(client: TestClient) -> None:
    resp = client.get("/billing")
    assert resp.status_code == 200
    body = resp.json()
    assert body["scope"] == "All events"
    assert body["event_id"] is None
    assert body["ticket_count"] > 0


def test_event_invoice_html(client: TestClient) -> None:
    resp = client.get(f"/events/{DEMO_EVENT_ID}/invoice.html")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    text = resp.text
    assert "Amount due" in text
    assert "Line items" in text
    assert "Bill to" in text
    # No AI-generated em dashes in the invoice chrome (ui-copy rule).
    assert "\u2014" not in text


def test_combined_invoice_html(client: TestClient) -> None:
    resp = client.get("/billing/invoice.html")
    assert resp.status_code == 200
    assert "All events" in resp.text


def test_settled_amount_tracks_monitor_confirm(client: TestClient) -> None:
    """Confirming a ticket moves its amount from pending into settled."""
    before = client.get(f"/events/{DEMO_EVENT_ID}/billing").json()
    # Pick a draft ticket in the event.
    tickets = client.get(f"/tickets?event_id={DEMO_EVENT_ID}&status=draft&limit=1").json()["items"]
    assert tickets, "seed should include at least one draft"
    tid = tickets[0]["id"]
    # Record a monitor call, then confirm.
    client.patch(f"/tickets/{tid}/monitor-call", json={"monitor_fill_pct": "75"})
    client.patch(f"/tickets/{tid}/status", json={"status": "confirmed"})
    after = client.get(f"/events/{DEMO_EVENT_ID}/billing").json()
    assert after["billed_count"] == before["billed_count"] + 1
    assert float(after["settled_amount"]) > float(before["settled_amount"])
