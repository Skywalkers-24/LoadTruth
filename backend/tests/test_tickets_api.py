"""API tests for the ticket/event/dashboard routes against a seeded SQLite DB.

These exercise the full request path through the real SQLAlchemy repository
(isolated in-memory SQLite per test, see conftest.py): listing, fetching,
recording a monitor call (which must recompute + persist the §7a delta), the
confirm/override review action, and the dashboard money-frame roll-up.
"""

from typing import Any

from fastapi.testclient import TestClient

from app.tickets.seed import DEMO_EVENT_ID


def _all_tickets(client: TestClient) -> list[dict[str, Any]]:
    """Every seeded ticket for the demo event (one page big enough for all)."""
    body = client.get("/tickets", params={"limit": 100, "event_id": str(DEMO_EVENT_ID)}).json()
    return list(body["items"])


def _draft_without_call_id(client: TestClient) -> str:
    """The seeded draft that has no monitor call yet (the low-confidence placard)."""
    tickets = _all_tickets(client)
    draft = next(
        t for t in tickets if t["status"] == "draft" and t["valuation"]["monitor_fill_pct"] is None
    )
    return str(draft["id"])


def test_list_events(client: TestClient) -> None:
    events = client.get("/events").json()
    assert len(events) == 3  # Hurricane, Camp Fire, Winter Storm Uri
    ids = {e["id"] for e in events}
    assert str(DEMO_EVENT_ID) in ids
    demo = next(e for e in events if e["id"] == str(DEMO_EVENT_ID))
    assert demo["rate_table"]["construction_demolition"] == 12.0


def test_list_tickets_returns_seed(client: TestClient) -> None:
    body = client.get("/tickets", params={"limit": 100, "event_id": str(DEMO_EVENT_ID)}).json()
    assert body["total"] == 34
    assert len(body["items"]) == 34
    # Every ticket carries a valuation with an estimate.
    assert all("valuation" in t and t["valuation"]["est_dollar_value"] for t in body["items"])


def test_money_frame_overbill_ticket_present(client: TestClient) -> None:
    tickets = _all_tickets(client)
    overbills = [t for t in tickets if t["valuation"]["is_overbill"]]
    assert overbills, "seed must include at least one over-called (money-frame) ticket"
    # The headline demo ticket: 20 CY, 80% vs 62%, $12/CY -> $43.20 delta.
    hero = next(
        t
        for t in tickets
        if t["truck_id"] == "FL-DT-3391" and t["valuation"]["delta_dollar_value"] == "43.20"
    )
    assert hero["valuation"]["delta_dollar_value"] == "43.20"
    assert hero["valuation"]["is_overbill"] is True


def test_get_ticket_404_for_unknown(client: TestClient) -> None:
    resp = client.get("/tickets/00000000-0000-0000-0000-000000000009")
    assert resp.status_code == 404


def test_set_monitor_call_recomputes_delta(client: TestClient) -> None:
    ticket_id = _draft_without_call_id(client)
    before = client.get(f"/tickets/{ticket_id}").json()
    assert before["valuation"]["delta_dollar_value"] is None  # draft, no call yet

    resp = client.patch(f"/tickets/{ticket_id}/monitor-call", json={"monitor_fill_pct": "90"})
    assert resp.status_code == 200
    after = resp.json()
    assert after["valuation"]["monitor_fill_pct"] == "90.00"
    assert after["valuation"]["delta_dollar_value"] is not None
    # 18 CY certified, est 55%, monitor 90% -> delta is positive (overbill).
    assert after["valuation"]["is_overbill"] is True

    # Persisted: a fresh GET reflects the recomputed delta.
    reread = client.get(f"/tickets/{ticket_id}").json()
    assert reread["valuation"]["delta_dollar_value"] == after["valuation"]["delta_dollar_value"]


