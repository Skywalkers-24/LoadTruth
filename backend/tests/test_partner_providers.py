from __future__ import annotations

import json
from unittest.mock import AsyncMock

import httpx
import pytest

from app.ai import partner_http
from app.ai.base import CallUsage
from app.ai.catalog import CostMode, ReasoningEffort
from app.ai.config_store import TaskConfigUpdate, get_ai_config_store
from app.ai.live import LiveAIClient, PreparedMedia
from app.ai.meta_http import (
    ModelAPIAuthError,
    ModelAPIResponseError,
    ModelAPIUnavailableError,
    output_text,
)
from app.ai.providers import PartnerEndpoint, ai_config_fingerprint
from app.ai.request_params import SparkRequestParams
from app.config import get_settings


@pytest.fixture(autouse=True)
def reset_routes(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("SPARK_PROVIDER", "meta")
    monkeypatch.setenv("SPARK_FALLBACK_PROVIDERS", "")
    monkeypatch.setenv("MODEL_API_MAX_RETRIES", "0")
    get_settings.cache_clear()
    get_ai_config_store.cache_clear()
    yield
    get_ai_config_store.cache_clear()
    get_settings.cache_clear()


def params() -> SparkRequestParams:
    return SparkRequestParams(
        "modal/muse-spark-open", ReasoningEffort.BALANCED, CostMode.STANDARD, 2000
    )


@pytest.mark.asyncio
async def test_modal_auth_schema_usage_and_reasoning_are_translated() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer id.secret"
        assert request.headers["Modal-Routing-Affinity-Key"] == "affinity"
        body = json.loads(request.content)
        assert body["model"] == "meta-models/Muse-Spark-Open-816B-A42B"
        assert body["reasoning_effort"] == "medium"
        assert body["response_format"]["json_schema"]["strict"] is True
        assert body["messages"][0]["content"][1]["type"] == "image_url"
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": '{"id":"3391"}',
                            "reasoning_content": "not the answer",
                        },
                    }
                ],
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 20,
                    "prompt_tokens_details": {"cached_tokens": 10},
                    "completion_tokens_details": {"reasoning_tokens": 5},
                },
            },
        )

    route = PartnerEndpoint(
        "modal",
        "meta-models/Muse-Spark-Open-816B-A42B",
        "https://modal.test/v1",
        "id.secret",
        {"Modal-Routing-Affinity-Key": "affinity"},
    )
    response, usage = await partner_http.complete(
        route,
        params(),
        "ocr",
        [
            {"type": "text", "text": "Read ID"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,AA=="}},
        ],
        {"type": "object", "required": ["id"]},
        transport=httpx.MockTransport(handler),
    )
    assert json.loads(output_text(response)) == {"id": "3391"}
    assert usage.model == "modal/muse-spark-open"
    assert usage.reasoning_tokens == 5 and usage.cost_usd > 0


@pytest.mark.asyncio
async def test_baseten_uses_exact_hackathon_model_and_omits_reasoning_knob(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BASETEN_INPUT_PRICE", "0")
    get_settings.cache_clear()

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["model"] == "meta-models/muse-spark-open-1026"
        assert "reasoning_effort" not in body
        return httpx.Response(
            200, json={"choices": [{"finish_reason": "stop", "message": {"content": "ready"}}]}
        )

    route = PartnerEndpoint(
        "baseten", "meta-models/muse-spark-open-1026", "https://baseten.test/v1", "key"
    )
    _, usage = await partner_http.complete(
        route,
        params(),
        "ping",
        [{"type": "text", "text": "ready"}],
        None,
        transport=httpx.MockTransport(handler),
    )
    assert not usage.pricing_known  # unknown provider rates are not called free


@pytest.mark.asyncio
async def test_truncated_structured_output_is_rejected() -> None:
    transport = httpx.MockTransport(
        lambda _: httpx.Response(
            200, json={"choices": [{"finish_reason": "length", "message": {"content": '{"id":'}}]}
        )
    )
    with pytest.raises(ModelAPIResponseError):
        await partner_http.complete(
            PartnerEndpoint("modal", "model", "https://modal.test", "key"),
            params(),
            "ocr",
            [],
            {"required": ["id"]},
            transport=transport,
        )


@pytest.mark.asyncio
async def test_transient_failure_falls_back_but_auth_failure_does_not(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SPARK_FALLBACK_PROVIDERS", "modal")
    get_settings.cache_clear()
    await get_ai_config_store().update(
        "analyst_chat", TaskConfigUpdate(model="baseten/muse-spark-open")
    )
    calls: list[str] = []

    async def complete(route, *args, **kwargs):  # type: ignore[no-untyped-def]
        calls.append(route.provider)
        if route.provider == "baseten":
            raise ModelAPIUnavailableError("temporary")
        return {"output": []}, CallUsage(model="modal/muse-spark-open")

    monkeypatch.setattr(partner_http, "complete", complete)
    client = LiveAIClient()
    try:
        _, usage = await client._spark(
            "analyst_chat", [{"type": "input_text", "text": "question"}], None
        )
        assert calls == ["baseten", "modal"] and usage.model == "modal/muse-spark-open"
        permanent = AsyncMock(side_effect=ModelAPIAuthError("invalid key"))
        monkeypatch.setattr(partner_http, "complete", permanent)
        with pytest.raises(ModelAPIAuthError):
            await client._spark("analyst_chat", [{"type": "input_text", "text": "question"}], None)
        assert permanent.await_count == 1
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_partner_vision_receives_images_not_meta_file_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await get_ai_config_store().update("spark_ocr", TaskConfigUpdate(model="modal/muse-spark-open"))
    complete = AsyncMock(return_value=({"output": []}, CallUsage(model="modal/muse-spark-open")))
    monkeypatch.setattr(partner_http, "complete", complete)
    client = LiveAIClient()
    media = PreparedMedia(
        "image",
        "image/png",
        3,
        {"type": "input_image", "file_id": "meta-only"},
        "meta-only",
        b"png",
    )
    try:
        await client._spark(
            "spark_ocr", [{"type": "input_text", "text": "Read ID"}, media.part], None, media=media
        )
        sent = complete.call_args.args[3]
        images = [part for part in sent if part["type"] == "image_url"]
        assert len(images) == 1
        assert images[0]["image_url"]["url"].startswith("data:image/png;base64,")
        assert "meta-only" not in json.dumps(sent)
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_provider_or_endpoint_switch_invalidates_config_fingerprint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = ai_config_fingerprint()
    await get_ai_config_store().update(
        "spark_ocr", TaskConfigUpdate(model="baseten/muse-spark-open")
    )
    assert ai_config_fingerprint() != original
    selected = ai_config_fingerprint()
    monkeypatch.setenv("BASETEN_BASE_URL", "https://new-endpoint.test/v1")
    get_settings.cache_clear()
    assert ai_config_fingerprint() != selected


@pytest.mark.asyncio
async def test_partner_video_is_sampled_to_bounded_image_frames(tmp_path) -> None:  # type: ignore[no-untyped-def]
    import asyncio
    import shutil

    from app.ai.partner_media import media_parts

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not shutil.which("ffprobe"):
        pytest.skip("ffmpeg and ffprobe are required for video input")
    path = tmp_path / "red.mp4"
    proc = await asyncio.create_subprocess_exec(
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=256x256:d=1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(path),
    )
    assert await proc.wait() == 0
    parts = await media_parts(path.read_bytes(), "video/mp4", "video")
    images = [part for part in parts if part["type"] == "image_url"]
    assert 1 <= len(images) <= get_settings().spark_frames_per_task
    assert all(part["image_url"]["url"].startswith("data:image/jpeg;base64,") for part in images)
    assert any("frame near" in part.get("text", "") for part in parts)
