"""API tests for ingest (pipeline → ticket) and report export, on seeded SQLite.

MOCK_AI is on, so the pipeline resolves from fixtures; an unknown upload hash
falls back to the default clean scenario and still drafts a ticket.
"""

from fastapi.testclient import TestClient

from app.tickets.seed import DEMO_EVENT_ID


def test_ingest_drafts_and_persists_ticket(client: TestClient) -> None:
    before = client.get("/tickets").json()["total"]
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("haul.mp4", b"sample-bytes", "video/mp4")},
    )
    assert resp.status_code == 201
    ticket = resp.json()
    assert ticket["status"] == "draft"
    assert ticket["valuation"]["est_dollar_value"]
    # Persisted: the ticket list grew by one.
    assert client.get("/tickets").json()["total"] == before + 1


def test_ingest_rejects_empty_upload(client: TestClient) -> None:
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("haul.mp4", b"", "video/mp4")},
    )
    assert resp.status_code == 400


def test_ingest_unknown_event_404(client: TestClient) -> None:
    resp = client.post(
        "/events/99999999-9999-9999-9999-999999999999/ingest",
        files={"file": ("haul.mp4", b"bytes", "video/mp4")},
    )
    assert resp.status_code == 404


def test_export_csv(client: TestClient) -> None:
    resp = client.get(f"/events/{DEMO_EVENT_ID}/export.csv")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    body = resp.text
    assert "ticket_id" in body and "delta_dollar_value" in body
    assert "FL-DT-3391" in body  # the money-frame truck


def test_export_audit_packet_html(client: TestClient) -> None:
    resp = client.get(f"/events/{DEMO_EVENT_ID}/audit-packet.html")
    assert resp.status_code == 200
    assert "Disputed volume flagged" in resp.text
    assert "Accuracy statement" in resp.text
