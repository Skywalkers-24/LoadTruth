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

    def __init__(
        self,
        *,
        frames: int = 2,
        ocr: dict[str, Any] | None = None,
        visual_fill: float | None = None,
        frame_fill_pcts: list[float | None] | None = None,
        named_load: list[str] | None = None,
    ) -> None:
        self.named_load = (
            named_load
            if named_load is not None
            else ["steel drums", "broken lumber", "concrete rubble"]
        )
        self.frames = frames
        self.visual_fill = visual_fill
        self.frame_fill_pcts = frame_fill_pcts
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
            line = (
                _bed_line
                if concept in {"truck bed", "open truck bed interior", "dump truck bed"}
                else _load_line
            )
            text = "\n".join(line(f) for f in range(self.frames)) + "\n"
            image = body["input"][0]["content"][1]["type"] == "input_image"
            usage = {"images_processed": 1} if image else {}
            return httpx.Response(
                200, headers={"content-type": "text/event-stream"}, content=_sse(text, usage)
            )
        task = (body.get("text") or {}).get("format", {}).get("name")
        if task == "name_load":
            answer = {
                "concepts": self.named_load,
                "load_concept": "mixed construction debris",
                "debris_class": "construction_demolition",
                "visible_fill_pct": self.visual_fill or 50.0,
                "truck_present": True,
                "presence_confidence": 0.99,
            }
            return httpx.Response(200, json=_spark(json.dumps(answer)))
        if task == "spark_ocr":
            ocr = {"analysis": "I read the placard from the clearest frame.", **self.ocr}
            return httpx.Response(200, json=_spark(json.dumps(ocr)))
        if task == "spark_classify":
            content = body["input"][0]["content"]
            frame_count = sum(part["type"] == "input_image" for part in content)
            estimates = (
                self.frame_fill_pcts
                or [self.visual_fill if self.visual_fill is not None else 50.0] * frame_count
            )
            answer = {
                "debris_class": "construction_demolition",
                "confidence": 0.9,
                "frame_fill_pcts": estimates,
                "analysis": "The load is mostly damaged building materials.",
            }
            return httpx.Response(200, json=_spark(json.dumps(answer)))
        if task == "explain_pipeline":
            answer = {
                "sam_track": "I tracked the truck, bed, and debris across the frames.",
                "capacity": "The truck matched a certified record.",
                "geometry": "Muse Spark estimated fill visually in each frame.",
                "anomalies": "The rules found nothing to flag.",
                "dollar_math": "I valued the load by exact arithmetic.",
            }
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

    async def _keyframes(data: bytes, mime: str, media_kind: str) -> list[dict[str, str]]:
        count = 1 if media_kind == "image" else 4
        parts: list[dict[str, str]] = []
        for index in range(count):
            parts.extend(
                [
                    {"type": "input_text", "text": f"Frame {index + 1}."},
                    {
                        "type": "input_image",
                        "image_url": f"data:{mime};base64,ZmFrZQ==",
                    },
                ]
            )
        return parts

    monkeypatch.setattr(live_module, "prepare_media", _same)
    monkeypatch.setattr(live_module, "meta_keyframe_parts", _keyframes)
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


class RecoveryMeta(FakeMeta):
    def __init__(self, *, missing: set[str], present: bool = True) -> None:
        super().__init__()
        self.missing, self.present = missing, present

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/responses"):
            body = json.loads(request.content)
            if body["model"].startswith("sam"):
                concept = body["input"][0]["content"][0]["text"]
                if concept in self.missing:
                    self.responses.append(body)
                    return httpx.Response(
                        200,
                        headers={"content-type": "text/event-stream"},
                        content=_sse("", {"video_frames_processed": 2}),
                    )
            elif (body.get("text") or {}).get("format", {}).get("name") == "name_load":
                self.responses.append(body)
                return httpx.Response(
                    200,
                    json=_spark(
                        json.dumps(
                            {
                                "concepts": ["steel drums"] if self.present else [],
                                "load_concept": "mixed hazardous waste" if self.present else "",
                                "debris_class": "construction_demolition"
                                if self.present
                                else "other",
                                "visible_fill_pct": 50 if self.present else 0,
                                "truck_present": self.present,
                                "presence_confidence": 0.99,
                            }
                        )
                    ),
                )
        return super().handler(request)


