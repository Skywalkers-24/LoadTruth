"""LiveAIClient — real Meta Model API calls (SAM 3.1 + Muse Spark).

Selected by :func:`app.ai.factory.get_ai_client` when ``MODEL_API_KEY`` is set
and ``MOCK_AI`` is off. Implements the same :class:`~app.ai.base.AIClient`
protocol as the fixture-backed mock, so no caller changes between modes.

Per clip:

1. **Prepare the media once.** ffmpeg resamples and downscales the upload
   (:mod:`app.pipeline.transcode`). Small media goes inline as a base64 data
   URL; anything at or above ``media_inline_max_bytes`` is uploaded once to the
   Files API and every call references the same ``file_id``. Concurrent calls
   for the same clip share one preparation. :meth:`clip_session` deletes the
   upload when the run ends (it also expires on its own after
   ``media_file_ttl_s``).
2. **SAM 3.1 track** — one streamed request per concept (the API accepts one
   noun phrase per request), both in parallel, parsed and measured by
   :mod:`app.ai.sam_measure`.
3. **Muse Spark OCR and classify** — non-streaming requests with a strict JSON
   schema (``text.format``), model and effort from the admin AI config.
4. **Muse Spark narration** — one plain sentence per anomaly.

Every call reports a :class:`~app.ai.base.CallUsage` (tokens, latency, dollars)
so the orchestrator's cost ledger is exact.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, replace
from typing import Any

from app.ai.base import (
    CallUsage,
    ClassifyResult,
    ClipMedia,
    Narration,
    OCRResult,
    TrackResult,
)
from app.ai.config_store import get_ai_config_store
from app.ai.meta_http import (
    MetaHTTP,
    ModelAPIRequestError,
    ModelAPIResponseError,
    output_text,
)
from app.ai.pricing import sam_cost_usd, spark_cost_usd, token_counts
from app.ai.request_params import params_for
from app.ai.sam_measure import Detection, frames_covered, measure, parse_segmentation
from app.config import get_settings
from app.log import get_logger
from app.pipeline.media import SendMethod, plan_transport
from app.pipeline.transcode import prepare_media

log = get_logger("ai.live")

DEBRIS_CLASSES = (
    "vegetative",
    "construction_demolition",
    "white_goods",
    "hazardous",
    "other",
)

_OCR_PROMPT = (
    "This is evidence footage of a disaster-debris haul truck at a monitoring site. "
    "Find the truck's identification placard: the truck number painted or posted on "
    "the truck, for example FL-DT-3391. Return truck_id exactly as printed, in "
    "uppercase, keeping hyphens. If no placard is legible, set readable to false and "
    "truck_id to an empty string. confidence is your probability, from 0 to 1, that "
    "truck_id is exactly right. seconds is the time in the video of the clearest view "
    "of the placard; use 0 for a still image."
)

_CLASSIFY_PROMPT = (
    "This is evidence footage of a disaster-debris haul truck. Classify the load in "
    "the truck bed into one debris class: vegetative (trees, limbs, stumps, brush, "
    "leaves); construction_demolition (damaged building materials, lumber, drywall, "
    "roofing, concrete, carpet, furniture); white_goods (appliances such as "
    "refrigerators, washers, dryers, water heaters, air conditioners); hazardous "
    "(household chemicals, paint, batteries, propane tanks, oil, pesticides); other "
    "(anything else, or not visible). Pick the class that makes up most of the load. "
    "confidence is your probability, from 0 to 1, that the class is right."
)

_NARRATE_PROMPT = (
    "Write one plain sentence of at most 30 words for a debris monitor, explaining why "
    "this load was flagged for review and what to check. Use only the facts given and "
    "do not invent numbers. Do not use dashes or parentheses. Reply with the sentence "
    "only."
)

_OCR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "truck_id": {"type": "string"},
        "readable": {"type": "boolean"},
        "confidence": {"type": "number"},
        "seconds": {"type": "number"},
    },
    "required": ["truck_id", "readable", "confidence", "seconds"],
    "additionalProperties": False,
}

_CLASSIFY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "debris_class": {"type": "string", "enum": list(DEBRIS_CLASSES)},
        "confidence": {"type": "number"},
    },
    "required": ["debris_class", "confidence"],
    "additionalProperties": False,
}


@dataclass(frozen=True, slots=True)
class PreparedMedia:
    """A clip ready to reference in any request: one content part for all calls."""

    media_kind: str
    mime: str
    size_bytes: int
    part: dict[str, str]
    file_id: str | None = None


@dataclass(frozen=True, slots=True)
class _SegmentRun:
    detections: list[Detection]
    usage: CallUsage


def _clamp01(value: object) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, number))


def _json_answer(response: Mapping[str, Any]) -> dict[str, Any]:
    text = output_text(response).strip()
    if not text:
        raise ModelAPIResponseError("The model returned an empty answer.")
    try:
        answer = json.loads(text)
    except ValueError as exc:
        raise ModelAPIResponseError("The model answer was not valid JSON.") from exc
    if not isinstance(answer, dict):
        raise ModelAPIResponseError("The model answer was not a JSON object.")
    return answer


def _clean_sentence(text: str) -> str:
    one_line = " ".join(text.split())
    return one_line.replace(" — ", ", ").replace("—", ", ").replace("–", "-").strip(' "')


class LiveAIClient:
    """Calls SAM 3.1 and Muse Spark over the Meta Model API."""

    def __init__(self, http: MetaHTTP | None = None) -> None:
        s = get_settings()
        self._http = http or MetaHTTP(
            api_key=s.model_api_key,
            base_url=s.model_api_base_url,
            timeout_s=s.model_api_timeout_s,
            max_retries=s.model_api_max_retries,
        )
        self._lock = asyncio.Lock()
        self._prepared: dict[str, asyncio.Task[PreparedMedia]] = {}
        self._refs: dict[str, int] = {}

    # ── media lifecycle ──────────────────────────────────────────────────────
    @asynccontextmanager
    async def clip_session(self, content_hash: str) -> AsyncIterator[None]:
        """Scope one pipeline run; delete the clip's upload when the last run ends."""
        async with self._lock:
            self._refs[content_hash] = self._refs.get(content_hash, 0) + 1
        try:
            yield
        finally:
            task: asyncio.Task[PreparedMedia] | None = None
            async with self._lock:
                remaining = self._refs.get(content_hash, 1) - 1
                if remaining <= 0:
                    self._refs.pop(content_hash, None)
                    task = self._prepared.pop(content_hash, None)
                else:
                    self._refs[content_hash] = remaining
            await self._discard(task)

    async def _discard(self, task: asyncio.Task[PreparedMedia] | None) -> None:
        if task is None:
            return
        if not task.done():
            task.cancel()
            return
        if task.cancelled() or task.exception() is not None:
            return
        file_id = task.result().file_id
        if file_id:
            await self._http.delete_file(file_id)

    async def _media(self, clip: ClipMedia) -> PreparedMedia:
        async with self._lock:
            task = self._prepared.get(clip.content_hash)
            if task is None or (task.done() and (task.cancelled() or task.exception())):
                task = asyncio.create_task(self._prepare(clip))
                self._prepared[clip.content_hash] = task
        return await asyncio.shield(task)

    async def _prepare(self, clip: ClipMedia) -> PreparedMedia:
        if not clip.data:
            raise ModelAPIRequestError("No media bytes were provided for this clip.")
        s = get_settings()
        prepared = await prepare_media(
            clip.data, media_kind=clip.media_kind, filename=clip.filename
        )
        plan = plan_transport(len(prepared.data))
        kind = "input_image" if clip.media_kind == "image" else "input_video"
        if plan.send_method is SendMethod.UPLOAD:
            ext = "jpg" if clip.media_kind == "image" else "mp4"
            file_id = await self._http.upload_file(
                prepared.data,
                filename=f"{clip.content_hash[:16]}.{ext}",
                mime=prepared.mime,
                ttl_s=s.media_file_ttl_s,
            )
            part = {"type": kind, "file_id": file_id}
        else:
            b64 = base64.b64encode(prepared.data).decode("ascii")
            url_key = "image_url" if clip.media_kind == "image" else "video_url"
            part = {"type": kind, url_key: f"data:{prepared.mime};base64,{b64}"}
            file_id = None
        log.info(
            "live_media_ready",
            media_kind=clip.media_kind,
            size_bytes=len(prepared.data),
            transcoded=prepared.transcoded,
            send_method=plan.send_method.value,
        )
        return PreparedMedia(clip.media_kind, prepared.mime, len(prepared.data), part, file_id)

    # ── SAM 3.1 ──────────────────────────────────────────────────────────────
    async def track(self, clip: ClipMedia) -> TrackResult:
        media = await self._media(clip)
        s = get_settings()
        bed, load = await asyncio.gather(
            self._segment(media, s.sam_bed_concept),
            self._segment(media, s.sam_load_concept),
        )
        result = await asyncio.to_thread(
            measure,
            bed.detections,
            load.detections,
            media_kind=media.media_kind,
            max_frames=s.max_sampled_frames,
        )
        log.info(
            "sam_track_done",
            bed_detections=len(bed.detections),
            load_detections=len(load.detections),
            frames=result.frame_count,
            cost_usd=bed.usage.cost_usd + load.usage.cost_usd,
        )
        return replace(result, usage=bed.usage.plus(load.usage))

    async def _segment(self, media: PreparedMedia, concept: str) -> _SegmentRun:
        model = get_ai_config_store().resolve("sam_track").model
        payload = {
            "model": model,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": concept}, media.part],
                }
            ],
            "metadata": {"mask_encoding": "one_bit"},
        }
        streamed = await self._http.stream_response(payload)
        detections = await asyncio.to_thread(
            parse_segmentation, streamed.text, media_kind=media.media_kind
        )
        frames = 1 if media.media_kind == "image" else frames_covered(detections)
        cost = sam_cost_usd(streamed.usage, media_kind=media.media_kind, frames_seen=frames)
        usage = CallUsage(model=model, latency_ms=streamed.latency_ms, cost_usd=cost)
        return _SegmentRun(detections, usage)

    # ── Muse Spark ───────────────────────────────────────────────────────────
    async def _spark(
        self, task_id: str, content: list[dict[str, str]], schema: dict[str, Any] | None
    ) -> tuple[dict[str, Any], CallUsage]:
        params = params_for(task_id)
        payload: dict[str, Any] = {
            **params.as_request_kwargs(),
            "input": [{"type": "message", "role": "user", "content": content}],
        }
        if schema is not None:
            payload["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": task_id,
                    "schema": schema,
                    "strict": True,
                }
            }
        started = time.perf_counter()
        response = await self._http.create_response(payload)
        latency = round((time.perf_counter() - started) * 1000, 1)
        raw_usage = response.get("usage")
        usage_block: Mapping[str, object] = raw_usage if isinstance(raw_usage, Mapping) else {}
        tokens_in, _, tokens_out = token_counts(usage_block)
        usage = CallUsage(
            model=params.model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=latency,
            cost_usd=spark_cost_usd(params.model, usage_block),
        )
        return response, usage

    async def read_placard(self, clip: ClipMedia) -> OCRResult:
        media = await self._media(clip)
        response, usage = await self._spark(
            "spark_ocr", [{"type": "input_text", "text": _OCR_PROMPT}, media.part], _OCR_SCHEMA
        )
        answer = _json_answer(response)
        raw_id = str(answer.get("truck_id") or "").strip().upper()
        readable = bool(answer.get("readable")) and bool(raw_id)
        seconds = max(0.0, float(answer.get("seconds") or 0.0))
        image = clip.media_kind == "image"
        frame_ref = (clip.filename or "image") if image else f"{seconds:.1f}s"
        return OCRResult(
            truck_id=raw_id if readable else None,
            confidence=_clamp01(answer.get("confidence")) if readable else 0.0,
            frame_ref=frame_ref,
            usage=usage,
        )

    async def classify_debris(self, clip: ClipMedia) -> ClassifyResult:
        media = await self._media(clip)
        response, usage = await self._spark(
            "spark_classify",
            [{"type": "input_text", "text": _CLASSIFY_PROMPT}, media.part],
            _CLASSIFY_SCHEMA,
        )
        answer = _json_answer(response)
        debris = str(answer.get("debris_class") or "other")
        return ClassifyResult(
            debris_class=debris if debris in DEBRIS_CLASSES else "other",
            confidence=_clamp01(answer.get("confidence")),
            usage=usage,
        )

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> Narration:
        lines = "\n".join(f"{k}: {v}" for k, v in facts.items())
        prompt = f"{_NARRATE_PROMPT}\n\nFlag: {anomaly_type.replace('_', ' ')}\n{lines}"
        response, usage = await self._spark(
            "narrate_anomaly", [{"type": "input_text", "text": prompt}], None
        )
        text = _clean_sentence(output_text(response))
        if not text:
            raise ModelAPIResponseError("The model returned an empty narration.")
        return Narration(text=text, usage=usage)

    async def ping(self) -> tuple[str, CallUsage]:
        """A one-word Spark call to confirm the key, endpoint, and model work."""
        response, usage = await self._spark(
            "narrate_anomaly",
            [{"type": "input_text", "text": "Reply with the single word: ready"}],
            None,
        )
        return output_text(response).strip(), usage

    async def aclose(self) -> None:
        await self._http.aclose()
