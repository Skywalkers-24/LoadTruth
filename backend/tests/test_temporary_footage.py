"""Temporary playback expires independently of permanently saved ticket results."""

from uuid import UUID
import pytest
from app.api import ingest_jobs
from app.pipeline import b2_store, evidence_store
from app.tickets.seed import DEMO_EVENT_ID, PLAYGROUND_EVENT_ID, ADMIN_DEMO_EVENT_ID


def fail_storage(*args, **kwargs):
    raise AssertionError("Temporary upload must not touch Backblaze")


def test_temporary_upload_keeps_ticket_after_footage_expires(client, sessionmaker, monkeypatch):
    monkeypatch.setattr(ingest_jobs, "get_sessionmaker", lambda: sessionmaker)
    monkeypatch.setattr(ingest_jobs, "_worker", None)
    monkeypatch.setattr(b2_store, "put", fail_storage)
    monkeypatch.setattr(b2_store, "head_key", fail_storage)
    monkeypatch.setattr(b2_store, "download_to", fail_storage)
    # Decoder is exercised elsewhere; fixtures require no real model or media.
    from app.api import ingest

    monkeypatch.setattr(ingest, "sample_frames", lambda *a, **kw: [])
    response = client.post(
        f"/events/{DEMO_EVENT_ID}/temporary-ingest?bypass_cache=true",
        files={"file": ("haul.mp4", b"temporary truck", "video/mp4")},
    )
    assert response.status_code == 202, response.text

    async def wait():
        import asyncio

        await asyncio.wait_for(ingest_jobs._worker, 3)

    client.portal.call(wait)
    job = client.get(f"/events/{DEMO_EVENT_ID}/ingest-jobs").json()
    assert job["status"] == "completed", job
    ticket_id = job["ticket"]["id"]
    before = client.get(f"/tickets/{ticket_id}").json()
    evidence = client.get(f"/tickets/{ticket_id}/evidence").json()
    assert evidence["has_media"] and evidence["media_storage"] == "memory"
    assert client.get(f"/tickets/{ticket_id}/evidence/media").content == b"temporary truck"
    assert client.get(f"/tickets/{ticket_id}/evidence/url").json()["storage"] == "memory"
    evidence_store._memory.clear()  # Restart/eviction: permanent DB rows survive.
    expired = client.get(f"/tickets/{ticket_id}/evidence").json()
    assert expired["footage_expired"] is True and expired["has_media"] is False
    assert client.get(f"/tickets/{ticket_id}/evidence/media").status_code == 410
    assert client.get(f"/tickets/{ticket_id}").json() == before
    assert client.get(f"/tickets/{ticket_id}/pipeline").json()


def test_memory_store_expiry_and_budget(monkeypatch):
    evidence_store._memory.clear()
    monkeypatch.setattr(evidence_store, "MEMORY_MAX_BYTES", 8)
    clock = [1.0]
    monkeypatch.setattr(evidence_store.time, "monotonic", lambda: clock[0])
    evidence_store.remember("a", b"12345", "video/mp4")
    evidence_store.remember("b", b"67890", "video/mp4")
    assert evidence_store.memory_entry("a") is None
    assert evidence_store.memory_entry("b")
    clock[0] += 6 * 24 * 60 * 60
    assert evidence_store.memory_entry("b") is not None
    clock[0] += 24 * 60 * 60 + 1
    assert evidence_store.memory_entry("b") is None


@pytest.mark.parametrize(
    "role", ["monitor", "auditor", "supervisor", "county_admin", "super_admin"]
)
def test_practice_uses_saved_results_and_source_stays_readonly(client, as_role, role, monkeypatch):
    from app.api import ingest

    monkeypatch.setattr(ingest, "get_ai_client", fail_storage)
    as_role(role)
    sources = client.get("/practice-sources").json()
    assert sources
    original = sources[0]
    response = client.post(
        f"/events/{PLAYGROUND_EVENT_ID}/practice-tickets", json={"source_ticket_id": original["id"]}
    )
    assert response.status_code == 201, response.text
    practice = response.json()
    assert practice["id"] != original["id"]
    assert practice["status"] == "draft"
    assert (
        client.patch(
            f"/tickets/{practice['id']}/monitor-call", json={"monitor_fill_pct": 40}
        ).status_code
        == 200
    )
    assert (
        client.patch(f"/tickets/{practice['id']}/status", json={"status": "confirmed"}).status_code
        == 200
    )
    reset = client.patch(f"/tickets/{practice['id']}/status", json={"status": "draft"})
    assert reset.status_code == 200, reset.text
    assert reset.json()["valuation"]["monitor_fill_pct"] is None
    assert (
        client.patch(
            f"/tickets/{original['id']}/monitor-call", json={"monitor_fill_pct": 40}
        ).status_code
        == 409
    )
    assert client.get(f"/tickets/{original['id']}").json()["valuation"] == original["valuation"]


