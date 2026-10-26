"""AI seam interface and result types.

These dataclasses are the normalized outputs the pipeline consumes, independent
of whether SAM/Spark ran live or a fixture was replayed. Keeping them here (not
in the mock or live client) means both implementations return the same shapes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


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
    """SAM 3.1 Stage-2 output for one clip: the four tracked concepts."""

    objects: list[TrackedObject]
    frame_count: int

    def by_label(self, label: str) -> TrackedObject | None:
        return next((o for o in self.objects if o.label == label), None)


@dataclass(frozen=True, slots=True)
class OCRResult:
    """Muse Spark Stage-3 placard read."""

    truck_id: str | None
    confidence: float
    frame_ref: str | None = None


@dataclass(frozen=True, slots=True)
class ClassifyResult:
    """Muse Spark Stage-5 debris classification."""

    debris_class: str
    confidence: float


class AIClient(Protocol):
    """What the pipeline needs from the AI layer. Implemented by mock + live."""

    async def track(self, content_hash: str) -> TrackResult:
        """SAM 3.1: track+segment the four concepts across the clip's frames."""
        ...

    async def read_placard(self, content_hash: str) -> OCRResult:
        """Muse Spark: OCR the truck placard from the clearest frame."""
        ...

    async def classify_debris(self, content_hash: str) -> ClassifyResult:
        """Muse Spark: classify the load (vegetative / C&D / white goods / ...)."""
        ...

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> str:
        """Muse Spark: one-line human narrative for a flag the rules raised."""
        ...
