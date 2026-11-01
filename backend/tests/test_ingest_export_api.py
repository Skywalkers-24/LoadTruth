"""API tests for ingest (pipeline → ticket) and report export, on seeded SQLite.

MOCK_AI is on, so the pipeline resolves from fixtures; an unknown upload hash
falls back to the default clean scenario and still drafts a ticket.
"""

from fastapi.testclient import TestClient

from app.tickets.seed import DEMO_EVENT_ID


def test_ingest_persists_confirmed_ticket(client: TestClient) -> None:
    before = client.get("/tickets").json()["total"]
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("haul.mp4", b"sample-bytes", "video/mp4")},
    )
    assert resp.status_code == 201
    ticket = resp.json()
    assert ticket["status"] == "confirmed"
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
    assert "Agreement with monitor" in resp.text


# ── Mock scenario steering via filename prefix (positive + negative paths) ──


def test_ingest_scenario_no_truck_returns_422(client: TestClient) -> None:
    """A `no-truck__` upload forces the empty-footage fixture → 422, no ticket."""
    before = client.get("/tickets").json()["total"]
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("no-truck__clip.mp4", b"anything", "video/mp4")},
    )
    assert resp.status_code == 422
    assert "no truck" in resp.json()["detail"].lower()
    # Nothing persisted.
    assert client.get("/tickets").json()["total"] == before


def test_ingest_scenario_uncertified_flags_anomaly(client: TestClient) -> None:
    """An `uncertified-truck__` upload drafts a ticket carrying an anomaly flag."""
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("uncertified-truck__clip.mp4", b"anything", "video/mp4")},
    )
    assert resp.status_code == 201
    assert resp.json()["anomaly_count"] >= 1


def test_ingest_scenario_clean_positive(client: TestClient) -> None:
    """A `clean-full-cd__` upload drafts a clean, identified, valued ticket."""
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("clean-full-cd__clip.mp4", b"anything", "video/mp4")},
    )
    assert resp.status_code == 201
    ticket = resp.json()
    assert ticket["truck_id"] == "FL-DT-3391"
    assert float(ticket["valuation"]["est_dollar_value"]) > 0


def test_ingest_unknown_upload_still_confirms(client: TestClient) -> None:
    """An ordinary upload (no scenario prefix) always drafts a believable ticket."""
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("random-haul.mp4", b"some-unique-bytes-xyz", "video/mp4")},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "confirmed"
