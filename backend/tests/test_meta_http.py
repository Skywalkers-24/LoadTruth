"""Meta Model API transport: retries, typed errors, and stream handling. No network."""

from __future__ import annotations

import json
from collections.abc import Callable

import httpx
import pytest

from app.ai.meta_http import (
    MetaHTTP,
    ModelAPIAuthError,
    ModelAPIRequestError,
    ModelAPIResponseError,
    ModelAPIUnavailableError,
    output_text,
)

Handler = Callable[[httpx.Request], httpx.Response]


def _http(handler: Handler, delays: list[float] | None = None, retries: int = 2) -> MetaHTTP:
    async def sleep(seconds: float) -> None:
        if delays is not None:
            delays.append(seconds)

    return MetaHTTP(
        api_key="k",
        base_url="https://api.meta.ai/v1",
        max_retries=retries,
        transport=httpx.MockTransport(handler),
        sleep=sleep,
    )


def _ok(text: str = "hi") -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "status": "completed",
            "output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}],
        },
    )


@pytest.mark.asyncio
async def test_retries_rate_limit_then_succeeds_honoring_retry_after() -> None:
    calls = {"n": 0}
    delays: list[float] = []

    def handler(_: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"retry-after": "3"}, json={"error": {}})
        return _ok()

    body = await _http(handler, delays).create_response({"model": "m", "input": "x"})
    assert output_text(body) == "hi"
    assert calls["n"] == 2
    assert delays == [3.0]


@pytest.mark.asyncio
async def test_server_errors_exhaust_retries() -> None:
    calls = {"n": 0}

    def handler(_: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, json={"error": {"message": "overloaded"}})

    with pytest.raises(ModelAPIUnavailableError, match="overloaded"):
        await _http(handler, retries=2).create_response({"model": "m"})
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_network_errors_are_retried_then_typed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    with pytest.raises(ModelAPIUnavailableError):
        await _http(handler, retries=1).create_response({"model": "m"})


@pytest.mark.asyncio
async def test_bad_request_is_permanent() -> None:
    calls = {"n": 0}

    def handler(_: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, json={"error": {"message": "invalid prompt", "code": "x"}})

    with pytest.raises(ModelAPIRequestError) as info:
        await _http(handler).create_response({"model": "m"})
    assert calls["n"] == 1
    assert info.value.status == 400 and info.value.code == "x"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 403, 404])
async def test_auth_and_model_access_errors(status: int) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"code": "model_not_found"}})

    with pytest.raises(ModelAPIRequestError if status == 404 else ModelAPIAuthError):
        await _http(handler).create_response({"model": "m"})


@pytest.mark.asyncio
async def test_incomplete_response_is_an_error() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}},
        )

    with pytest.raises(ModelAPIResponseError, match="max_output_tokens"):
        await _http(handler).create_response({"model": "m"})


def _stream(events: list[dict[str, object]]) -> Handler:
    body = "".join(f"data: {json.dumps(e)}\n\n" for e in events) + "data: [DONE]\n\n"

    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, content=body.encode())

    return handler


@pytest.mark.asyncio
async def test_stream_prefers_the_finalized_text_and_reads_usage() -> None:
    handler = _stream(
        [
            {"type": "response.output_text.delta", "delta": "<0f>a|>"},
            {"type": "response.output_text.delta", "delta": "<1f>b|>"},
            {"type": "response.output_text.done", "text": "FINAL"},
            {"type": "response.completed", "response": {"usage": {"images_processed": 2}}},
        ]
    )
    out = await _http(handler).stream_response({"model": "sam-3.1"})
    assert out.text == "FINAL"
    assert out.usage == {"images_processed": 2}


@pytest.mark.asyncio
async def test_stream_falls_back_to_deltas_split_on_frame_markers() -> None:
    handler = _stream(
        [
            {"type": "response.output_text.delta", "delta": "<0f>0<|box|>"},
            {"type": "response.output_text.delta", "delta": "<1f>0<|box|>"},
            {"type": "response.completed", "response": {}},
        ]
    )
    out = await _http(handler).stream_response({"model": "sam-3.1"})
    assert out.text == "<0f>0<|box|>\n<1f>0<|box|>"


@pytest.mark.asyncio
async def test_stream_with_no_matches_is_empty_not_an_error() -> None:
    handler = _stream([{"type": "response.completed", "response": {"output": []}}])
    out = await _http(handler).stream_response({"model": "sam-3.1"})
    assert out.text == ""


@pytest.mark.asyncio
async def test_stream_failure_event_raises() -> None:
    handler = _stream([{"type": "response.failed", "response": {"error": {"message": "bad clip"}}}])
    with pytest.raises(ModelAPIResponseError, match="bad clip"):
        await _http(handler).stream_response({"model": "sam-3.1"})


@pytest.mark.asyncio
async def test_stream_cut_short_raises() -> None:
    handler = _stream([{"type": "response.output_text.delta", "delta": "<0f>"}])
    with pytest.raises(ModelAPIResponseError, match="ended before"):
        await _http(handler).stream_response({"model": "sam-3.1"})


@pytest.mark.asyncio
async def test_upload_sends_purpose_and_expiry_then_deletes() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "DELETE":
            return httpx.Response(200, json={"deleted": True})
        return httpx.Response(200, json={"id": "file-9"})

    http = _http(handler)
    file_id = await http.upload_file(b"abc", filename="c.mp4", mime="video/mp4", ttl_s=3600)
    await http.delete_file(file_id)
    assert file_id == "file-9"
    form = seen[0].content.decode(errors="replace")
    assert 'name="purpose"' in form and "user_data" in form
    assert "expires_after[seconds]" in form and "3600" in form
    assert seen[1].method == "DELETE" and seen[1].url.path.endswith("/files/file-9")


@pytest.mark.asyncio
async def test_upload_retries_without_expiry_when_rejected() -> None:
    forms: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        form = request.content.decode(errors="replace")
        forms.append(form)
        if "expires_after" in form:
            return httpx.Response(400, json={"error": {"message": "unknown field"}})
        return httpx.Response(200, json={"id": "file-1"})

    assert await _http(handler).upload_file(b"x", filename="a", mime="video/mp4", ttl_s=60) == (
        "file-1"
    )
    assert len(forms) == 2


@pytest.mark.asyncio
async def test_delete_failure_is_logged_not_raised() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    await _http(handler).delete_file("file-x")  # no exception
