"""B2 library uploads and durable jobs survive browser state loss and restarts."""

from __future__ import annotations

import asyncio
from urllib.parse import unquote, urlsplit
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import ingest_jobs
from app.db.models import AnalysisJob
from app.pipeline import b2_store
from app.tickets.seed import DEMO_EVENT_ID


@pytest.fixture(autouse=True)
def worker_db(
    monkeypatch: pytest.MonkeyPatch, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    monkeypatch.setattr(ingest_jobs, "get_sessionmaker", lambda: sessionmaker)
    monkeypatch.setattr(ingest_jobs, "_worker", None)


def upload(client: TestClient, objects, *, complete: bool = True) -> dict:  # type: ignore[no-untyped-def,type-arg]
    response = client.post(
        "/demo-videos/uploads",
        json={
            "title": "Demo truck",
            "filename": "haul.mp4",
            "mime": "video/mp4",
            "size_bytes": 12,
            "reference_fill_pct": 50,
            "notes": "Measured fill",
        },
    )
    assert response.status_code == 201
    body = response.json()
    key = unquote(urlsplit(body["upload_url"]).path.lstrip("/"))
    objects[key] = (
        b"sample-bytes",
        {"ContentLength": 12, "ContentType": "video/mp4", "VersionId": "version-1"},
    )
    if complete:
        response = client.post(f"/demo-videos/{body['video']['id']}/complete")
        assert response.status_code == 200
        assert response.json()["status"] == "ready"
    return body["video"]  # type: ignore[no-any-return]


def wait_for_job(client: TestClient) -> dict:  # type: ignore[type-arg]
    async def wait() -> None:
        task = ingest_jobs._worker
        if task is not None:
            await asyncio.wait_for(asyncio.shield(task), timeout=3)

    assert client.portal is not None
    client.portal.call(wait)
    response = client.get(f"/events/{DEMO_EVENT_ID}/ingest-jobs")
    assert response.status_code == 200
    return response.json()  # type: ignore[no-any-return]


def test_library_upload_verify_list_and_private_playback(client: TestClient, b2_objects) -> None:  # type: ignore[no-untyped-def]
    video = upload(client, b2_objects, complete=False)
    pending = client.get("/demo-videos").json()
    assert any(
        row["id"] == video["id"] and row["status"] == "uploading" for row in pending["items"]
    )
    assert client.get(f"/demo-videos/{video['id']}/playback").status_code == 409
    assert client.post(f"/demo-videos/{video['id']}/complete").status_code == 200
    ready = next(
        row for row in client.get("/demo-videos").json()["items"] if row["id"] == video["id"]
    )
    assert ready["title"] == "Demo truck" and float(ready["reference_fill_pct"]) == 50
    assert (
        client.get(f"/demo-videos/{video['id']}/playback")
        .json()["url"]
        .startswith("https://private-b2.test/")
    )


def test_unverified_or_wrong_size_upload_cannot_be_analyzed(client: TestClient, b2_objects) -> None:  # type: ignore[no-untyped-def]
    video = upload(client, b2_objects, complete=False)
    url = f"/events/{DEMO_EVENT_ID}/demo-videos/{video['id']}/analyze"
    assert client.post(url).status_code == 409
    for _, meta in b2_objects.values():
        meta["ContentLength"] = 999
    assert client.post(f"/demo-videos/{video['id']}/complete").status_code == 409


def test_queued_job_is_recovered_after_reload_and_finishes_without_reupload(
    client: TestClient, b2_objects, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    video = upload(client, b2_objects)
    start_worker = ingest_jobs.ensure_worker
    monkeypatch.setattr(ingest_jobs, "ensure_worker", lambda: None)
    response = client.post(f"/events/{DEMO_EVENT_ID}/demo-videos/{video['id']}/analyze")
    assert response.status_code == 202
    job = response.json()
    recovered = client.get(f"/events/{DEMO_EVENT_ID}/ingest-jobs").json()
    assert recovered["id"] == job["id"] and recovered["status"] == "accepted"
    assert (
        client.post(f"/events/{DEMO_EVENT_ID}/demo-videos/{video['id']}/analyze").status_code == 409
    )
    monkeypatch.setattr(ingest_jobs, "ensure_worker", start_worker)
    assert client.portal is not None
    client.portal.call(ingest_jobs.recover_ingest_jobs)
    completed = wait_for_job(client)
    assert completed["status"] == "completed"
    assert client.get(f"/tickets/{completed['ticket']['id']}").status_code == 200


def test_running_job_is_requeued_after_backend_replacement(
    client: TestClient,
    b2_objects,
    monkeypatch: pytest.MonkeyPatch,
    sessionmaker: async_sessionmaker[AsyncSession],
) -> None:  # type: ignore[no-untyped-def]
    video = upload(client, b2_objects)
    original = ingest_jobs.ensure_worker
    monkeypatch.setattr(ingest_jobs, "ensure_worker", lambda: None)
    job = client.post(f"/events/{DEMO_EVENT_ID}/demo-videos/{video['id']}/analyze").json()

    async def interrupted() -> None:
        async with sessionmaker() as session:
            row = await session.get(AnalysisJob, UUID(job["id"]))
            assert row is not None
            row.status = "running"
            await session.commit()

    assert client.portal is not None
    client.portal.call(interrupted)
    monkeypatch.setattr(ingest_jobs, "ensure_worker", original)
    client.portal.call(ingest_jobs.recover_ingest_jobs)
    res = wait_for_job(client)
    assert res["status"] == "failed"
    assert "Interrupted" in (res["detail"] or "")


def test_failed_analysis_can_retry_same_saved_clip(
    client: TestClient, b2_objects, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    video = upload(client, b2_objects)
    original = ingest_jobs.ingest_clip

    async def failed(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise HTTPException(422, "No truck detected")

    monkeypatch.setattr(ingest_jobs, "ingest_clip", failed)
    url = f"/events/{DEMO_EVENT_ID}/demo-videos/{video['id']}/analyze"
    assert client.post(url).status_code == 202
    assert wait_for_job(client)["status"] == "failed"
    monkeypatch.setattr(ingest_jobs, "ingest_clip", original)
    assert client.post(url).status_code == 202
    assert wait_for_job(client)["status"] == "completed"


def test_library_mutations_require_role_and_other_tenants_cannot_read(
    client: TestClient, b2_objects, as_role, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    from app.api.deps import current_member
    from app.auth.session import Session
    from app.main import app

    video = upload(client, b2_objects)
    as_role("auditor")
    assert client.post(f"/demo-videos/{video['id']}/complete").status_code == 403
    app.dependency_overrides[current_member] = lambda: Session(
        user_id=str(uuid4()),
        tenant_id=str(uuid4()),
        email="other@test.io",
        role="county_admin",
        full_name="Other",
    )
    assert client.get("/demo-videos").json()["items"] == []
    assert client.get(f"/demo-videos/{video['id']}/playback").status_code == 404


def test_bucket_unavailable_does_not_create_a_library_upload(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable(*args: object, **kwargs: object) -> str:
        raise OSError("outage")

    monkeypatch.setattr(b2_store, "signed_url", unavailable)
    before = client.get("/demo-videos").json()["total"]
    response = client.post(
        "/demo-videos/uploads",
        json={"title": "Clip", "filename": "haul.mp4", "mime": "video/mp4", "size_bytes": 12},
    )
    assert response.status_code == 503
    assert client.get("/demo-videos").json()["total"] == before


@pytest.mark.parametrize("role", ["super_admin"])
def test_fresh_analysis_survives_restart_and_skips_both_result_caches(
    client: TestClient,
    b2_objects,
    as_role,
    monkeypatch: pytest.MonkeyPatch,
    sessionmaker: async_sessionmaker[AsyncSession],
    role: str,
) -> None:  # type: ignore[no-untyped-def]
    from app.api import ingest as ingest_api

    video = upload(client, b2_objects)
    as_role(role)
    original_worker = ingest_jobs.ensure_worker
    monkeypatch.setattr(ingest_jobs, "ensure_worker", lambda: None)
    response = client.post(
        f"/events/{DEMO_EVENT_ID}/demo-videos/{video['id']}/analyze?bypass_cache=true"
    )
    assert response.status_code == 202
    job = response.json()
    assert job["bypass_cache"] is True

    async def simulate_restart() -> None:
        async with sessionmaker() as session:
            row = await session.get(AnalysisJob, UUID(job["id"]))
            assert row is not None and row.bypass_cache is True
            row.status = "queued"
            await session.commit()

    def cache_not_allowed(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("Fresh analysis must not read either result cache")

    monkeypatch.setattr(ingest_api, "CachingAIClient", cache_not_allowed)
    monkeypatch.setattr(ingest_api, "get_pipeline_cache", cache_not_allowed)
    assert client.portal is not None
    client.portal.call(simulate_restart)
    monkeypatch.setattr(ingest_jobs, "ensure_worker", original_worker)
    client.portal.call(ingest_jobs.recover_ingest_jobs)
    completed = wait_for_job(client)
    assert completed["status"] == "completed", completed
    assert completed["bypass_cache"] is True


@pytest.mark.parametrize("role", ["monitor", "supervisor", "auditor", "county_admin"])
def test_non_admin_cannot_force_fresh_analysis(
    client: TestClient,
    b2_objects,
    as_role,
    monkeypatch: pytest.MonkeyPatch,
    role: str,
) -> None:  # type: ignore[no-untyped-def]
    video = upload(client, b2_objects)
    as_role(role)
    monkeypatch.setattr(ingest_jobs, "ensure_worker", lambda: None)
    base = f"/events/{DEMO_EVENT_ID}"
    assert (
        client.post(f"{base}/demo-videos/{video['id']}/analyze?bypass_cache=true").status_code
        == 403
    )
    assert (
        client.post(
            f"{base}/ingest?bypass_cache=true", files={"file": ("haul.mp4", b"sample", "video/mp4")}
        ).status_code
        == 403
    )
    assert client.get(f"{base}/ingest-jobs").json() is None
    if role != "auditor":
        cached = client.post(f"{base}/demo-videos/{video['id']}/analyze")
        assert cached.status_code == 403


@pytest.mark.parametrize("role", ["county_admin", "monitor"])
def test_ticket_upload_requires_administrator_login(
    client: TestClient,
    b2_objects,
    as_role,
    role: str,
) -> None:  # type: ignore[no-untyped-def]
    as_role(role)
    body = {
        "title": "Ticket evidence",
        "filename": "haul.mp4",
        "mime": "video/mp4",
        "size_bytes": 12,
    }
    assert client.post("/demo-videos/uploads", json=body).status_code == 403
    response = client.post(f"/events/{DEMO_EVENT_ID}/ingest-uploads", json=body)
    assert response.status_code == 403


def test_ticket_upload_respects_read_only_events_and_auditor_access(
    client: TestClient,
    as_role,
) -> None:  # type: ignore[no-untyped-def]
    body = {
        "title": "Ticket evidence",
        "filename": "haul.mp4",
        "mime": "video/mp4",
        "size_bytes": 12,
    }
    upload_url = f"/events/{DEMO_EVENT_ID}/ingest-uploads"
    response = client.post(upload_url, json=body)
    assert response.status_code == 201
    video_id = response.json()["video"]["id"]
    assert client.patch(f"/events/{DEMO_EVENT_ID}", json={"tags": ["read-only"]}).status_code == 200
    assert client.post(upload_url, json=body).status_code == 409
    assert client.post(f"{upload_url}/{video_id}/complete").status_code == 409
    as_role("auditor")
    assert client.post(upload_url, json=body).status_code == 403
