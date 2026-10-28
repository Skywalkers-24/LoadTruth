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
import re
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
    StageExplanations,
    TrackResult,
)
from app.ai.config_store import get_ai_config_store
from app.ai.meta_http import (
    MetaHTTP,
    ModelAPIRequestError,
    ModelAPIResponseError,
    output_text,
)
from app.ai.pricing import sam_billed_units, sam_cost_usd, spark_cost_usd, token_counts
from app.ai.request_params import params_for
from app.ai.sam_measure import (
    BED_FROM_BED,
    BED_FROM_TRUCK,
    BED_LABEL,
    LOAD_LABEL,
    LOAD_PREFIX,
    RIM_LABEL,
    Detection,
    frames_covered,
    measure,
    parse_segmentation,
)
from app.config import get_settings
from app.log import get_logger
from app.pipeline import evidence_store
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

# Shared voice for every "analysis" field shown on the console. Impersonal and
# declarative, like an audit report, never a chatbot narrating itself ("I ...").
_ANALYSIS_STYLE = (
    "Write it for an operations console in an impersonal, declarative voice, the way a "
    "monitoring report reads. State what was found and what it means. Never use first "
    "person ('I', 'my', 'we') and do not address the reader. Name the stage or model "
    "doing the work when it helps (for example 'SAM 3.1 segmented ...', 'Muse Spark "
    "read ...'). Be concise and confident and do not use dashes or parentheses."
)

_OCR_PROMPT = (
    "This is evidence footage of a disaster-debris haul truck at a monitoring site. "
    "Find the truck's identification placard: the truck number painted or posted on "
    "the truck, for example FL-DT-3391. Return truck_id exactly as printed, in "
    "uppercase, keeping hyphens. If no placard is legible, set readable to false and "
    "truck_id to an empty string. confidence is your probability, from 0 to 1, that "
    "truck_id is exactly right. seconds is the time in the video of the clearest view "
    "of the placard; use 0 for a still image. analysis is two or three plain sentences "
    f"explaining what the placard read was and why it matters. {_ANALYSIS_STYLE}"
)

_CLASSIFY_PROMPT = (
    "This is evidence footage of a disaster-debris haul truck. Classify the load in "
    "the truck bed into one debris class: vegetative (trees, limbs, stumps, brush, "
    "leaves); construction_demolition (damaged building materials, lumber, drywall, "
    "roofing, concrete, carpet, furniture); white_goods (appliances such as "
    "refrigerators, washers, dryers, water heaters, air conditioners); hazardous "
    "(household chemicals, paint, batteries, propane tanks, oil, pesticides); other "
    "(anything else, or not visible). Pick the class that makes up most of the load. "
    "confidence is your probability, from 0 to 1, that the class is right. fill_pct is "
    "your visual estimate, from 0 to 100, of how full the truck bed is by volume: 0 is "
    "an empty bed, 100 is a load level with the top of the side walls across the whole "
    "bed; judge it on the frames where the bed is closest and most visible. analysis is "
    "two or three plain sentences explaining what the load is and why that class was "
    f"chosen. {_ANALYSIS_STYLE}"
)

_NAME_LOAD_PROMPT = (
    "This is evidence footage of a haul truck at a debris site. Look at the material "
    "loaded in the open truck bed and give short noun phrases naming it, so an image "
    "segmentation model can find every piece of it. Rules for each phrase: name the "
    "thing itself, not the truck or the bed; use a concrete noun phrase of one to four "
    "words, like 'tree branches', 'broken concrete', 'barrels and containers', "
    "'household furniture', 'metal appliances'; no sentences, questions, colors unless "
    "they matter, or the word 'debris' alone. Return concepts as one to three phrases "
    "ordered best first, covering the load if it is mixed. If the bed looks empty, "
    "return an empty list. visible_fill_pct is your estimate from 0 to 100 of how full "
    "the bed is by volume."
)

_NAME_LOAD_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "concepts": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
        "visible_fill_pct": {"type": "number"},
    },
    "required": ["concepts", "visible_fill_pct"],
    "additionalProperties": False,
}

_NARRATE_PROMPT = (
    "Write one plain sentence of at most 30 words for a debris monitor, explaining why "
    "this load was flagged for review and what to check. Use only the facts given and "
    "do not invent numbers. Do not use dashes or parentheses. Reply with the sentence "
    "only."
)

