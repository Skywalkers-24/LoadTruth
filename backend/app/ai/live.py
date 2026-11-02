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
import math
import re
import time
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field, replace
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
from typing import Any

from app.ai import partner_http
from app.ai.base import (
    CallUsage,
    ClassifyResult,
    ClipMedia,
    Narration,
    OCRResult,
    StageExplanations,
    TrackResult,
)
from app.ai.catalog import MODELS, ReasoningEffort
from app.ai.config_store import get_ai_config_store
from app.ai.meta_http import (
    MetaHTTP,
    ModelAPIRequestError,
    ModelAPIResponseError,
    ModelAPIUnavailableError,
    output_text,
)
from app.ai.partner_media import media_parts, meta_keyframe_parts
from app.ai.pricing import sam_billed_units, sam_cost_usd, spark_cost_usd, token_counts
from app.ai.providers import endpoint
from app.ai.request_params import SparkRequestParams, params_for
from app.ai.sam_measure import (
    BED_FROM_BED,
    BED_LABEL,
    LOAD_LABEL,
    LOAD_PREFIX,
    MEASURE_VERSION,
    RIM_LABEL,
    SAM_PROMPT_VERSION,
    TRUCK_BODY_LABEL,
    Box,
    Detection,
    frames_covered,
    measure,
    parse_segmentation_async,
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
    "doing the work when it helps (for example 'Muse Spark read ...'). Be concise and "
    "confident and do not use dashes or parentheses."
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
    "This is evidence footage of a haul truck. Inspect all visible cargo inside the "
    "foreground truck's load area throughout the clip, including mixed contents and "
    "cargo carried inside another container. Classify the dominant material using one "
    "of these reporting classes: vegetative, construction_demolition, white_goods, "
    "hazardous, or other. Apply the labels by the actual material and its properties; "
    "do not infer contents from a container's appearance, and use other when no class "
    "fits. Pick the class that makes up most of the visible load. confidence is your "
    "probability, from 0 to 1, that "
    "the class is right. "
    "Estimate occupied bulk volume as a percentage of the foreground truck's usable load "
    "compartment, from 0 to 100. Adapt to the actual vehicle and contents visible in each "
    "frame; never assign a typical percentage from truck type or material category. "
    "FILL RULES: "
    "1. Establish the compartment's floor, front, sides, rear boundary, and full-height "
    "reference from structural evidence. Account for tapered walls, sloped floors, wheel "
    "housings, and genuine load-retaining extensions. Exclude the cab, chassis, decorative "
    "rails, tarp bows, and background. For a container carried on a truck, assess the "
    "container's interior, not the space around it. If capacity boundaries cannot be "
    "established, return null for that frame. "
    "2. An open, missing, lowered, or partly open tailgate does not reduce the compartment's "
    "full-height reference. Infer the rear boundary from the floor end and fixed side walls; "
    "do not use the moving door edge as the fill line or count a lowered gate as extra floor. "
    "This applies to open-back, walking-floor, and tall-sided trailers as well. Judge the "
    "material's depth and occupied length, including visible empty space beyond the rear "
    "pile. An open rear does not by itself imply either an empty or a nearly full truck. "
    "3. Consider front, middle, rear, and both sides in three dimensions. Combine occupied "
    "length, width, and depth relative to the compartment geometry, weighting regions by "
    "their actual capacity rather than their apparent image size. Distinguish a shallow "
    "layer covering the whole floor from a deep pile covering only part of it. Account for "
    "sloped heaps, central mounds, uneven loading, and large empty channels or cavities. "
    "Do not use segmentation coverage or other pixel-area ratios as the fill percentage. "
    "4. Estimate bulk occupied volume, not mass, density, or solid-material volume. Include "
    "ordinary small gaps within a loose pile and the external volume of bulky objects, "
    "while excluding substantial empty spaces between separated objects. Do not treat "
    "isolated tall branches or objects as a solid block extending across the bed. "
    "5. Use 0 only for a visibly empty compartment. A heap above the walls may be overloaded, "
    "but a protruding item alone does not prove 100% fill. Consider excess heap volume "
    "together with unfilled regions; cap the reported percentage at 100 when total bulk "
    "volume reaches or exceeds the compartment capacity. Describe visible overflow in "
    "analysis without inventing a percentage above 100. "
    "6. Correct for perspective, camera angle, and a tilted bed using the truck's own "
    "structure. Shadows, glare, dust, tarps, closed doors, opaque walls, and clipped views "
    "are not evidence of empty space. Return null when obstruction or blur prevents a "
    "defensible whole-compartment estimate; do not assume hidden regions are full or empty. "
    "A cover's outer shape alone does not reveal the contents beneath it. "
    "7. Inspect every supplied frame and return exactly one entry per frame in order. "
    "Estimate from each frame's evidence without copying values across frames or forcing "
    "variation when the load is unchanged. If loading or unloading occurs, estimate each "
    "visible state and mention the change in analysis. Use continuous estimates formatted "
    "to two decimal places, without rounding to fixed buckets; formatting does not imply "
    "measurement precision. "
    "analysis is two or three plain sentences explaining the compartment reference, load "
    "distribution, and any visibility limitations or overflow. If no frame is assessable, "
    f"say so and return null entries. {_ANALYSIS_STYLE}"
)

