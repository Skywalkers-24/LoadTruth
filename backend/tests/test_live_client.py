"""The live Meta client end to end against a fake Model API (httpx.MockTransport).

No network and no credits: every request goes to an in-process handler that
answers the way dev.meta.ai documents (streamed SAM lines, Spark JSON answers,
the Files API). Proves the wiring a real key exercises: media prepared once,
one SAM request per concept, structured Spark calls with the admin's effort,
uploads deleted after the run, and real dollars in the cost ledger.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from decimal import Decimal
from typing import Any

import httpx
import pytest

from app.ai import live as live_module
from app.ai.base import ClipMedia
from app.ai.live import LiveAIClient
from app.ai.meta_http import MetaHTTP
from app.config import get_settings
from app.pipeline.ingest import IngestedArtifact
from app.pipeline.ledger import CostLedger
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.registry import CertifiedTruck, TruckRegistry
from app.pipeline.transcode import PreparedBytes
from app.tickets.seed import DEMO_EVENT_ID, DEMO_TENANT_ID

MASK_0 = "~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x("
MASK_1 = "~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@"


def _bed_line(frame: int) -> str:
    return (
        f"<{frame}f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>"
        f"<|mask;x=0;y=0;data=27,60,{MASK_0}|>"
    )


def _load_line(frame: int) -> str:
    # The documented 27x48 mask, placed inside the bed's horizontal span.
    return (
        f"<{frame}f>3<|box;x1=215;y1=228;x2=262;y2=254;w=320;h=334|>"
        f"<|mask;x=0;y=0;data=27,48,{MASK_1}|>"
    )


def _sse(text: str, usage: dict[str, Any]) -> bytes:
    lines = [ln for ln in text.split("\n") if ln]
    events: list[dict[str, Any]] = [{"type": "response.created", "response": {"id": "r"}}]
    events += [{"type": "response.output_text.delta", "delta": ln + "\n"} for ln in lines]
    events.append(
        {"type": "response.content_part.done", "part": {"type": "output_text", "text": text}}
    )
    events.append(
        {"type": "response.completed", "response": {"status": "completed", "usage": usage}}
    )
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def _spark(answer: str, *, tokens_in: int = 1000, tokens_out: int = 200) -> dict[str, Any]:
    return {
        "status": "completed",
        "output": [
            {"type": "reasoning", "summary": []},
            {"type": "message", "content": [{"type": "output_text", "text": answer}]},
        ],
        "usage": {"input_tokens": tokens_in, "output_tokens": tokens_out},
    }


class FakeMeta:
    """An in-process stand-in for https://api.meta.ai/v1."""

    def __init__(self, *, frames: int = 2, ocr: dict[str, Any] | None = None) -> None:
        self.frames = frames
        self.ocr = ocr or {
            "truck_id": "fl-dt-3391",
            "readable": True,
            "confidence": 0.96,
            "seconds": 2.0,
        }
        self.responses: list[dict[str, Any]] = []
        self.uploads: list[httpx.Request] = []
        self.deleted: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        assert request.headers["authorization"] == "Bearer test-key"
        if request.method == "POST" and path.endswith("/files"):
            self.uploads.append(request)
            return httpx.Response(200, json={"id": "file-123", "status": "uploaded"})
        if request.method == "DELETE" and "/files/" in path:
            self.deleted.append(path.rsplit("/", 1)[-1])
            return httpx.Response(200, json={"deleted": True})
        body = json.loads(request.content)
        self.responses.append(body)
        if body["model"].startswith("sam"):
            concept = body["input"][0]["content"][0]["text"]
            line = _bed_line if concept == "truck bed" else _load_line
            text = "\n".join(line(f) for f in range(self.frames)) + "\n"
            image = body["input"][0]["content"][1]["type"] == "input_image"
            usage = {"images_processed": 1} if image else {}
            return httpx.Response(
                200, headers={"content-type": "text/event-stream"}, content=_sse(text, usage)
            )
        task = (body.get("text") or {}).get("format", {}).get("name")
        if task == "spark_ocr":
            return httpx.Response(200, json=_spark(json.dumps(self.ocr)))
        if task == "spark_classify":
            answer = {"debris_class": "construction_demolition", "confidence": 0.9}
            return httpx.Response(200, json=_spark(json.dumps(answer)))
        return httpx.Response(200, json=_spark("Check the placard — it was hard to read."))


