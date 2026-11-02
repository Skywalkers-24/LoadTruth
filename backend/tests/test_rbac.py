"""RBAC enforcement tests: lower roles are denied higher-privilege actions.

These re-bind the signed-in role via the `as_role` fixture and assert the API
returns 403 where the role lacks the capability, and 2xx where it has it.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from app.tickets.seed import DEMO_EVENT_ID


def _a_draft_id(client: TestClient) -> str:
    body = client.get("/tickets", params={"limit": 100, "event_id": str(DEMO_EVENT_ID)}).json()
    return str(next(t["id"] for t in body["items"] if t["status"] == "draft"))


def test_requires_authentication() -> None:
    """With no signed-in member, protected routes return 401."""
    from app.api.deps import current_member
    from app.main import app

    # Remove the default authenticated override for this check.
    saved = app.dependency_overrides.pop(current_member, None)
    try:
        with TestClient(app) as raw:
            assert raw.get("/trucks").status_code == 401
            assert raw.get("/events").status_code == 401
    finally:
        if saved is not None:
            app.dependency_overrides[current_member] = saved


def test_monitor_cannot_manage_trucks(as_role: Callable[[str], None], client: TestClient) -> None:
    as_role("monitor")
    resp = client.post("/trucks", json={"truck_number": "NEW-1", "certified_cubic_yards": 20})
    assert resp.status_code == 403


def test_supervisor_can_manage_trucks(as_role: Callable[[str], None], client: TestClient) -> None:
    as_role("supervisor")
    resp = client.post("/trucks", json={"truck_number": "NEW-SUP-1", "certified_cubic_yards": 20})
    assert resp.status_code == 201


def test_auditor_is_read_only(as_role: Callable[[str], None], client: TestClient) -> None:
    as_role("auditor")
    # Can read
    assert client.get("/events").status_code == 200
    # Cannot review tickets or manage trucks
    tid = _a_draft_id(client)
    assert client.patch(f"/tickets/{tid}/status", json={"status": "confirmed"}).status_code == 403
    truck_resp = client.post("/trucks", json={"truck_number": "AUD-1", "certified_cubic_yards": 10})
    assert truck_resp.status_code == 403


def test_monitor_can_review_but_not_manage_events(
    as_role: Callable[[str], None], client: TestClient
) -> None:
    as_role("monitor")
    tid = _a_draft_id(client)
    assert (
        client.patch(f"/tickets/{tid}/monitor-call", json={"monitor_fill_pct": "60"}).status_code
        == 200
    )
    assert client.patch(f"/tickets/{tid}/status", json={"status": "confirmed"}).status_code == 200
    # But not events
    assert client.post("/events", json={"name": "X"}).status_code == 403


def test_supervisor_cannot_manage_users(as_role: Callable[[str], None], client: TestClient) -> None:
    as_role("supervisor")
    assert client.get("/users").status_code == 403
    assert (
        client.post(
            "/users", json={"email": "n@x.io", "role": "monitor", "status": "active"}
        ).status_code
        == 403
    )


def test_county_admin_cannot_create_super_admin(
    as_role: Callable[[str], None], client: TestClient
) -> None:
    as_role("county_admin")
    # Can create a role at or below their own
    ok = client.post("/users", json={"email": "sup@x.io", "role": "supervisor", "status": "active"})
    assert ok.status_code == 201
    # Cannot create a role above their own
    denied = client.post(
        "/users", json={"email": "root2@x.io", "role": "super_admin", "status": "active"}
    )
    assert denied.status_code == 403


def test_admin_cannot_delete_higher_role(
    as_role: Callable[[str], None], client: TestClient
) -> None:
    # super_admin (default) lists users to find the seeded super_admin row
    as_role("super_admin")
    users: list[dict[str, Any]] = client.get("/users").json()
    super_admin = next(u for u in users if u["role"] == "super_admin")
    # A county_admin may not delete the super_admin
    as_role("county_admin")
    assert client.delete(f"/users/{super_admin['id']}").status_code == 403
