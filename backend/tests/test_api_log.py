"""The Meta API exchange log (app/ai/api_log.py). No network."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from app.ai import api_log
from app.ai.meta_http import MetaHTTP, ModelAPIRequestError
from app.config import get_settings


@pytest.fixture
def log_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "meta_api.jsonl"
    monkeypatch.setenv("MODEL_API_LOG_PATH", str(path))
    get_settings.cache_clear()
    return path


def _http(handler: httpx.MockTransport) -> MetaHTTP:
    return MetaHTTP(api_key="secret-key-123", base_url="https://api.meta.ai/v1", transport=handler)


def _text(path: Path) -> str:
    return path.read_text()


def _entries(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in _text(path).splitlines()]


@pytest.mark.asyncio
async def test_responses_are_logged_with_media_and_key_redacted(log_file: Path) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [{"type": "message", "content": [{"type": "output_text", "text": "ok"}]}],
                "usage": {"input_tokens": 7, "output_tokens": 3},
            },
        )

    payload = {
        "model": "muse-spark-1.3",
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [
                    {"type": "input_text", "text": "read the placard"},
                    {"type": "input_video", "video_url": "data:video/mp4;base64," + "A" * 4000},
                ],
            }
        ],
    }
    await _http(httpx.MockTransport(handler)).create_response(payload)

    raw = _text(log_file)
    assert "secret-key-123" not in raw
    assert "A" * 100 not in raw  # media bytes are not written
    (entry,) = _entries(log_file)
    assert entry["call"] == "responses" and entry["model"] == "muse-spark-1.3"
    assert entry["output_text"] == "ok"
    assert entry["usage"] == {"input_tokens": 7, "output_tokens": 3}
    part = entry["request"]["input"][0]["content"][1]  # type: ignore[index]
    assert part["video_url"] == "<inline video/mp4, 3000 bytes>"


@pytest.mark.asyncio
async def test_stream_upload_delete_and_errors_are_logged(log_file: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "DELETE":
            return httpx.Response(200, json={"deleted": True})
        if request.url.path.endswith("/files"):
            return httpx.Response(200, json={"id": "file-1"})
        body = json.loads(request.content)
        if body.get("model") == "bad":
            return httpx.Response(400, json={"error": {"message": "invalid prompt"}})
        events = [
            {"type": "response.output_text.delta", "delta": "<0f>x"},
            {"type": "response.completed", "response": {"usage": {"images_processed": 1}}},
        ]
        sse = "".join(f"data: {json.dumps(e)}\n\n" for e in events)
        return httpx.Response(200, content=sse.encode())

    http = _http(httpx.MockTransport(handler))
    await http.stream_response({"model": "sam-3.1", "input": "truck bed"})
    file_id = await http.upload_file(b"123", filename="c.mp4", mime="video/mp4", ttl_s=60)
    await http.delete_file(file_id)
    with pytest.raises(ModelAPIRequestError):
        await http.create_response({"model": "bad"})

    entries = _entries(log_file)
    assert [e["call"] for e in entries] == [
        "responses.stream",
        "files.upload",
        "files.delete",
        "responses",
    ]
    stream, upload, delete, failed = entries
    assert stream["output_text"] == "<0f>x"
    assert stream["stream_events"] == {"response.output_text.delta": 1, "response.completed": 1}
    assert upload["file_id"] == "file-1" and upload["bytes"] == 3
    assert delete["status"] == 200
    assert failed["error"]["type"] == "ModelAPIRequestError"  # type: ignore[index]
    assert failed["status"] == 400

    summary = api_log.summarize(_text(log_file).splitlines(), 10)
    assert len(summary) == 4 and "ERROR ModelAPIRequestError" in summary[-1]


@pytest.mark.asyncio
async def test_long_output_is_truncated(log_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_API_LOG_MAX_CHARS", "10")
    get_settings.cache_clear()
    await api_log.record("responses", output_text="x" * 50)
    (entry,) = _entries(log_file)
    assert entry["output_text"] == "x" * 10
    assert entry["output_chars"] == 50 and entry["truncated"] is True


@pytest.mark.asyncio
async def test_recording_off_writes_nothing(tmp_path: Path) -> None:
    await api_log.record("responses", output_text="x")  # conftest sets the path empty
    assert api_log.log_path() is None


def test_summary_cli(log_file: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert api_log.main([]) == 1  # nothing logged yet
    log_file.write_text(json.dumps({"call": "responses", "output_text": "hi"}) + "\n")
    assert api_log.main(["5"]) == 0
    assert "1 calls" in capsys.readouterr().out