_NAME_LOAD_PROMPT = (
    "First determine whether a foreground haul truck is present. Set truck_present true "
    "even when its bed is empty; an empty monitoring lane has truck_present false. "
    "presence_confidence is your probability from 0 to 1 that this presence decision is correct. "
    "Inspect only the material physically inside the open bed of the foreground haul truck. "
    "Ignore background piles, ground debris, and other vehicles. Classify the dominant load "
    "as exactly one of vegetative, hazardous, white_goods, construction_demolition, or other. "
    "Also return up to five short, concrete object noun phrases, one for each distinct "
    "cargo type visibly inside that bed, so SAM can segment the full mixed load. Include "
    "every distinguishable cargo type visible anywhere in the clip, even when it is not "
    "the dominant type or appears in only part of the clip. Treat any carried object or "
    "material inside the cargo area as load, regardless of its category, packaging, or "
    "hazard status. Do not omit an item because it is a single bulky object, a closed "
    "container, or mixed with other cargo. Use one type per phrase; do not join types "
    "with 'or', combine several materials into one phrase, or repeat synonyms. Name the "
    "recognizable material or object, not just its color or texture. Do not name the truck, "
    "bed, or background. Also return load_concept: one broad, short noun phrase that "
    "describes the visible cargo as a whole. Whenever cargo is visible, provide this "
    "phrase even if its type is unfamiliar. Choose it from what is actually visible; do not "
    "use the same generic word for every clip, and do not "
    "include the truck, bed, or background. Keep it to one concept, not a list. If the bed is "
    "visibly empty, return an empty concepts list and empty load_concept, and class other. "
    "Also return one cargo box seed for each distinct load object you can confidently locate. "
    "Use the exact video timestamp in seconds and a tight bounding box around only that cargo "
    "object, with x1, y1, x2, y2 normalized from 0 to 1000 across the full frame. The seed "
    "concept must match one of the returned cargo phrases. Do not box the truck, bed walls, "
    "empty space, or background. If no cargo object can be located confidently, return no seeds. "
    "visible_fill_pct is an estimate from 0 to 100 of bed volume occupied, based only on the "
    "foreground bed."
)

