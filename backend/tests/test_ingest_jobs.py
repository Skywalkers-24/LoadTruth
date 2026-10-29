"""A received upload outlives its HTTP request and is recoverable by event."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api import ingest_jobs
from app.tickets.seed import DEMO_EVENT_ID


@pytest.fixture(autouse=True)
def isolated_jobs(
    monkeypatch: pytest.MonkeyPatch, sessionmaker: async_sessionmaker[AsyncSession]
) -> None:
    monkeypatch.setattr(ingest_jobs, "_jobs", {})
    monkeypatch.setattr(ingest_jobs, "get_sessionmaker", lambda: sessionmaker)


def wait_for_job(client: TestClient) -> dict[str, object]:
    async def wait() -> None:
        for _ in range(200):
            if all(j.status not in ("accepted", "running") for j in ingest_jobs._jobs.values()):
                return
            await asyncio.sleep(0.01)
        raise AssertionError("worker did not finish")

    assert client.portal is not None
    client.portal.call(wait)
    response = client.get(f"/events/{DEMO_EVENT_ID}/ingest-jobs")
    assert response.status_code == 200
    return response.json()  # type: ignore[no-any-return]


def test_upload_acknowledged_before_analysis_and_recovers_after_reload(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = asyncio.Event()
    original = ingest_jobs.ingest_clip

    async def paused(*args, **kwargs):  # type: ignore[no-untyped-def]
        await gate.wait()
        return await original(*args, **kwargs)

    monkeypatch.setattr(ingest_jobs, "ingest_clip", paused)
    response = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest-jobs",
        files={"file": ("haul.mp4", b"sample-bytes", "video/mp4")},
    )
    # Analysis is blocked, but the upload response has already completed.
    assert response.status_code == 202
    job_id = response.json()["id"]
    assert response.json()["ticket"] is None
    recovered = client.get(f"/events/{DEMO_EVENT_ID}/ingest-jobs").json()
    assert recovered["id"] == job_id
    assert recovered["status"] in ("accepted", "running")
    progress = client.get(f"/system/events/{DEMO_EVENT_ID}/pipeline-progress").json()
    assert progress["status"] == "running"
    assert progress["content_hash"] == recovered["content_hash"]
    # Another upload cannot overwrite the in-flight event's tracking slot.
    duplicate = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest-jobs",
        files={"file": ("other.mp4", b"other-bytes", "video/mp4")},
    )
    assert duplicate.status_code == 409
    assert client.portal is not None
    client.portal.call(gate.set)
    completed = wait_for_job(client)
    assert completed["id"] == job_id
    assert completed["status"] == "completed"
    ticket = completed["ticket"]
    assert isinstance(ticket, dict)
    # The worker's independent session committed the ticket before reporting success.
    assert client.get(f"/tickets/{ticket['id']}").status_code == 200


def test_failed_analysis_is_recoverable_and_allows_retry(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fail(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise HTTPException(422, "No truck detected.")

    monkeypatch.setattr(ingest_jobs, "ingest_clip", fail)
    url = f"/events/{DEMO_EVENT_ID}/ingest-jobs"
    assert client.post(url, files={"file": ("haul.mp4", b"bytes")}).status_code == 202
    failed = wait_for_job(client)
    assert failed["status"] == "failed"
    assert failed["detail"] == "No truck detected."
    retry = client.post(url, files={"file": ("retry.mp4", b"bytes")})
    assert retry.status_code == 202
    assert retry.json()["id"] != failed["id"]
    wait_for_job(client)


def test_jobs_enforce_permissions_event_scope_and_empty_upload(
    client: TestClient, as_role: Callable[[str], None]
) -> None:
    url = f"/events/{DEMO_EVENT_ID}/ingest-jobs"
    assert client.get(url).json() is None
    assert client.get(f"/events/{uuid4()}/ingest-jobs").status_code == 404
    assert client.post(url, files={"file": ("empty.mp4", b"")}).status_code == 400
    as_role("auditor")
    assert client.post(url, files={"file": ("haul.mp4", b"bytes")}).status_code == 403