@pytest.mark.asyncio
async def test_real_alternate_bed_prompt_only_after_primary_miss() -> None:
    fake = RecoveryMeta(missing={"truck bed"})
    result, _ = await _run(_client(fake))
    assert not result.no_truck
    track = next(s for s in result.trace.stages if s.key == "sam_track")
    assert dict(track.details)["Bed measured from"] == '"dump truck bed"'
    assert sum(b["model"].startswith("sam") for b in fake.responses) == 6


@pytest.mark.asyncio
async def test_confirmed_truck_continues_without_bed_masks_and_reverifies(sessionmaker) -> None:
    fake = RecoveryMeta(missing={"truck bed", "dump truck bed"})
    result, _ = await _run(_client(fake))
    assert not result.no_truck
    assert result.ticket.est_fill_pct == Decimal("50.00")
    assert result.anomalies == []
    stage = next(s for s in result.trace.stages if s.key == "sam_track")
    assert stage.status == "skipped"
    assert dict(stage.details)["Bed segmentation"] == "Unavailable"
    assert "unavailable" in stage.summary
    from app.ai import serde
    from app.ai.base import ClassifyResult, TrackResult
    from app.tickets.repository import SqlTicketRepository

    async with sessionmaker() as session:
        repo = SqlTicketRepository(session)
        await repo.add_from_pipeline(result.ticket, [])
        await repo.save_ticket_evidence(
            DEMO_TENANT_ID,
            result.ticket.id,
            content_hash="f" * 64,
            media_kind="video",
            mime="video/mp4",
            fps=6,
            segments=result.segments,
        )
        track = TrackResult(
            objects=[],
            frame_count=2,
            segments=result.segments,
            truck_present=True,
            presence_confidence=0.99,
        )
        payload = serde.track_to_json(track)
        assert serde.track_from_json(payload).truck_present is True
        await repo.save_ai_stage_result(
            DEMO_TENANT_ID, "f" * 64, serde.STAGE_TRACK, result_json=payload
        )
        await repo.save_ai_stage_result(
            DEMO_TENANT_ID,
            "f" * 64,
            serde.STAGE_CLASSIFY,
            result_json=serde.classify_to_json(
                ClassifyResult(
                    "construction_demolition",
                    0.9,
                    frame_fill_pcts=(50.0, 50.0),
                    visual_fill_pct=50.0,
                )
            ),
        )
        verified = await repo.reverify_ticket(DEMO_TENANT_ID, result.ticket.id)
        assert verified.reproducible
        assert verified.receipt_inputs["bed_area"] == 0


@pytest.mark.asyncio
async def test_empty_scene_stops_before_any_sam_or_downstream_call() -> None:
    fake = RecoveryMeta(missing=set(), present=False)
    result, _ = await _run(_client(fake))
    assert result.no_truck
    assert result.trace.outcome == "no_truck"
    assert len(fake.responses) == 1
    assert not any(b["model"].startswith("sam") for b in fake.responses)