_NAME_LOAD_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "concepts": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "load_concept": {"type": "string"},
        "cargo_seeds": {
            "type": "array",
            "maxItems": 16,
            "items": {
                "type": "object",
                "properties": {
                    "concept": {"type": "string"},
                    "timestamp_s": {"type": "number", "minimum": 0},
                    "x1": {"type": "integer", "minimum": 0, "maximum": 1000},
                    "y1": {"type": "integer", "minimum": 0, "maximum": 1000},
                    "x2": {"type": "integer", "minimum": 0, "maximum": 1000},
                    "y2": {"type": "integer", "minimum": 0, "maximum": 1000},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": [
                    "concept",
                    "timestamp_s",
                    "x1",
                    "y1",
                    "x2",
                    "y2",
                    "confidence",
                ],
                "additionalProperties": False,
            },
        },
        "debris_class": {
            "type": "string",
            "enum": ["vegetative", "hazardous", "white_goods", "construction_demolition", "other"],
        },
        "visible_fill_pct": {"type": "number"},
        "truck_present": {"type": "boolean"},
        "presence_confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": [
        "concepts",
        "load_concept",
        "cargo_seeds",
        "debris_class",
        "visible_fill_pct",
        "truck_present",
        "presence_confidence",
    ],
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
    "The stages are: sam_track (report exactly which regions SAM detected according to "
    "the supplied segmentation facts; never claim a missing bed or load was tracked); "
    "capacity (the identified truck was looked up in the certified "
    "registry for its registered cubic-yard capacity); geometry (Muse Spark estimated "
    "fill from each sampled video frame, and deterministic code combined those "
    "estimates using their median; SAM masks are not used to estimate fill); anomalies "
    "(deterministic rules may flag identity, certification, capacity, and cycle issues, "
    "but do not automatically flag fill quality; monitors can flag visual concerns "
    "during review); dollar_math (exact arithmetic multiplies fill percent by certified "
    "capacity for cubic yards, then by the rate for the dollar value). State plainly "
    "that capacity, geometry, anomalies, and dollar_math are deterministic steps, not "
    "model judgements, while sam_track is the vision model's own work."
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
        "frame_fill_pcts": {
            "type": "array",
            "items": {
                "anyOf": [{"type": "number", "minimum": 0, "maximum": 100}, {"type": "null"}]
            },
            "minItems": 1,
            "maxItems": 8,
        },
        "analysis": {"type": "string"},
    },
    "required": ["debris_class", "confidence", "frame_fill_pcts", "analysis"],
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
    data: bytes = field(default=b"", repr=False)
    fps: float | None = None


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