_EXPLAIN_STAGES = ("sam_track", "capacity", "geometry", "anomalies", "dollar_math")

_EXPLAIN_PROMPT = (
    "Write the 'AI analysis' shown on an operations console beside each stage of a "
    "disaster-debris measurement pipeline. Below are the measured facts for one "
    "truckload, already computed by the pipeline. For each stage, write two or three "
    "plain sentences explaining what that stage did and what its result means for this "
    "load. Use only the facts given and never invent numbers. "
    f"{_ANALYSIS_STYLE} "
    "The stages are: sam_track (SAM 3.1 segmented and tracked the truck, bed, and load "
    "across the frames, producing the masks every later measurement reads); capacity "
    "(the identified truck was looked up in the certified registry for its registered "
    "cubic-yard capacity); geometry (a deterministic estimator turned the masks into a "
    "fill percentage from the bed opening coverage); anomalies (deterministic rules "
    "checked the facts and raised any flags); dollar_math (exact arithmetic multiplies "
    "fill percent by certified capacity for cubic yards, then by the rate for the "
    "dollar value). State plainly that capacity, geometry, anomalies, and dollar_math "
    "are deterministic steps, not model judgements, while sam_track is the vision "
    "model's own work."
)

_EXPLAIN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {key: {"type": "string"} for key in _EXPLAIN_STAGES},
    "required": list(_EXPLAIN_STAGES),
    "additionalProperties": False,
}

_OCR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "truck_id": {"type": "string"},
        "readable": {"type": "boolean"},
        "confidence": {"type": "number"},
        "seconds": {"type": "number"},
        "analysis": {"type": "string"},
    },
    "required": ["truck_id", "readable", "confidence", "seconds", "analysis"],
    "additionalProperties": False,
}

_CLASSIFY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "debris_class": {"type": "string", "enum": list(DEBRIS_CLASSES)},
        "confidence": {"type": "number"},
        "fill_pct": {"type": "number"},
        "analysis": {"type": "string"},
    },
    "required": ["debris_class", "confidence", "fill_pct", "analysis"],
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
    text: str = ""
    billed_units: int = 0  # images or video frames SAM billed for this request


# Raw SAM text kept per concept for the Review overlay (about 400 chars per
# object per frame); a very long clip beyond this keeps its measurements only.
_MAX_SEGMENT_CHARS = 4_000_000


def _clamp01(value: object) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, number))


def _visual_fill(value: object) -> float | None:
    """Spark's visual fill read as 0..100, or None when absent or not a number."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return round(max(0.0, min(100.0, float(value))), 1)


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


def _describe_run(run: _SegmentRun, media_kind: str) -> str:
    """'2 objects on 30 of 30 frames' for one SAM concept request."""
    ids = {d.object_id for d in run.detections}
    if not ids:
        return "No match"
    noun = "object" if len(ids) == 1 else "objects"
    if media_kind == "image":
        return f"{len(ids)} {noun}"
    with_hits = len({d.frame for d in run.detections})
    return f"{len(ids)} {noun} on {with_hits} of {frames_covered(run.detections)} frames"


def _track_notes(
    media: PreparedMedia,
    runs: dict[str, _SegmentRun],
    bed_concept: str,
    rim_concept: str,
    load_concepts: list[str],
) -> dict[str, str]:
    """Plain facts about what SAM returned, shown in the pipeline trace."""
    texts = "".join(r.text for r in runs.values())
    size = re.search(r";w=(\d+);h=(\d+)", texts)
    sent = "uploaded file" if media.file_id else "inline"
    resolution = f"{size.group(1)}x{size.group(2)}, " if size else ""
    unit = "images" if media.media_kind == "image" else "frames"
    notes = {f'Prompt "{c}"': _describe_run(r, media.media_kind) for c, r in runs.items()}
    notes["Bed measured from"] = f'"{bed_concept}"'
    notes["Rim measured from"] = f'"{rim_concept}"'
    notes["Load phrases merged"] = ", ".join(f'"{c}"' for c in load_concepts)
    notes["Media sent"] = f"{resolution}{media.size_bytes / 1_000_000:.1f} MB, {sent}"
    notes["Billed"] = f"{sum(r.billed_units for r in runs.values())} {unit} ({len(runs)} requests)"
    slowest = max((r.usage.latency_ms for r in runs.values()), default=0.0)
    notes["SAM response time"] = f"{slowest / 1000:.1f} s, all requests in parallel"
    return notes


def _in_bed_pixels(load: list[Detection], bed: list[Detection]) -> int:
    """Box-overlap area of a load phrase's detections with the bed, all frames."""
    beds: dict[int, list[Detection]] = {}
    for d in bed:
        beds.setdefault(d.frame, []).append(d)
    total = 0
    for ld in load:
        for b in beds.get(ld.frame, []):
            width = min(ld.box.right, b.box.right) - max(ld.box.left, b.box.left)
            height = min(ld.box.bottom, b.box.bottom) - max(ld.box.top, b.box.top)
            if width > 0 and height > 0:
                total += width * height
    return total


