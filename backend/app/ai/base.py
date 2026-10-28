"""AI seam interface and result types.

These dataclasses are the normalized outputs the pipeline consumes, independent
of whether SAM/Spark ran live or a fixture was replayed. Keeping them here (not
in the mock or live client) means both implementations return the same shapes.

Every clip-level call receives a :class:`ClipMedia`: the content hash (the cache
and fixture key) plus the bytes the live client sends to Meta. The mock only
reads the hash. Each result can carry a :class:`CallUsage` so the orchestrator
records real tokens, latency, and dollars in the cost ledger. Usage is not part
of a result's identity (``compare=False``) and is never persisted, so a replayed
result compares equal to the original.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.pipeline.media import guess_mime


@dataclass(frozen=True, slots=True)
class ClipMedia:
    """One piece of evidence handed to the AI layer.

    ``content_hash`` keys the durable cache and the fixtures. ``data`` holds the
    raw upload bytes; it is empty when a caller only needs the cached or mock
    path (the live client raises if asked to send empty media).
    """

    content_hash: str
    media_kind: str = "video"  # "video" | "image"
    filename: str = ""
    data: bytes = field(default=b"", repr=False)

    @property
    def mime_type(self) -> str:
        return guess_mime(self.filename, self.media_kind)


@dataclass(frozen=True, slots=True)
class CallUsage:
    """What one AI stage cost: summed over every model request it made."""

    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: float = 0.0
    cost_usd: float = 0.0
    requests: int = 1
    cached: bool = False
    # Part of tokens_out spent on hidden reasoning (billed as output).
    reasoning_tokens: int = 0

    def plus(self, other: CallUsage) -> CallUsage:
        """Combine two usages (e.g. the two SAM concept requests of one stage)."""
        return CallUsage(
            model=self.model,
            tokens_in=self.tokens_in + other.tokens_in,
            tokens_out=self.tokens_out + other.tokens_out,
            reasoning_tokens=self.reasoning_tokens + other.reasoning_tokens,
            latency_ms=max(self.latency_ms, other.latency_ms),
            cost_usd=round(self.cost_usd + other.cost_usd, 6),
            requests=self.requests + other.requests,
            cached=self.cached and other.cached,
        )


@dataclass(frozen=True, slots=True)
class TrackedObject:
    """One object SAM tracked across frames (truck, bed, debris, placard)."""

    label: str
    sam_object_id: str
    # Per-frame area of the object's mask, in pixels; index = sampled frame.
    mask_areas: list[float] = field(default_factory=list)
    # Height of the load surface vs. the bed rails (0..1), best frame only.
    load_height_ratio: float = 0.0


@dataclass(frozen=True, slots=True)
class TrackResult:
    """SAM 3.1 Stage-2 output for one clip: the tracked concepts."""

    objects: list[TrackedObject]
    frame_count: int
    usage: CallUsage | None = field(default=None, compare=False, repr=False)
    # SAM's raw output text per concept label ("truck bed", "debris pile"):
    # kept so the Review console can draw the real boxes and masks per frame.
    segments: dict[str, str] = field(default_factory=dict, compare=False, repr=False)
    # Plain-language facts about what SAM returned, for the pipeline trace.
    notes: dict[str, str] = field(default_factory=dict, compare=False, repr=False)

    def by_label(self, label: str) -> TrackedObject | None:
        return next((o for o in self.objects if o.label == label), None)


@dataclass(frozen=True, slots=True)
class OCRResult:
    """Muse Spark Stage-3 placard read."""

    truck_id: str | None
    confidence: float
    frame_ref: str | None = None
    usage: CallUsage | None = field(default=None, compare=False, repr=False)
    # The model's answer exactly as returned (JSON text), for the trace.
    raw: str = field(default="", compare=False, repr=False)


@dataclass(frozen=True, slots=True)
class ClassifyResult:
    """Muse Spark Stage-5 debris classification."""

    debris_class: str
    confidence: float
    usage: CallUsage | None = field(default=None, compare=False, repr=False)
    raw: str = field(default="", compare=False, repr=False)


@dataclass(frozen=True, slots=True)
class Narration:
    """Muse Spark Stage-6b: a plain-language sentence for one anomaly."""

    text: str
    usage: CallUsage | None = field(default=None, compare=False, repr=False)


class AIClient(Protocol):
    """What the pipeline needs from the AI layer. Implemented by mock + live."""

    async def track(self, clip: ClipMedia) -> TrackResult:
        """SAM 3.1: segment the truck bed and the debris pile across the clip."""
        ...

    async def read_placard(self, clip: ClipMedia) -> OCRResult:
        """Muse Spark: read the truck placard from the clearest frame."""
        ...

    async def classify_debris(self, clip: ClipMedia) -> ClassifyResult:
        """Muse Spark: classify the load (vegetative / C&D / white goods / ...)."""
        ...

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> Narration:
        """Muse Spark: one-line human narrative for a flag the rules raised."""
        ...

    async def answer_question(self, prompt: str) -> Narration:
        """Muse Spark: a free-form, grounded answer to an analyst question.

        The caller builds ``prompt`` from the user's question plus evidence it
        already pulled from the tenant's data, so the model only phrases a
        grounded answer; it never fetches or invents figures.
        """
        ...