def _frame_fill_estimates(value: object, *, media_kind: str) -> tuple[float, ...]:
    """Retain assessable frame estimates; unknown views must not become zeros."""
    if not isinstance(value, list) or not 1 <= len(value) <= 8:
        raise ModelAPIResponseError("Muse did not return a fill estimate for each keyframe.")
    if media_kind == "video" and len(value) < 2:
        raise ModelAPIResponseError("Muse fill estimation requires multiple video frames.")
    estimates: list[float] = []
    for estimate in value:
        if estimate is None:
            continue
        if (
            isinstance(estimate, bool)
            or not isinstance(estimate, int | float)
            or not math.isfinite(float(estimate))
            or not 0 <= float(estimate) <= 100
        ):
            raise ModelAPIResponseError("Muse returned an invalid per-frame fill estimate.")
        estimates.append(
            float(Decimal(str(estimate)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        )
    if not estimates:
        raise ModelAPIResponseError("Muse could not assess truck fill in any supplied frame.")
    return tuple(estimates)


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
                overlap = width * height
                # A match mostly outside the cargo opening is a body/background
                # detection even if its box crosses the bed.
                if overlap / max(1, ld.box.area) >= 0.5:
                    total += overlap
    return total


def _box_overlap_share(load: Detection, bed: Detection) -> float:
    """Fraction of a candidate load box that lies inside a same-frame bed box."""
    width = min(load.box.right, bed.box.right) - max(load.box.left, bed.box.left)
    height = min(load.box.bottom, bed.box.bottom) - max(load.box.top, bed.box.top)
    return (max(0, width) * max(0, height)) / max(1, load.box.area)


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
    """Calls Meta SAM and routes Spark tasks to the selected inference provider."""

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
        self._partner_media: dict[int, asyncio.Task[list[dict[str, Any]]]] = {}

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
        media = task.result()
        frames = self._partner_media.pop(id(media), None)
        if frames is not None and not frames.done():
            frames.cancel()
        file_id = media.file_id
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
            source_url: str | None = None
            with suppress(Exception):
                source_url = await evidence_store.media_url(clip.content_hash)
            file_id = await self._http.upload_file(
                prepared.data,
                filename=f"{clip.content_hash[:16]}.{ext}",
                mime=prepared.mime,
                ttl_s=s.media_file_ttl_s,
                source_url=source_url,
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
        return PreparedMedia(
            clip.media_kind,
            prepared.mime,
            len(prepared.data),
            part,
            file_id,
            prepared.data,
            video_fps,
        )

    # ── SAM 3.1 ──────────────────────────────────────────────────────────────
    async def _name_load_concepts(
        self, media: PreparedMedia
    ) -> tuple[
        list[str], str, str, CallUsage | None, bool | None, float, str, list[dict[str, Any]]
    ]:
        """Ask Muse Spark what noun phrases name the load, for SAM to segment.

        The vision model identifies the debris class and names both the dominant
        material and visible objects, so SAM is not tied to a fixed load phrase.
        If naming fails, no guessed load prompts are sent to SAM."""
        try:
            response, usage = await self._spark(
                "name_load",
                [{"type": "input_text", "text": _NAME_LOAD_PROMPT}, media.part],
                _NAME_LOAD_SCHEMA,
                media=media,
            )
            answer = _json_answer(response)
        except (ModelAPIResponseError, ModelAPIRequestError):
            return [], "", "other", None, None, 0.0, '{"presence_check":"unavailable"}', []
        raw = answer.get("concepts")
        phrases = [_clean_concept(p) for p in raw] if isinstance(raw, list) else []
        phrases = [p for p in dict.fromkeys(phrases) if p][: get_settings().sam_load_max_concepts]
        load_concept = _clean_concept(answer.get("load_concept"))
        debris_class = str(answer.get("debris_class") or "other").strip().lower()
        present = answer.get("truck_present")
        confidence = answer.get("presence_confidence", 0.0)
        confidence = float(confidence) if isinstance(confidence, int | float) else 0.0
        seeds: list[dict[str, Any]] = []
        raw_seeds = answer.get("cargo_seeds")
        if isinstance(raw_seeds, list):
            for item in raw_seeds[:16]:
                if not isinstance(item, dict):
                    continue
                concept = _clean_concept(item.get("concept"))
                raw_values = [
                    item.get(key) for key in ("timestamp_s", "x1", "y1", "x2", "y2", "confidence")
                ]
                if not concept or not all(isinstance(value, int | float) for value in raw_values):
                    continue
                values: list[float] = [
                    float(value) for value in raw_values if isinstance(value, int | float)
                ]
                timestamp, x1, y1, x2, y2, seed_confidence = values
                if (
                    timestamp < 0
                    or not 0 <= x1 < x2 <= 1000
                    or not 0 <= y1 < y2 <= 1000
                    or seed_confidence < 0.5
                ):
                    continue
                seeds.append(
                    {
                        "concept": concept,
                        "timestamp_s": float(timestamp),
                        "x1": int(x1),
                        "y1": int(y1),
                        "x2": int(x2),
                        "y2": int(y2),
                        "confidence": float(seed_confidence),
                    }
                )
        return (
            phrases,
            load_concept,
            debris_class if debris_class in DEBRIS_CLASSES else "other",
            usage,
            present if isinstance(present, bool) else None,
            max(0.0, min(1.0, confidence)),
            json.dumps(answer),
            seeds,
        )

    async def track(self, clip: ClipMedia) -> TrackResult:
        media = await self._media(clip)
        s = get_settings()
        # Muse Spark names the load and visible items first; its per-clip
        # phrases drive segmentation without a fixed material vocabulary.
        (
            named,
            load_concept,
            debris_class,
            name_usage,
            present,
            presence_confidence,
            presence_raw,
            cargo_seeds,
        ) = await self._name_load_concepts(media)
        if present is False and presence_confidence >= 0.8:
            return TrackResult(
                objects=[],
                frame_count=0,
                usage=name_usage,
                truck_present=False,
                presence_confidence=presence_confidence,
                presence_raw=presence_raw,
                sam_prompt_version=SAM_PROMPT_VERSION,
                measure_version=MEASURE_VERSION,
                notes={"Truck present": "No", "SAM": "Skipped for confidently empty scene"},
            )
        bed_concepts = list(dict.fromkeys(s.sam_bed_concepts))
        # Ask for the whole pile as well as Muse's per-clip broad material
        # phrase and specific visible items. Keep the configured cap for the
        # dynamic phrases, with one additional whole-pile request.
        load_concepts = list(dict.fromkeys([load_concept, *named]))[
            : max(1, s.sam_load_max_concepts)
        ]
        if "debris pile" not in load_concepts:
            load_concepts.insert(0, "debris pile")
        # Every concept goes to SAM in one parallel round: the bed phrases (in
        # priority order), the tailgate (the rear rim that bounds the opening),
        # and the load phrases (merged, since one phrase misses some loads).
        concepts = [*bed_concepts, s.sam_rim_concept, *load_concepts]
        runs = dict(
            zip(
                concepts,
                # SAM receives one short object noun phrase per request. The
                # prompt-naming call already limits these concepts to items seen
                # inside this truck; the bed mask clips the resulting regions.
                await asyncio.gather(*(self._segment(media, c) for c in concepts)),
                strict=True,
            )
        )
        # The first prompt is the cargo opening used for measurement and load
        # clipping. The second is only a visual exterior/body outline; never
        # substitute it for the opening if SAM misses the interior.
        bed_concept = bed_concepts[0]
        fallback = s.sam_bed_fallback_concept.strip()
        if not runs[bed_concept].detections and fallback and fallback not in runs:
            runs[fallback] = await self._segment(media, fallback)
            concepts.append(fallback)
            if runs[fallback].detections:
                bed_concept = fallback
        body_concept = (
            bed_concepts[1] if len(bed_concepts) > 1 and runs[bed_concepts[1]].detections else None
        )
        bed, rim = runs[bed_concept], runs[s.sam_rim_concept]
        loads = [runs[c] for c in load_concepts]
        tracking_notes: list[str] = []
        extra_sam_requests = 0
        # Text matching can lock onto a distant cargo item late. Seed SAM from
        # each real detection and let its tracker return masks in both temporal
        # directions. Never create a shape unless SAM returns it.
        retry_after = max(3, s.max_sampled_frames // 10)
        if media.media_kind == "video":
            for index, run in enumerate(loads):
                if not run.detections:
                    continue
                first_load_frame = min(d.frame for d in run.detections)
                if first_load_frame < retry_after:
                    continue
                seed_detections = [d for d in run.detections if d.frame == first_load_frame]
                bed_boxes = [d for d in bed.detections if d.frame == first_load_frame]
                if not bed_boxes:
                    continue
                seed_detections = [
                    d
                    for d in seed_detections
                    if any(_box_overlap_share(d, b) >= 0.5 for b in bed_boxes)
                ]
                if not seed_detections:
                    continue
                try:
                    tracked = await self._segment_from_boxes(media, seed_detections)
                except (ModelAPIRequestError, ModelAPIResponseError, ModelAPIUnavailableError):
                    log.warning(
                        "sam_load_backward_tracking_failed",
                        frame=first_load_frame,
                        concept=load_concepts[index],
                        exc_info=True,
                    )
                    continue
                if not tracked.detections:
                    continue
                loads[index] = _SegmentRun(
                    detections=tracked.detections,
                    usage=run.usage.plus(tracked.usage),
                    text=tracked.text,
                    billed_units=run.billed_units + tracked.billed_units,
                )
                runs[load_concepts[index]] = loads[index]
                extra_sam_requests += 1
                tracking_notes.append(
                    f'"{load_concepts[index]}" seeded at frame {first_load_frame}'
                )
        # If a dynamic text phrase found no mask, use Muse's tight, timestamped
        # cargo boxes as SAM seeds. SAM still produces every displayed mask; the
        # VLM only points SAM to objects that phrase matching missed.
        known_concepts = {_clean_concept(concept): i for i, concept in enumerate(load_concepts)}
        dimensions = next((d.media_size for d in bed.detections if d.media_size), None)
        box_seeds: list[Detection] = []
        if media.media_kind == "video" and media.fps and dimensions:
            width, height = dimensions
            max_frame = max((d.frame for d in bed.detections), default=s.max_sampled_frames - 1)
            for seed_index, seed in enumerate(cargo_seeds):
                concept_index = known_concepts.get(seed["concept"])
                if concept_index is None or loads[concept_index].detections:
                    continue
                frame = min(max_frame, max(0, round(seed["timestamp_s"] * media.fps)))
                x1 = round(seed["x1"] * width / 1000)
                y1 = round(seed["y1"] * height / 1000)
                x2 = round(seed["x2"] * width / 1000)
                y2 = round(seed["y2"] * height / 1000)
                if x2 <= x1 or y2 <= y1:
                    continue
                box_seeds.append(
                    Detection(
                        frame,
                        f"cargo-seed-{seed_index}",
                        Box(x1, y1, min(width, x2), min(height, y2)),
                        media_size=(width, height),
                    )
                )
        if box_seeds:
            try:
                tracked = await self._segment_from_boxes(media, box_seeds)
            except (ModelAPIRequestError, ModelAPIResponseError, ModelAPIUnavailableError):
                log.warning("sam_vlm_box_seed_tracking_failed", seeds=len(box_seeds), exc_info=True)
            else:
                if tracked.detections:
                    box_concept = "box-seeded cargo objects"
                    load_concepts.append(box_concept)
                    concepts.append(box_concept)
                    loads.append(tracked)
                    runs[box_concept] = tracked
                    tracking_notes.append(
                        f"SAM tracked {len(box_seeds)} dynamic cargo box seeds both directions"
                    )
        measure_started = time.perf_counter()
        result = await asyncio.to_thread(
            measure,
            bed.detections,
            [d for run in loads for d in run.detections],
            media_kind=media.media_kind,
            max_frames=s.max_sampled_frames,
            rim_run=rim.detections,
        )
        measure_ms = round((time.perf_counter() - measure_started) * 1000, 1)
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
            requests=len(concepts) + extra_sam_requests,
            cost_usd=usage.cost_usd,
            measure_ms=measure_ms,
        )
        # Keep a legacy best-match key for old clients; the review overlay uses
        # each named prompt below, and Re-measure can replay every raw response.
        best_load_index = max(
            range(len(loads)),
            key=lambda i: _in_bed_pixels(loads[i].detections, bed.detections),
            default=-1,
        )
        best_load = loads[best_load_index] if best_load_index >= 0 else None
        best_load_overlap = _in_bed_pixels(best_load.detections, bed.detections) if best_load else 0
        segments = {
            BED_LABEL: bed.text,
            **({TRUCK_BODY_LABEL: runs[body_concept].text} if body_concept else {}),
            # An off-truck background match must not become the Review overlay.
            LOAD_LABEL: best_load.text if best_load and best_load_overlap else "",
            RIM_LABEL: rim.text,
            **{f"{LOAD_PREFIX}{c}": runs[c].text for c in load_concepts},
        }
        segments = {k: v for k, v in segments.items() if len(v) <= _MAX_SEGMENT_CHARS}
        notes = {
            **_track_notes(media, runs, bed_concept, s.sam_rim_concept, load_concepts),
            "Load named by Muse Spark": (
                ", ".join(f'"{c}"' for c in named) if named else "no specific objects named"
            ),
            "Broad load concept from Muse Spark": load_concept or "unavailable",
            "Load class from Muse Spark": debris_class,
            **result.notes,
        }
        if tracking_notes:
            notes["Load tracking retries"] = "; ".join(tracking_notes)
            notes["Billed"] = (
                f"{sum(r.billed_units for r in runs.values())} frames "
                f"({len(runs) + extra_sam_requests} requests)"
            )
        bed_source = BED_FROM_BED
        return replace(
            result,
            usage=usage,
            segments=segments,
            notes=notes,
            bed_source=bed_source,
            sam_prompt_version=SAM_PROMPT_VERSION,
            truck_present=True if runs[bed_concept].detections else present,
            presence_confidence=presence_confidence,
            presence_raw=presence_raw,
        )

    async def _segment(self, media: PreparedMedia, concept: str) -> _SegmentRun:
        return await self._segment_prompt(media, concept)

    async def _segment_from_boxes(
        self, media: PreparedMedia, detections: list[Detection]
    ) -> _SegmentRun:
        """Use a real SAM box detection to track a late-matched object both ways."""
        if not detections or media.media_kind != "video":
            raise ModelAPIRequestError("Box-seeded SAM tracking requires video detections.")
        width, height = detections[0].media_size or (0, 0)
        if width <= 0 or height <= 0:
            raise ModelAPIRequestError("SAM box seed is missing video dimensions.")
        object_ids: dict[str, int] = {}
        by_frame: dict[int, list[str]] = {}
        object_prompts: list[str] = []
        for detection in detections[:16]:
            object_id = object_ids.setdefault(detection.object_id, len(object_ids) + 1)
            box = detection.box
            x1 = max(0, min(width - 1, box.left))
            y1 = max(0, min(height - 1, box.top))
            x2 = max(x1, min(width - 1, box.right - 1))
            y2 = max(y1, min(height - 1, box.bottom - 1))
            by_frame.setdefault(detection.frame, []).append(
                f"{object_id}<|box;x1={x1};y1={y1};x2={x2};y2={y2};w={width};h={height}|>"
            )
        if not by_frame:
            raise ModelAPIRequestError("SAM box seed has no objects on its source frame.")
        for frame, prompts in sorted(by_frame.items()):
            object_prompts.append(f"<{frame}f>" + ",".join(prompts))
        prompt = "".join(object_prompts)
        return await self._segment_prompt(media, prompt, propagation_direction="both")

    async def _segment_prompt(
        self,
        media: PreparedMedia,
        prompt: str,
        *,
        propagation_direction: str | None = None,
    ) -> _SegmentRun:
        model = get_ai_config_store().resolve("sam_track").model
        payload = {
            "model": model,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": prompt}, media.part],
                }
            ],
            "metadata": {
                "mask_encoding": "one_bit",
                **(
                    {"propagation_direction": propagation_direction}
                    if propagation_direction
                    else {}
                ),
            },
        }
        streamed = await self._http.stream_response(payload)
        parse_started = time.perf_counter()
        detections = await parse_segmentation_async(streamed.text, media_kind=media.media_kind)
        parse_ms = round((time.perf_counter() - parse_started) * 1000, 1)
        log.info(
            "sam_response_parsed",
            output_chars=len(streamed.text),
            detections=len(detections),
            parse_ms=parse_ms,
        )
        frames = 1 if media.media_kind == "image" else frames_covered(detections)
        cost = sam_cost_usd(streamed.usage, media_kind=media.media_kind, frames_seen=frames)
        billed = sam_billed_units(streamed.usage, media_kind=media.media_kind, frames_seen=frames)
        usage = CallUsage(model=model, latency_ms=streamed.latency_ms, cost_usd=cost)
        return _SegmentRun(detections, usage, streamed.text, billed)

    # ── Muse Spark ───────────────────────────────────────────────────────────
    async def _spark(
        self,
        task_id: str,
        content: list[dict[str, str]],
        schema: dict[str, Any] | None,
        *,
        media: PreparedMedia | None = None,
    ) -> tuple[dict[str, Any], CallUsage]:
        params = params_for(task_id)
        selected = MODELS[params.model].provider
        fallbacks = [
            p.strip() for p in get_settings().spark_fallback_providers.split(",") if p.strip()
        ]
        providers = list(dict.fromkeys([selected, *fallbacks]))
        for index, provider in enumerate(providers):
            try:
                if provider == "meta":
                    model = params.model if selected == "meta" else "muse-spark-1.3"
                    request_content = content
                    if task_id == "spark_classify" and media is not None:
                        keyframes = await meta_keyframe_parts(
                            media.data, media.mime, media.media_kind
                        )
                        request_content = [
                            part for part in content if part.get("type") == "input_text"
                        ] + keyframes
                    return await self._meta_spark(
                        task_id, request_content, schema, replace(params, model=model)
                    )
                route = endpoint(provider)
                parts: list[dict[str, Any]] = [
                    {"type": "text", "text": p["text"]}
                    for p in content
                    if p["type"] == "input_text"
                ]
                if media is not None:
                    frames = self._partner_media.get(id(media))
                    if frames is None:
                        frames = asyncio.create_task(
                            media_parts(media.data, media.mime, media.media_kind)
                        )
                        self._partner_media[id(media)] = frames
                    parts.extend(await asyncio.shield(frames))
                return await partner_http.complete(route, params, task_id, parts, schema)
            except (ModelAPIUnavailableError, ModelAPIResponseError):
                if index == len(providers) - 1:
                    raise
                log.warning("ai_provider_fallback", provider=provider, task=task_id)
        raise ModelAPIUnavailableError("No inference provider is configured.")

    async def _meta_spark(
        self,
        task_id: str,
        content: list[dict[str, Any]],
        schema: dict[str, Any] | None,
        params: SparkRequestParams,
    ) -> tuple[dict[str, Any], CallUsage]:
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

    async def interpret_monitor_call_audio(
        self, wav: bytes, context: str, *, dispute: bool = False
    ) -> dict[str, Any]:
        """Transcribe and interpret one short monitor report or dispute in one Muse request."""
        schema: dict[str, Any] = {
            "type": "object",
            "properties": {
                "transcript": {"type": "string"},
                "fill_pct": {
                    "anyOf": [
                        {"type": "number", "minimum": 0, "maximum": 100},
                        {"type": "null"},
                    ]
                },
                "issue_flags": {"type": "array", "items": {"type": "string"}},
                "follow_up_question": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                "dispute_reason": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            },
            "required": [
                "transcript",
                "fill_pct",
                "issue_flags",
                "follow_up_question",
                "dispute_reason",
            ],
            "additionalProperties": False,
        }
        if dispute:
            instruction = (
                "This is a spoken ticket-dispute filing. Extract fill_pct only when the speaker "
                "clearly gives the disputed monitor fill percentage; do not use the video estimate "
                "or infer a number. Extract dispute_reason as a concise statement of the speaker's "
                "explicit reason for disputing the ticket, or null if none is stated. Keep "
                "physical problems in issue_flags only when explicitly reported. If a percentage "
                "is clearly spoken, do not ask a follow-up; use the transcript as the reason if no "
                "separate reason was stated. Ask a concise follow-up only when no disputed "
                "percentage is clear. This files the dispute when a percentage is available."
            )
        else:
            instruction = (
                "This is a spoken monitor report about a truck load. Extract only a clearly stated "
                "monitor fill percentage and explicitly reported physical problems. Return no "
                "inferred facts. Report dips, spills, overflow, or debris outside the truck as "
                "short review flags. Put dispute_reason as null. If a problem is mentioned without "
                "enough detail to locate or assess it, ask one concise follow-up question. If no "
                "fill percentage is clearly stated, ask for it. Otherwise set follow_up_question "
                "to null."
            )
        prompt = (
            "Transcribe only the speech in the attached audio, not the prior statements. "
            + instruction
            + " Prior monitor statements, if any: "
            + json.dumps(context.strip()[-2000:], ensure_ascii=False)
            + ". Return the transcript in the language spoken."
        )
        content: list[dict[str, Any]] = [
            {"type": "input_text", "text": prompt},
            {
                "type": "input_audio",
                "input_audio": {"data": base64.b64encode(wav).decode("ascii"), "format": "wav"},
            },
        ]
        params = replace(
            params_for("analyst_chat"),
            model="muse-spark-1.2",
            effort=ReasoningEffort.MINIMAL,
            # Muse uses this budget for both reasoning and the transcript.
            # Meta recommends at least 4,000 tokens for audio; 320 consistently
            # ended with status=incomplete before any structured result returned.
            max_output_tokens=4000,
        )
        response, _usage = await self._meta_spark("monitor_call", content, schema, params)
        return _json_answer(response)

    async def read_placard(self, clip: ClipMedia) -> OCRResult:
        media = await self._media(clip)
        response, usage = await self._spark(
            "spark_ocr",
            [{"type": "input_text", "text": _OCR_PROMPT}, media.part],
            _OCR_SCHEMA,
            media=media,
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
            media=media,
        )
        answer = _json_answer(response)
        debris = str(answer.get("debris_class") or "other")
        frame_fill_pcts = _frame_fill_estimates(
            answer.get("frame_fill_pcts"), media_kind=media.media_kind
        )
        visual_fill_pct = float(
            Decimal(str(median(frame_fill_pcts))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        )
        return ClassifyResult(
            debris_class=debris if debris in DEBRIS_CLASSES else "other",
            confidence=_clamp01(answer.get("confidence")),
            usage=usage,
            raw=output_text(response).strip(),
            analysis=_clean_paragraph(str(answer.get("analysis") or "")),
            visual_fill_pct=visual_fill_pct,
            frame_fill_pcts=frame_fill_pcts,
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