def _sum_usage(base: CallUsage, others: list[CallUsage]) -> CallUsage:
    """Fold the usage of retried SAM requests into one stage's usage."""
    total = base
    for u in others:
        total = total.plus(u)
    return total


def _clean_sentence(text: str) -> str:
    one_line = " ".join(text.split())
    return one_line.replace(" — ", ", ").replace("—", ", ").replace("–", "-").strip(' "')


def _clean_concept(text: object) -> str:
    """Normalize a model-named SAM concept: a short lowercase noun phrase.

    SAM ignores case and punctuation, so we only trim junk, drop a bare
    'debris' (too generic, matches nothing useful), and cap the length so a
    stray sentence can't become a prompt."""
    if not isinstance(text, str):
        return ""
    words = "".join(c for c in text.lower() if c.isalnum() or c.isspace()).split()
    if not words or words == ["debris"]:
        return ""
    return " ".join(words[:5])


def _clean_paragraph(text: str) -> str:
    """Normalize a model paragraph for the UI: collapse whitespace and strip the
    em/en dashes the UI copy rule forbids, while keeping multiple sentences."""
    collapsed = " ".join(text.split())
    return collapsed.replace(" — ", ", ").replace("—", ", ").replace("–", "-").strip(' "')


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
        # Keep the exact media the models see, so the Review console can play it
        # under SAM's per-frame boxes and masks (a resampled video's fps maps
        # SAM frame indexes to playback time).
        is_video = clip.media_kind == "video"
        video_fps = prepared.fps if prepared.transcoded and is_video else None
        await evidence_store.save(
            clip.content_hash, prepared.data, mime=prepared.mime, fps=video_fps
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
    async def _name_load_concepts(self, media: PreparedMedia) -> tuple[list[str], CallUsage | None]:
        """Ask Muse Spark what noun phrases name the load, for SAM to segment.

        The vision model looks at the clip and names the load's shape (for
        example "barrels and containers", "tree branches"), so SAM is not tied
        to a fixed phrase list. Returns the cleaned phrases (best first) and the
        call's usage. On any failure returns no phrases; the caller falls back to
        the configured defaults, so naming can never break the run."""
        try:
            response, usage = await self._spark(
                "name_load",
                [{"type": "input_text", "text": _NAME_LOAD_PROMPT}, media.part],
                _NAME_LOAD_SCHEMA,
            )
            answer = _json_answer(response)
        except (ModelAPIResponseError, ModelAPIRequestError):
            return [], None
        raw = answer.get("concepts")
        phrases = [_clean_concept(p) for p in raw] if isinstance(raw, list) else []
        phrases = [p for p in dict.fromkeys(phrases) if p][: get_settings().sam_load_max_concepts]
        return phrases, usage

    async def track(self, clip: ClipMedia) -> TrackResult:
        media = await self._media(clip)
        s = get_settings()
        # Muse Spark names the load's shape first, so SAM segments what is
        # actually in the bed rather than a fixed phrase list. The configured
        # defaults are kept as a safety net appended after the named phrases, so
        # a strange model answer can never leave SAM with nothing to find.
        named, name_usage = await self._name_load_concepts(media)
        bed_concepts = list(dict.fromkeys(s.sam_bed_concepts))
        load_concepts = list(dict.fromkeys([*named, *s.sam_load_concepts]))[
            : max(1, s.sam_load_max_concepts)
        ]
        # Every concept goes to SAM in one parallel round: the bed phrases (in
        # priority order), the tailgate (the rear rim that bounds the opening),
        # and the load phrases (merged, since one phrase misses some loads).
        concepts = [*bed_concepts, s.sam_rim_concept, *load_concepts]
        runs = dict(
            zip(
                concepts,
                await asyncio.gather(*(self._segment(media, c) for c in concepts)),
                strict=True,
            )
        )
        bed_concept = next((c for c in bed_concepts if runs[c].detections), bed_concepts[0])
        bed, rim = runs[bed_concept], runs[s.sam_rim_concept]
        loads = [runs[c] for c in load_concepts]
        result = await asyncio.to_thread(
            measure,
            bed.detections,
            [d for run in loads for d in run.detections],
            media_kind=media.media_kind,
            max_frames=s.max_sampled_frames,
            rim_run=rim.detections,
        )
        # The load-naming Spark call is part of this stage's cost.
        sam_usages = [runs[c].usage for c in concepts[1:]]
        if name_usage is not None:
            sam_usages.append(name_usage)
        usage = _sum_usage(runs[concepts[0]].usage, sam_usages)
        log.info(
            "sam_track_done",
            named_load_concepts=named,
            bed_concept=bed_concept,
            bed_detections=len(bed.detections),
            rim_detections=len(rim.detections),
            load_detections=sum(len(r.detections) for r in loads),
            load_source=result.load_source,
            frames=result.frame_count,
            requests=len(concepts),
            cost_usd=usage.cost_usd,
        )
        # The overlay draws the bed and the load phrase that found the most;
        # every phrase's raw output is also kept so Re-measure can replay it.
        best_load = max(loads, key=lambda r: _in_bed_pixels(r.detections, bed.detections))
        segments = {
            BED_LABEL: bed.text,
            LOAD_LABEL: best_load.text,
            RIM_LABEL: rim.text,
            **{f"{LOAD_PREFIX}{c}": runs[c].text for c in load_concepts},
        }
        segments = {k: v for k, v in segments.items() if len(v) <= _MAX_SEGMENT_CHARS}
        notes = {
            **_track_notes(media, runs, bed_concept, s.sam_rim_concept, load_concepts),
            "Load named by Muse Spark": (
                ", ".join(f'"{c}"' for c in named) if named else "naming failed, used defaults"
            ),
            **result.notes,
        }
        bed_source = BED_FROM_BED if bed_concept == bed_concepts[0] else BED_FROM_TRUCK
        return replace(result, usage=usage, segments=segments, notes=notes, bed_source=bed_source)

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
        billed = sam_billed_units(streamed.usage, media_kind=media.media_kind, frames_seen=frames)
        usage = CallUsage(model=model, latency_ms=streamed.latency_ms, cost_usd=cost)
        return _SegmentRun(detections, usage, streamed.text, billed)

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
        details = usage_block.get("output_tokens_details")
        reasoning = details.get("reasoning_tokens") if isinstance(details, Mapping) else 0
        usage = CallUsage(
            model=params.model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=latency,
            cost_usd=spark_cost_usd(params.model, usage_block),
            reasoning_tokens=int(reasoning) if isinstance(reasoning, int | float) else 0,
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
            raw=output_text(response).strip(),
            analysis=_clean_paragraph(str(answer.get("analysis") or "")),
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
            raw=output_text(response).strip(),
            analysis=_clean_paragraph(str(answer.get("analysis") or "")),
            visual_fill_pct=_visual_fill(answer.get("fill_pct")),
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

    async def explain_pipeline(self, facts: dict[str, object]) -> StageExplanations:
        """One batched Muse Spark call authoring the per-stage 'AI analysis'.

        Text-only (the measured facts, not the media), so it is cheap and never
        re-sends the clip. Grounded strictly in ``facts``; the model phrases, it
        does not fetch or invent."""
        prompt = f"{_EXPLAIN_PROMPT}\n\nMeasured facts (JSON):\n{json.dumps(facts, default=str)}"
        response, usage = await self._spark(
            "explain_pipeline", [{"type": "input_text", "text": prompt}], _EXPLAIN_SCHEMA
        )
        answer = _json_answer(response)
        by_stage = {
            key: _clean_paragraph(str(answer[key]))
            for key in _EXPLAIN_STAGES
            if isinstance(answer.get(key), str) and str(answer[key]).strip()
        }
        return StageExplanations(by_stage=by_stage, usage=usage)

    async def answer_question(self, prompt: str) -> Narration:
        """Free-form grounded answer from Muse Spark (the analyst chat)."""
        response, usage = await self._spark(
            "analyst_chat", [{"type": "input_text", "text": prompt}], None
        )
        text = output_text(response).strip()
        if not text:
            raise ModelAPIResponseError("The model returned an empty answer.")
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
