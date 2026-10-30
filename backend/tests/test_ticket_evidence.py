"""Ticket evidence: the stored clip and SAM's raw segmentation, served to Review."""

from __future__ import annotations

from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.pipeline import evidence_store
from app.tickets.repository import SqlTicketRepository
from app.tickets.seed import DEMO_EVENT_ID, DEMO_TENANT_ID

CLIP = b"evidence-clip-bytes-for-playback"


def _ingest(client: TestClient) -> str:
    resp = client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("haul.mp4", CLIP, "video/mp4")},
    )
    assert resp.status_code == 201
    return str(resp.json()["id"])


def test_ingest_stores_the_clip_and_serves_it(client: TestClient) -> None:
    ticket_id = _ingest(client)

    ev = client.get(f"/tickets/{ticket_id}/evidence")
    assert ev.status_code == 200
    body = ev.json()
    assert body["has_media"] is True
    assert body["media_kind"] == "video" and body["mime"] == "video/mp4"
    assert body["segments"] == {}  # fixtures carry no raw SAM output

    media = client.get(f"/tickets/{ticket_id}/evidence/media", follow_redirects=False)
    assert media.status_code == 307
    assert media.headers["location"].startswith("https://private-b2.test/")
    signed = client.get(f"/tickets/{ticket_id}/evidence/url")
    assert signed.status_code == 200 and signed.json()["url"] == media.headers["location"]


def test_seeded_ticket_without_evidence_is_404(client: TestClient) -> None:
    ticket_id = client.get("/tickets?limit=1").json()["items"][0]["id"]
    assert client.get(f"/tickets/{ticket_id}/evidence").status_code == 404
    assert client.get(f"/tickets/{ticket_id}/evidence/media").status_code == 404


@pytest.mark.asyncio
async def test_evidence_is_tenant_scoped(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> None:
    ticket = UUID("44444444-4444-4444-4444-444444444444")
    async with sessionmaker() as s:
        repo = SqlTicketRepository(s)
        await repo.save_ticket_evidence(
            DEMO_TENANT_ID,
            ticket,
            content_hash="a" * 64,
            media_kind="video",
            mime="video/mp4",
            fps=3.0,
            segments={"truck bed": "<0f>0<|box|>"},
        )
        mine = await repo.get_ticket_evidence(DEMO_TENANT_ID, ticket)
        other = await repo.get_ticket_evidence(UUID("99999999-9999-9999-9999-999999999999"), ticket)
    assert mine is not None and mine.segments == {"truck bed": "<0f>0<|box|>"}
    assert other is None


@pytest.mark.asyncio
async def test_store_rejects_unsafe_keys_and_keeps_first_copy(b2_objects) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError):
        await evidence_store.save("../escape", b"x", mime="video/mp4")
    assert await evidence_store.load("../escape") is None
    await evidence_store.save("b" * 64, b"first", mime="video/mp4", fps=3.0)
    await evidence_store.save("b" * 64, b"second", mime="video/mp4")
    stored = await evidence_store.load("b" * 64)
    assert stored is not None and stored.fps == 3.0
    assert b2_objects[stored.object_key][0] == b"first"


@pytest.mark.asyncio
async def test_benchmark_playback_skips_b2_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app.api.tickets import ticket_evidence, ticket_evidence_media, ticket_evidence_url
    from app.pipeline.benchmark_media import BENCHMARK_MEDIA, benchmark_media_url

    digest = next(iter(BENCHMARK_MEDIA))
    row = SimpleNamespace(
        content_hash=digest,
        media_kind="video",
        mime="video/mp4",
        fps=3,
        media_storage="b2",
        segments={"truck bed": "saved masks"},
    )
    repo = SimpleNamespace(get_ticket_evidence=AsyncMock(return_value=row))
    load = AsyncMock(side_effect=AssertionError("Benchmark playback must not wait for B2"))
    monkeypatch.setattr(evidence_store, "load", load)
    ticket_id = UUID("44444444-4444-4444-4444-444444444444")
    evidence = await ticket_evidence(repo, DEMO_TENANT_ID, ticket_id)
    assert evidence.has_media and evidence.media_url == benchmark_media_url(digest)
    assert evidence.segments == row.segments and evidence.fps == 3
    url = await ticket_evidence_url(repo, DEMO_TENANT_ID, ticket_id)
    redirect = await ticket_evidence_media(repo, DEMO_TENANT_ID, ticket_id)
    assert url["url"] == evidence.media_url == redirect.headers["location"]
    low_url = await ticket_evidence_url(repo, DEMO_TENANT_ID, ticket_id, quality="low")
    assert low_url["url"] == benchmark_media_url(digest, quality="low")
    assert "-low.mp4" in low_url["url"]
    load.assert_not_called()