@pytest.mark.asyncio
async def test_missing_load_masks_are_truthful_trace_details_without_anomaly() -> None:
    fake = RecoveryMeta(missing={"steel drums", "mixed hazardous waste"})
    result, _ = await _run(_client(fake))
    assert not result.no_truck
    assert result.anomalies == []
    stage = next(s for s in result.trace.stages if s.key == "sam_track")
    assert "load masks were not detected" in stage.summary
    assert dict(stage.details)["Load segmentation"] == "Unavailable"


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
    # The overlay keys plus the tailgate rim and every load phrase, kept so a
    # later measurement change can re-measure offline.
    # Muse Spark supplied the per-clip broad material and specific visible items.
    assert set(result.segments) == {
        "truck bed",
        "truck body",
        "debris pile",
        "tailgate",
        "load: steel drums",
        "load: mixed construction debris",
        "load: broken lumber",
        "load: concrete rubble",
    }
    assert result.segments["truck bed"].startswith("<0f>0<|box;")
    from app.pipeline import evidence_store

    assert await evidence_store.load("f" * 64) is not None

    # One upload served every call, and it was deleted when the run ended.
    assert len(fake.uploads) == 1
    assert fake.deleted == ["file-123"]
    sam = [b for b in fake.responses if b["model"].startswith("sam")]
    spark = [b for b in fake.responses if not b["model"].startswith("sam")]
    # Bed phrases, the tailgate rim, and the load phrases all go out in parallel.
    assert sorted(b["input"][0]["content"][0]["text"] for b in sam) == sorted(
        [
            "concrete rubble",
            "truck",
            "broken lumber",
            "truck bed",
            "steel drums",
            "mixed construction debris",
            "tailgate",
        ]
    )
    classify_body = next(
        body
        for body in spark
        if (body.get("text") or {}).get("format", {}).get("name") == "spark_classify"
    )
    classify_content = classify_body["input"][0]["content"]
    assert sum(part["type"] == "input_image" for part in classify_content) == 4
    assert "SAM" not in classify_content[0]["text"]
    assert "pixel-area ratios" in classify_content[0]["text"]
    for body in fake.responses:
        content = body["input"][0]["content"]
        if (body.get("text") or {}).get("format", {}).get("name") != "spark_classify":
            media_parts = [part for part in content if part["type"] != "input_text"]
            if media_parts:
                assert media_parts == [{"type": "input_video", "file_id": "file-123"}]
    assert all(b["stream"] is True for b in sam)
    assert all(b["metadata"]["mask_encoding"] == "one_bit" for b in sam)
    # name_load (names the SAM load concept) + OCR + classify + the batched
    # per-stage analysis; a clean load raises no anomaly narration.
    assert len(spark) == 4
    spark_tasks = {(b.get("text") or {}).get("format", {}).get("name") for b in spark}
    assert spark_tasks == {"name_load", "spark_ocr", "spark_classify", "explain_pipeline"}

    # The trace carries what each model returned, for the Pipeline page.
    assert result.trace is not None
    stages = {s.key: dict(s.details) for s in result.trace.stages}
    assert stages["spark_ocr"]["Model answer"].startswith("{")
    assert "1,000 in, 200 out" in stages["spark_ocr"]["Tokens"]
    assert stages["spark_ocr"]["Cost"] == "$0.0021"
    assert stages["sam_track"]['Prompt "truck bed"'] == "1 object on 2 of 2 frames"
    assert stages["sam_track"]["Billed"] == "350 frames (7 requests)"
    assert stages["sam_track"]["Bed measured from"] == '"truck bed"'
    assert stages["sam_track"]["Load named by Muse Spark"] == (
        '"steel drums", "broken lumber", "concrete rubble"'
    )
    assert stages["sam_track"]["Broad load concept from Muse Spark"] == (
        "mixed construction debris"
    )
    assert stages["geometry"]["Frames estimated"] == "4"
    assert stages["geometry"]["SAM used for fill"] == "No"
    assert stages["geometry"]["Muse per-frame fill"] == "50.00%, 50.00%, 50.00%, 50.00%"

    # Meta AI authored the per-stage "AI analysis": OCR/classify carry their own,
    # and the batched explain_pipeline call fills in the rest.
    analysis = {s.key: s.analysis for s in result.trace.stages}
    assert analysis["spark_ocr"] == "I read the placard from the clearest frame."
    assert analysis["spark_classify"] == "The load is mostly damaged building materials."
    assert analysis["sam_track"] == "I tracked the truck, bed, and debris across the frames."
    assert analysis["geometry"] == "Muse Spark estimated fill visually in each frame."
    assert analysis["dollar_math"] == "I valued the load by exact arithmetic."

    rows = {r.stage: r for r in await ledger.rows()}
    # Seven SAM video requests at the 50-frame minimum ($0.07) plus the name_load
    # Spark call folded into this stage ($0.0021).
    assert rows["sam_track"].cost_usd == pytest.approx(0.0721)
    # 1000 in at $1.25/1M + 200 out at $4.25/1M.
    assert rows["spark_ocr"].cost_usd == pytest.approx(0.0021)
    assert rows["spark_ocr"].tokens_in == 1000
    assert rows["spark_classify"].model == "muse-spark-1.3"
    # The batched per-stage analysis is one more Spark call, billed like the rest.
    assert rows["spark_explain"].cost_usd == pytest.approx(0.0021)
    assert rows["spark_explain"].model == "muse-spark-1.3"
    assert ledger.summarize().total_cost_usd == pytest.approx(0.0784)


