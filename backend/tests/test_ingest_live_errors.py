"""Ingest API behavior when the live Meta client fails or the spend cap is hit."""

from __future__ import annotations

import os
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai import live as live_module
from app.ai.live import LiveAIClient
from app.ai.meta_http import MetaHTTP
from app.api import ingest as ingest_api
from app.pipeline.ledger import CostLedger
from app.pipeline.transcode import PreparedBytes
from app.tickets.seed import DEMO_EVENT_ID


def _live(status: int) -> LiveAIClient:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"message": "nope", "code": "c"}})

    async def no_sleep(_: float) -> None:
        return None

    return LiveAIClient(
        MetaHTTP(
            api_key="k",
            base_url="https://api.meta.ai/v1",
            max_retries=0,
            transport=httpx.MockTransport(handler),
            sleep=no_sleep,
        )
    )


@pytest.fixture(autouse=True)
def _no_ffmpeg(monkeypatch: pytest.MonkeyPatch) -> None:
    async def same(data: bytes, *, media_kind: str, filename: str) -> PreparedBytes:
        return PreparedBytes(data, "video/mp4")

    monkeypatch.setattr(live_module, "prepare_media", same)


def _upload(client: TestClient, payload: bytes) -> Any:
    return client.post(
        f"/events/{DEMO_EVENT_ID}/ingest",
        files={"file": ("haul.mp4", payload, "video/mp4")},
    )


@pytest.mark.parametrize(
    ("upstream", "status", "phrase"),
    [
        (401, 503, "credentials"),
        (503, 503, "busy"),
        (400, 422, "could not read that file"),
    ],
)
def test_model_api_failures_map_to_clear_statuses(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    upstream: int,
    status: int,
    phrase: str,
) -> None:
    monkeypatch.setattr(ingest_api, "get_ai_client", lambda: _live(upstream))
    resp = _upload(client, f"live-failure-{upstream}".encode())
    assert resp.status_code == status
    detail = resp.json()["detail"]
    assert phrase in detail
    assert "nope" not in detail  # the provider's message is logged, not returned


def test_spend_cap_blocks_new_runs(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    ledger = CostLedger()
    asyncio.run(ledger.record_run(stage="sam_track", model="sam-3.1", cost_usd=1_000.0))
    monkeypatch.setattr(ingest_api, "get_cost_ledger", lambda: ledger)
    resp = _upload(client, b"over-budget-clip")
    assert resp.status_code == 503
    assert "spending limit" in resp.json()["detail"]


def test_scenario_filenames_do_not_steer_live_runs(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings
    from app.pipeline.ingest import ingest_upload

    monkeypatch.setitem(os.environ, "MODEL_API_KEY", "real-key")
    monkeypatch.setitem(os.environ, "MOCK_AI", "0")
    get_settings.cache_clear()
    try:
        assert get_settings().live_ai_enabled
        live = ingest_upload(
            "no-truck__clip.mp4", b"abc", allow_scenario_override=not get_settings().live_ai_enabled
        )
        assert live.content_hash != "no-truck"
        assert ingest_upload("no-truck__clip.mp4", b"abc").content_hash == "no-truck"
    finally:
        get_settings.cache_clear()