def test_practice_in_writable_event(client, as_role):
    from app.tickets.seed import DEMO_EVENT_ID

    as_role("supervisor")
    sources = client.get("/practice-sources").json()
    assert sources
    original = sources[0]
    res = client.post(
        f"/events/{DEMO_EVENT_ID}/practice-tickets", json={"source_ticket_id": original["id"]}
    )
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["event_id"] == str(DEMO_EVENT_ID)
    assert created["truck_id"] == original["truck_id"]
    # Can delete the created ticket
    del_res = client.delete(f"/tickets/{created['id']}")
    assert del_res.status_code == 204



@pytest.mark.parametrize("role", ["monitor", "auditor", "supervisor", "county_admin"])
def test_live_demo_is_visible_but_admin_only(client, as_role, role):
    from app.db.models import Ticket

    # Obtain an existing ticket then attach it to the live event in fixture DB.
    ticket_id = client.get(f"/tickets?event_id={DEMO_EVENT_ID}").json()["items"][0]["id"]
    from app.main import app
    from app.api.repo import get_repository

    async def move():
        async for repo in app.dependency_overrides[get_repository]():
            row = await repo.session.get(Ticket, UUID(ticket_id))
            row.event_id = ADMIN_DEMO_EVENT_ID

    client.portal.call(move)
    as_role(role)
    assert any(e["id"] == str(ADMIN_DEMO_EVENT_ID) for e in client.get("/events").json())
    assert client.get(f"/tickets/{ticket_id}").status_code == 200
    assert (
        client.patch(
            f"/tickets/{ticket_id}/monitor-call", json={"monitor_fill_pct": 40}
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/events/{ADMIN_DEMO_EVENT_ID}/temporary-ingest",
            files={"file": ("haul.mp4", b"clip", "video/mp4")},
        ).status_code
        == 403
    )


def test_lost_temporary_upload_fails_clearly_without_creating_a_ticket(
    client, sessionmaker, monkeypatch
):
    monkeypatch.setattr(ingest_jobs, "get_sessionmaker", lambda: sessionmaker)
    monkeypatch.setattr(ingest_jobs, "_worker", None)
    start = ingest_jobs.ensure_worker
    monkeypatch.setattr(ingest_jobs, "ensure_worker", lambda: None)
    response = client.post(
        f"/events/{DEMO_EVENT_ID}/temporary-ingest",
        files={"file": ("haul.mp4", b"temporary", "video/mp4")},
    )
    assert response.status_code == 202
    evidence_store._memory.clear()
    monkeypatch.setattr(ingest_jobs, "ensure_worker", start)
    client.portal.call(ingest_jobs.recover_ingest_jobs)

    async def wait():
        import asyncio

        await asyncio.wait_for(ingest_jobs._worker, 3)

    client.portal.call(wait)
    job = client.get(f"/events/{DEMO_EVENT_ID}/ingest-jobs").json()
    assert job["status"] == "failed" and job["ticket"] is None
    assert "Temporary upload expired" in job["detail"]


def test_readonly_source_crud_is_blocked_even_for_administrator(client):
    source = client.get(f"/events/{DEMO_EVENT_ID}/sources").json()[0]
    assert client.patch(f"/events/{DEMO_EVENT_ID}", json={"tags": ["read-only"]}).status_code == 200
    assert client.patch(f"/sources/{source['id']}", json={"name": "changed"}).status_code == 409
    assert client.delete(f"/sources/{source['id']}").status_code == 409
    assert (
        client.post(
            f"/events/{DEMO_EVENT_ID}/sources", json={"kind": "upload", "name": "new", "config": {}}
        ).status_code
        == 409
    )
