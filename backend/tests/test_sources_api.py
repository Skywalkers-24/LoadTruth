"""API + repository tests for source connections and event management.

Covers: list seeded sources, create/patch/delete, the config-validation test
route (upload ok, rtsp ok/missing-url), 404s, event create/patch, and
tenant-scoping at the repository layer (another tenant can't see our source).
"""

from __future__ import annotations

from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.tickets.repository import SourceNotFoundError, SqlTicketRepository
from app.tickets.seed import DEMO_EVENT_ID, DEMO_TENANT_ID

_OTHER_TENANT = UUID("99999999-9999-9999-9999-999999999999")
_MISSING = "00000000-0000-0000-0000-0000000000aa"


# ── Source CRUD ──────────────────────────────────────────────────────────────
def test_list_sources_returns_seed(client: TestClient) -> None:
    sources = client.get(f"/events/{DEMO_EVENT_ID}/sources").json()
    kinds = {s["kind"] for s in sources}
    assert "upload" in kinds
    assert "rtsp" in kinds
    assert len(sources) == 5


def test_create_source(client: TestClient) -> None:
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/sources",
        json={
            "kind": "hls",
            "name": "Yard HLS",
            "config": {"url": "https://cdn.demo/stream.m3u8"},
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "hls"
    assert body["status"] == "active"  # default
    assert len(client.get(f"/events/{DEMO_EVENT_ID}/sources").json()) == 6


def test_create_source_unknown_event_404(client: TestClient) -> None:
    resp = client.post(
        f"/events/{_MISSING}/sources",
        json={"kind": "upload", "name": "x"},
    )
    assert resp.status_code == 404


def test_create_source_bad_kind_422(client: TestClient) -> None:
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/sources",
        json={"kind": "nope", "name": "x"},
    )
    assert resp.status_code == 422


def test_patch_source(client: TestClient) -> None:
    created = client.post(
        f"/events/{DEMO_EVENT_ID}/sources",
        json={"kind": "rtsp", "name": "Cam", "config": {"url": "rtsp://a/b"}},
    ).json()
    resp = client.patch(
        f"/sources/{created['id']}",
        json={"status": "paused", "name": "Cam (paused)"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "paused"
    assert body["name"] == "Cam (paused)"
    assert body["config"] == {"url": "rtsp://a/b"}  # unchanged


def test_patch_source_404(client: TestClient) -> None:
    resp = client.patch(f"/sources/{_MISSING}", json={"status": "paused"})
    assert resp.status_code == 404


def test_delete_source(client: TestClient) -> None:
    created = client.post(
        f"/events/{DEMO_EVENT_ID}/sources",
        json={"kind": "upload", "name": "temp"},
    ).json()
    assert client.delete(f"/sources/{created['id']}").status_code == 204
    assert len(client.get(f"/events/{DEMO_EVENT_ID}/sources").json()) == 5


def test_delete_source_404(client: TestClient) -> None:
    assert client.delete(f"/sources/{_MISSING}").status_code == 404


# ── Source test (config validation, no network I/O) ──────────────────────────
def test_test_upload_source_ok(client: TestClient) -> None:
    sources = client.get(f"/events/{DEMO_EVENT_ID}/sources").json()
    upload = next(s for s in sources if s["kind"] == "upload")
    resp = client.post(f"/sources/{upload['id']}/test")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_test_rtsp_source_ok_with_url(client: TestClient) -> None:
    sources = client.get(f"/events/{DEMO_EVENT_ID}/sources").json()
    rtsp = next(s for s in sources if s["kind"] == "rtsp")
    resp = client.post(f"/sources/{rtsp['id']}/test")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True  # seed rtsp has a url


def test_test_source_missing_config_reports_not_ok(client: TestClient) -> None:
    created = client.post(
        f"/events/{DEMO_EVENT_ID}/sources",
        json={"kind": "rtsp", "name": "No URL", "config": {}},
    ).json()
    resp = client.post(f"/sources/{created['id']}/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "url" in body["detail"]


def test_test_source_404(client: TestClient) -> None:
    assert client.post(f"/sources/{_MISSING}/test").status_code == 404


# ── Event management ─────────────────────────────────────────────────────────
def test_create_event(client: TestClient) -> None:
    resp = client.post(
        "/events",
        json={
            "name": "Tornado 2027 — Travis County",
            "location": "Travis County, TX",
            "rate_table": {"vegetative": 9.0},
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Tornado 2027 — Travis County"
    assert body["status"] == "active"
    assert len(client.get("/events").json()) == 2


def test_patch_event_partial(client: TestClient) -> None:
    created = client.post("/events", json={"name": "Temp Event"}).json()
    resp = client.patch(f"/events/{created['id']}", json={"status": "closed"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "closed"
    assert body["name"] == "Temp Event"  # unchanged


def test_patch_event_404(client: TestClient) -> None:
    resp = client.patch(f"/events/{_MISSING}", json={"status": "closed"})
    assert resp.status_code == 404


def test_create_event_requires_name(client: TestClient) -> None:
    assert client.post("/events", json={"location": "x"}).status_code == 422


# ── Tenant scoping (repository layer) ────────────────────────────────────────
@pytest.mark.asyncio
async def test_sources_are_tenant_scoped(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> None:
    async with sessionmaker() as session:
        repo = SqlTicketRepository(session)
        # The demo tenant sees its seeded sources; another tenant sees none.
        ours = await repo.list_sources(DEMO_TENANT_ID, DEMO_EVENT_ID)
        theirs = await repo.list_sources(_OTHER_TENANT, DEMO_EVENT_ID)
        assert len(ours) == 5
        assert theirs == []
        # And another tenant cannot fetch our source by id.
        with pytest.raises(SourceNotFoundError):
            await repo.source_row(_OTHER_TENANT, ours[0].id)


@pytest.mark.asyncio
async def test_trucks_are_tenant_scoped(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> None:
    async with sessionmaker() as session:
        repo = SqlTicketRepository(session)
        ours = await repo.list_trucks(DEMO_TENANT_ID)
        theirs = await repo.list_trucks(_OTHER_TENANT)
        assert len(ours) == 14
        assert theirs == []