@pytest.mark.asyncio
async def test_image_goes_inline_and_bills_per_image() -> None:
    fake = FakeMeta(frames=1)
    result, ledger = await _run(_client(fake), kind="image")

    assert fake.uploads == [] and fake.deleted == []
    sam = next(b for b in fake.responses if b["model"].startswith("sam"))
    part = sam["input"][0]["content"][1]
    assert part["type"] == "input_image"
    assert part["image_url"].startswith("data:image/png;base64,")
    rows = {r.stage: r for r in await ledger.rows()}
    # 7 SAM images at $2.50 / 1k ($0.0175) plus name_load ($0.0021).
    assert rows["sam_track"].cost_usd == pytest.approx(0.0196)
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
    assert classify["text"]["format"]["schema"]["properties"]["frame_fill_pcts"]["type"] == "array"
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
async def test_muse_multiframe_median_sets_two_decimal_fill() -> None:
    """Muse frame estimates, not SAM's projected mask coverage, set ticket fill."""
    fake = FakeMeta(frame_fill_pcts=[91.23, 89.87, 90.01, 40.0])
    result, _ = await _run(_client(fake))

    assert result.ticket.est_fill_pct == Decimal("89.94")
    assert result.trace is not None
    geometry = dict(next(s for s in result.trace.stages if s.key == "geometry").details)
    assert geometry["Muse per-frame fill"] == "91.23%, 89.87%, 90.01%, 40.00%"
    assert geometry["Muse combined fill (median)"] == "89.94%"
    assert geometry["Fill selected from"] == "Muse Spark per-frame median"
    assert geometry["Fill"] == "89.94%"
    assert geometry["SAM used for fill"] == "No"
    assert "SAM mask-based fill" not in geometry
    assert "low_confidence" not in {a.type.value for a in result.anomalies}


@pytest.mark.asyncio
async def test_obstructed_frames_do_not_bias_fill_toward_empty() -> None:
    fake = FakeMeta(frame_fill_pcts=[None, 49.5, 50.5, None])
    result, _ = await _run(_client(fake))

    assert result.ticket.est_fill_pct == Decimal("50.00")
    assert result.trace is not None
    geometry = dict(next(s for s in result.trace.stages if s.key == "geometry").details)
    assert geometry["Frames estimated"] == "2"
    assert geometry["Muse per-frame fill"] == "49.50%, 50.50%"


@pytest.mark.asyncio
async def test_unassessable_clip_does_not_produce_a_guessed_ticket_fill() -> None:
    from app.ai.meta_http import ModelAPIResponseError

    fake = FakeMeta(frame_fill_pcts=[None, None, None, None])
    with pytest.raises(ModelAPIResponseError, match="could not assess truck fill"):
        await _run(_client(fake))


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


@pytest.mark.asyncio
async def test_answer_question_returns_model_text_with_usage() -> None:
    """The analyst free-form path returns Muse Spark's text and priced usage."""
    narration = await _client(FakeMeta()).answer_question("What is the flagged exposure?")
    assert narration.text  # the fake returns a non-empty answer
    assert narration.usage is not None
    assert narration.usage.cost_usd > 0
    assert narration.usage.model == "muse-spark-1.3"