async def _no_sleep(_: float) -> None:
    return None


def _client(fake: FakeMeta) -> LiveAIClient:
    http = MetaHTTP(
        api_key="test-key",
        base_url="https://api.meta.ai/v1",
        transport=httpx.MockTransport(fake.handler),
        sleep=_no_sleep,
    )
    return LiveAIClient(http)


@pytest.fixture(autouse=True)
def _passthrough_media(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Skip ffmpeg so tests are deterministic on any host."""

    async def _same(data: bytes, *, media_kind: str, filename: str) -> PreparedBytes:
        mime = "image/png" if media_kind == "image" else "video/mp4"
        return PreparedBytes(data, mime)

    monkeypatch.setattr(live_module, "prepare_media", _same)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _artifact(kind: str = "video") -> IngestedArtifact:
    name = "haul.png" if kind == "image" else "haul.mp4"
    return IngestedArtifact(filename=name, media_kind=kind, content_hash="f" * 64, size_bytes=64)


async def _run(client: LiveAIClient, kind: str = "video") -> tuple[Any, CostLedger]:
    ledger = CostLedger()
    registry = TruckRegistry([CertifiedTruck("FL-DT-3391", Decimal(20), "tandem")])
    async with client.clip_session("f" * 64):
        result = await run_pipeline(
            cache=None,
            artifact=_artifact(kind),
            tenant_id=DEMO_TENANT_ID,
            event_id=DEMO_EVENT_ID,
            registry=registry,
            rate_table={"construction_demolition": 12.0},
            ai=client,
            ledger=ledger,
            data=b"\x00" * 64,
        )
    return result, ledger


@pytest.mark.asyncio
async def test_video_run_uploads_once_and_drafts_a_ticket(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MEDIA_INLINE_MAX_BYTES", "10")  # force the Files API path
    get_settings.cache_clear()
    fake = FakeMeta()
    result, ledger = await _run(_client(fake))

    assert not result.no_truck
    assert result.ticket.truck_id == "FL-DT-3391"  # uppercased from the OCR answer
    assert result.ticket.debris_class.value == "construction_demolition"
    assert result.ticket.est_fill_pct > 0

    # SAM's raw output is kept per concept for the Review overlay, and the
    # media the models saw is stored for playback.
    assert set(result.segments) == {"truck bed", "debris pile"}
    assert result.segments["truck bed"].startswith("<0f>0<|box;")
    from app.pipeline import evidence_store

    assert await evidence_store.load("f" * 64) is not None

    # One upload served every call, and it was deleted when the run ended.
    assert len(fake.uploads) == 1
    assert fake.deleted == ["file-123"]
    sam = [b for b in fake.responses if b["model"].startswith("sam")]
    spark = [b for b in fake.responses if not b["model"].startswith("sam")]
    assert sorted(b["input"][0]["content"][0]["text"] for b in sam) == ["debris pile", "truck bed"]
    for body in fake.responses:
        part = body["input"][0]["content"][-1]
        if part["type"] != "input_text":
            assert part == {"type": "input_video", "file_id": "file-123"}
    assert all(b["stream"] is True for b in sam)
    assert all(b["metadata"]["mask_encoding"] == "one_bit" for b in sam)
    assert len(spark) == 2  # OCR + classify; a clean load raises no narration

    # The trace carries what each model returned, for the Pipeline page.
    assert result.trace is not None
    stages = {s.key: dict(s.details) for s in result.trace.stages}
    assert stages["spark_ocr"]["Model answer"].startswith("{")
    assert "1,000 in, 200 out" in stages["spark_ocr"]["Tokens"]
    assert stages["spark_ocr"]["Cost"] == "$0.0021"
    assert stages["sam_track"]['Prompt "truck bed"'] == "1 object on 2 of 2 frames"
    assert stages["sam_track"]["Billed"] == "100 frames (2 requests)"
    assert stages["geometry"]["Frames measured"] == "2"

    rows = {r.stage: r for r in await ledger.rows()}
    # Two video requests, each billed at the 50-frame minimum ($0.20 / 1k frames).
    assert rows["sam_track"].cost_usd == pytest.approx(0.02)
    # 1000 in at $1.25/1M + 200 out at $4.25/1M.
    assert rows["spark_ocr"].cost_usd == pytest.approx(0.0021)
    assert rows["spark_ocr"].tokens_in == 1000
    assert rows["spark_classify"].model == "muse-spark-1.3"
    assert ledger.summarize().total_cost_usd == pytest.approx(0.0242)


@pytest.mark.asyncio
async def test_image_goes_inline_and_bills_per_image() -> None:
    fake = FakeMeta(frames=1)
    result, ledger = await _run(_client(fake), kind="image")

    assert fake.uploads == [] and fake.deleted == []
    part = fake.responses[0]["input"][0]["content"][1]
    assert part["type"] == "input_image"
    assert part["image_url"].startswith("data:image/png;base64,")
    rows = {r.stage: r for r in await ledger.rows()}
    assert rows["sam_track"].cost_usd == pytest.approx(0.005)  # 2 images at $2.50 / 1k
    assert result.ticket.evidence_frames == ["haul.png"]


@pytest.mark.asyncio
async def test_spark_requests_use_strict_schema_and_wire_effort() -> None:
    fake = FakeMeta()
    await _run(_client(fake))
    by_task = {b["text"]["format"]["name"]: b for b in fake.responses if "text" in b}
    ocr, classify = by_task["spark_ocr"], by_task["spark_classify"]
    assert ocr["text"]["format"]["strict"] is True
    assert ocr["reasoning"] == {"effort": "low"}
    # The admin's "balanced" is sent as the API's "medium".
    assert classify["reasoning"] == {"effort": "medium"}
    assert classify["text"]["format"]["schema"]["properties"]["debris_class"]["enum"][0]
    # Reasoning shares the output budget, so the cap must leave room for it.
    assert ocr["max_output_tokens"] >= 2000


@pytest.mark.asyncio
async def test_unreadable_placard_flags_identity_and_narrates() -> None:
    fake = FakeMeta(ocr={"truck_id": "", "readable": False, "confidence": 0.8, "seconds": 0})
    result, ledger = await _run(_client(fake))

    assert result.ticket.truck_id is None
    assert result.identity_confidence == 0.0
    flags = {a.type.value: a for a in result.anomalies}
    assert "identity_unreadable" in flags
    # Muse Spark phrased it, and the dash was cleaned out of the sentence.
    assert flags["identity_unreadable"].explanation == "Check the placard, it was hard to read."
    rows = {r.stage: r for r in await ledger.rows()}
    assert rows["anomalies"].cost_usd > 0


@pytest.mark.asyncio
async def test_concurrent_calls_share_one_preparation(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIA_INLINE_MAX_BYTES", "10")
    get_settings.cache_clear()
    fake = FakeMeta()
    client = _client(fake)
    clip = ClipMedia(content_hash="e" * 64, media_kind="video", filename="a.mp4", data=b"1" * 64)
    async with client.clip_session(clip.content_hash):
        await client.track(clip)
        await client.read_placard(clip)
        await client.classify_debris(clip)
    assert len(fake.uploads) == 1
    assert fake.deleted == ["file-123"]


@pytest.mark.asyncio
async def test_empty_media_is_a_request_error() -> None:
    from app.ai.meta_http import ModelAPIRequestError

    client = _client(FakeMeta())
    with pytest.raises(ModelAPIRequestError):
        await client.track(ClipMedia(content_hash="d" * 64))


@pytest.mark.asyncio
async def test_ping_returns_the_answer() -> None:
    word, usage = await _client(FakeMeta()).ping()
    assert word and usage.cost_usd > 0