def test_confirm_sets_status_and_confirmed_fill(client: TestClient) -> None:
    ticket_id = _draft_without_call_id(client)
    client.patch(f"/tickets/{ticket_id}/monitor-call", json={"monitor_fill_pct": "60"})
    resp = client.patch(f"/tickets/{ticket_id}/status", json={"status": "confirmed"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "confirmed"
    assert body["confirmed_fill_pct"] == "60.00"


def test_cannot_set_back_to_draft(client: TestClient) -> None:
    ticket_id = _draft_without_call_id(client)
    resp = client.patch(f"/tickets/{ticket_id}/status", json={"status": "draft"})
    assert resp.status_code == 400


def test_monitor_call_rejects_out_of_range(client: TestClient) -> None:
    ticket_id = _draft_without_call_id(client)
    resp = client.patch(f"/tickets/{ticket_id}/monitor-call", json={"monitor_fill_pct": "150"})
    assert resp.status_code == 422


def test_dashboard_rollup(client: TestClient) -> None:
    resp = client.get(f"/events/{DEMO_EVENT_ID}/dashboard")
    assert resp.status_code == 200
    d = resp.json()
    assert d["ticket_count"] == 34
    assert d["reviewed_count"] == 14  # seeded confirmed + overridden tickets
    assert d["overbill_ticket_count"] >= 1
    assert float(d["total_delta_dollar_value"]) > 0  # money flagged for review
    assert d["accuracy_within_10pct"] == 0.9


def test_list_tickets_default_envelope(client: TestClient) -> None:
    body = client.get("/tickets", params={"event_id": str(DEMO_EVENT_ID)}).json()
    assert set(body) == {"items", "total", "limit", "offset"}
    assert body["total"] == 34
    assert body["limit"] == 20  # default
    assert body["offset"] == 0
    assert len(body["items"]) == 20  # one default page


def test_list_tickets_newest_first(client: TestClient) -> None:
    items = client.get("/tickets", params={"limit": 100}).json()["items"]
    created = [t["created_at"] for t in items]
    assert created == sorted(created, reverse=True)


def test_list_tickets_limit_caps_page_not_total(client: TestClient) -> None:
    body = client.get("/tickets", params={"limit": 2, "event_id": str(DEMO_EVENT_ID)}).json()
    assert len(body["items"]) == 2
    assert body["total"] == 34  # total reflects the full match, not the page
    assert body["limit"] == 2


def test_list_tickets_offset_paginates(client: TestClient) -> None:
    ev = {"event_id": str(DEMO_EVENT_ID)}
    all_items = client.get("/tickets", params={"limit": 100, **ev}).json()["items"]
    page1 = client.get("/tickets", params={"limit": 2, "offset": 0, **ev}).json()
    page2 = client.get("/tickets", params={"limit": 2, "offset": 2, **ev}).json()
    assert [t["id"] for t in page1["items"]] == [t["id"] for t in all_items[0:2]]
    assert [t["id"] for t in page2["items"]] == [t["id"] for t in all_items[2:4]]
    assert page1["total"] == page2["total"] == 34


def test_list_tickets_offset_past_end_is_empty(client: TestClient) -> None:
    body = client.get("/tickets", params={"offset": 100, "event_id": str(DEMO_EVENT_ID)}).json()
    assert body["items"] == []
    assert body["total"] == 34


def test_list_tickets_limit_out_of_range_rejected(client: TestClient) -> None:
    assert client.get("/tickets", params={"limit": 0}).status_code == 422
    assert client.get("/tickets", params={"limit": 101}).status_code == 422
    assert client.get("/tickets", params={"offset": -1}).status_code == 422


def test_list_tickets_filter_by_status(client: TestClient) -> None:
    body = client.get(
        "/tickets", params={"status": "confirmed", "limit": 100, "event_id": str(DEMO_EVENT_ID)}
    ).json()
    assert body["total"] == 11  # seeded confirmed tickets in the demo event
    assert len(body["items"]) == 11
    assert all(t["status"] == "confirmed" for t in body["items"])


def test_list_tickets_filter_by_debris_class(client: TestClient) -> None:
    body = client.get(
        "/tickets",
        params={"debris_class": "vegetative", "limit": 100, "event_id": str(DEMO_EVENT_ID)},
    ).json()
    assert body["total"] == 13  # seeded vegetative tickets in the demo event
    assert all(t["debris_class"] == "vegetative" for t in body["items"])


def test_list_tickets_filters_combine(client: TestClient) -> None:
    body = client.get(
        "/tickets",
        params={"status": "confirmed", "debris_class": "vegetative", "limit": 100},
    ).json()
    # Cross-check against the full list rather than a hard-coded count.
    all_items = client.get("/tickets", params={"limit": 100}).json()["items"]
    expected = [
        t for t in all_items if t["status"] == "confirmed" and t["debris_class"] == "vegetative"
    ]
    assert body["total"] == len(expected)
    assert body["total"] >= 1
    assert all(
        t["status"] == "confirmed" and t["debris_class"] == "vegetative" for t in body["items"]
    )


def test_list_tickets_bad_filter_value_rejected(client: TestClient) -> None:
    assert client.get("/tickets", params={"status": "nope"}).status_code == 422
    assert client.get("/tickets", params={"debris_class": "nope"}).status_code == 422


def test_reports_summary(client: TestClient) -> None:
    resp = client.get(f"/events/{DEMO_EVENT_ID}/reports/summary")
    assert resp.status_code == 200
    s = resp.json()
    assert s["event_id"] == str(DEMO_EVENT_ID)
    assert s["ticket_count"] == 34

    # Counts partition the tickets fully.
    assert sum(s["counts_by_status"].values()) == 34
    assert sum(s["counts_by_debris_class"].values()) == 34
    assert s["counts_by_status"]["confirmed"] == 11
    assert s["counts_by_debris_class"]["vegetative"] == 13

    # Review progress is the complement of pending.
    assert s["reviewed_count"] == 14
    assert s["pending_count"] == 20

    # Money signals.
    assert float(s["total_est_dollar_value"]) > 0
    assert float(s["total_delta_dollar_value"]) > 0
    assert s["overbill_ticket_count"] >= 1
    assert float(s["overbill_dollar_value"]) > 0

    # Anomalies by severity (seeded flags: 4 high, 3 warn, 2 info).
    assert s["anomaly_counts_by_severity"]["high"] == 4
    assert s["anomaly_counts_by_severity"]["warn"] == 3

    assert s["accuracy_within_10pct"] == 0.9


def test_reports_summary_overbill_matches_dollar_sum(client: TestClient) -> None:
    s = client.get(f"/events/{DEMO_EVENT_ID}/reports/summary").json()
    tickets = _all_tickets(client)
    overbills = [t for t in tickets if t["valuation"]["is_overbill"]]
    expected = sum(float(t["valuation"]["delta_dollar_value"]) for t in overbills)
    assert s["overbill_ticket_count"] == len(overbills)
    assert float(s["overbill_dollar_value"]) == expected
