"""Turn SAM 3.1 segmentation output into the measurements Stage 5 consumes.

SAM takes one noun phrase per request, so a clip is segmented twice: once for
the truck bed and once for the debris pile. Each response is special-token text
(one line per frame, a box and a mask per object; see
dev.meta.ai/docs/sam/reading-segmentation), parsed here with Meta's official
``meta_sam_parser``. From the two responses this module builds the
:class:`~app.ai.base.TrackResult` the orchestrator already understands:

* **truck bed** — the bed track with the largest total box area (the truck in
  the scale, not a passing one). Its per-frame mask area is ``mask_areas``.
* **debris pile** — on the same frames, the debris mask pixels that sit inside
  the bed's horizontal span and above the bed floor (``y < bed bottom``), so a
  load heaped above the rails still counts but debris on the ground does not.
* **load height** — on the frame with the largest bed area: how far the top of
  the load reaches from the bed floor toward the top of the bed box (0..1).

Every number is a pixel count or a ratio of pixel counts, so the fill % stays
auditable. Mask decoding is CPU work; callers run :func:`measure` in a thread.
The geometry heuristics are a first calibration and should be checked against
clips with known fills (see LEARNINGS.md §2a).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from meta_sam_parser import (
    CompletedOutcome,
    SegmentationBoxRecord,
    SegmentationMask,
    SegmentationMaskRecord,
    decode_mask_to_raster,
    image_segmentation_format,
    video_segmentation_format,
)

from app.ai.base import TrackedObject, TrackResult
from app.log import get_logger

log = get_logger("ai.sam_measure")

BED_LABEL = "truck bed"
LOAD_LABEL = "debris pile"


@dataclass(frozen=True, slots=True)
class Box:
    """A pixel box; ``right`` and ``bottom`` are exclusive."""

    left: int
    top: int
    right: int
    bottom: int

    @property
    def area(self) -> int:
        return max(0, self.right - self.left) * max(0, self.bottom - self.top)


@dataclass(frozen=True, slots=True)
class Detection:
    """One object on one frame: its box and (when present) its mask."""

    frame: int
    object_id: str
    box: Box
    mask: SegmentationMask | None = None
    mask_origin: tuple[int, int] = (0, 0)  # (left, top) of the mask raster


def parse_segmentation(text: str, *, media_kind: str) -> list[Detection]:
    """Parse one SAM response's output text into per-frame detections."""
    if not text.strip():
        return []
    fmt = image_segmentation_format() if media_kind == "image" else video_segmentation_format()
    parser = fmt.create_parser()
    list(parser.push(text if text.endswith("\n") else text + "\n"))
    result = parser.finish(CompletedOutcome()).result
    if result.diagnostics:
        log.warning("sam_output_diagnostics", count=len(result.diagnostics))

    boxes: dict[tuple[int, str], Box] = {}
    masks: dict[tuple[int, str], SegmentationMaskRecord] = {}
    for rec in result.records:
        if isinstance(rec, SegmentationBoxRecord):
            frame = rec.frame.frame_index if rec.frame is not None else 0
            boxes[(frame, rec.object_id)] = Box(
                int(rec.left), int(rec.top), int(rec.right), int(rec.bottom)
            )
        elif isinstance(rec, SegmentationMaskRecord):
            frame = rec.frame.frame_index if rec.frame is not None else 0
            masks[(frame, rec.object_id)] = rec

    out: list[Detection] = []
    for (frame, oid), box in sorted(boxes.items()):
        m = masks.get((frame, oid))
        origin = (int(m.bounds.left), int(m.bounds.top)) if m is not None else (box.left, box.top)
        out.append(Detection(frame, oid, box, m.mask if m is not None else None, origin))
    return out


def frames_covered(*runs: list[Detection]) -> int:
    """Frames a set of responses spans (highest frame index + 1)."""
    frames = [d.frame for run in runs for d in run]
    return max(frames) + 1 if frames else 0


def _even_sample(items: list[int], limit: int) -> list[int]:
    if limit <= 0 or len(items) <= limit:
        return items
    step = (len(items) - 1) / (limit - 1) if limit > 1 else 0
    return [items[round(i * step)] for i in range(limit)]


def _raster(d: Detection) -> bytes | None:
    return decode_mask_to_raster(d.mask) if d.mask is not None else None


def _bed_area(d: Detection) -> float:
    raster = _raster(d)
    return float(raster.count(1)) if raster is not None else float(d.box.area)


def _box_inside(load: Box, bed: Box) -> tuple[int, int | None]:
    """Box-only fallback: the load box's overlap with the bed span, above the floor."""
    width = min(load.right, bed.right) - max(load.left, bed.left)
    height = min(load.bottom, bed.bottom) - load.top
    if width <= 0 or height <= 0:
        return 0, None
    return width * height, load.top


def _load_inside(load: Detection, bed: Box) -> tuple[int, int | None]:
    """(pixel count, top-most row y) of a load mask inside the bed's span."""
    left, top = load.mask_origin
    raster = _raster(load)
    if raster is None or load.mask is None:
        return _box_inside(load.box, bed)
    width, height = load.mask.width, load.mask.height
    c0 = max(0, bed.left - left)
    c1 = min(width, bed.right - left)
    if c1 <= c0:
        return 0, None
    pixels = 0
    top_y: int | None = None
    rows = min(height, bed.bottom - top)
    for r in range(max(0, rows)):
        count = raster[r * width + c0 : r * width + c1].count(1)
        if count:
            pixels += count
            if top_y is None:
                top_y = top + r
    return pixels, top_y


def measure(
    bed_run: list[Detection],
    load_run: list[Detection],
    *,
    media_kind: str,
    max_frames: int,
) -> TrackResult:
    """Build the Stage-2 ``TrackResult`` from the bed and load responses."""
    frame_count = 1 if media_kind == "image" else frames_covered(bed_run, load_run)
    if not bed_run:
        return TrackResult(objects=[], frame_count=frame_count)

    # The truck being measured: the bed track with the largest total box area.
    totals: dict[str, int] = defaultdict(int)
    for d in bed_run:
        totals[d.object_id] += d.box.area
    bed_id = max(totals, key=lambda k: totals[k])
    bed_by_frame = {d.frame: d for d in bed_run if d.object_id == bed_id}
    loads_by_frame: dict[int, list[Detection]] = defaultdict(list)
    for d in load_run:
        loads_by_frame[d.frame].append(d)

    frames = _even_sample(sorted(bed_by_frame), max_frames)
    bed_areas: list[float] = []
    load_areas: list[float] = []
    best_frame, best_area, best_top = frames[0], -1.0, None
    for f in frames:
        bed = bed_by_frame[f]
        area = _bed_area(bed)
        load_pixels = 0
        top_y: int | None = None
        for load in loads_by_frame.get(f, []):
            px, ty = _load_inside(load, bed.box)
            load_pixels += px
            if ty is not None:
                top_y = ty if top_y is None else min(top_y, ty)
        bed_areas.append(area)
        load_areas.append(float(load_pixels))
        if area > best_area:
            best_frame, best_area, best_top = f, area, top_y

    best_box = bed_by_frame[best_frame].box
    depth = best_box.bottom - best_box.top
    height = 0.0
    if best_top is not None and depth > 0:
        height = max(0.0, min(1.0, (best_box.bottom - best_top) / depth))

    return TrackResult(
        objects=[
            TrackedObject(BED_LABEL, f"bed-{bed_id}", bed_areas, 0.0),
            TrackedObject(LOAD_LABEL, "load", load_areas, round(height, 4)),
        ],
        frame_count=frame_count,
    )
