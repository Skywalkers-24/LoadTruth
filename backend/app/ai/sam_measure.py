"""Turn SAM 3.1 segmentation output into the measurements Stage 5 consumes.

SAM takes one noun phrase per request, so a clip is segmented once per concept,
all requests in parallel (see ``app.ai.live``). Each response is special-token
text (one line per frame, a box and a mask per object; see
dev.meta.ai/docs/sam/reading-segmentation), parsed here with Meta's official
``meta_sam_parser``. Every region below comes from a SAM mask; this module only
does the arithmetic over them.

How the bed reads from a gate camera (measurement v2)
-----------------------------------------------------
The camera sits high behind the truck and looks down into the bed. Three SAM
concepts carry the measurement:

* **bed** (``truck bed``) — the dump body: the tailgate face and, above it, the
  visible inside of the bed (side walls, headboard, floor) wherever the load
  does not cover it.
* **tailgate** — SAM's tailgate mask. Its top edge is the rear rim of the bed.
  Everything of the bed above that line is the bed **opening**.
* **load** (``debris pile``, ``pile``) — the material in the bed. Several
  phrases run in parallel because one phrase misses some loads (palm fronds
  are a "pile" but not a "debris pile"); their masks are merged.

Per frame: the **opening** is every row from the top of the bed to the tailgate
rim, counted wall to wall (bed OR load), so shadows stay in the denominator.
**Coverage** is the load inside the opening divided by the opening, plus load
heaped above the front rim, capped at a full bed. An empty bed shows its floor
and walls (coverage 0); a load level with the rails hides them (coverage 1).
When SAM finds no tailgate (a top-down camera) the whole bed is the opening.
When no load phrase matched inside the bed the load source is ``none``: the
fill reads 0 and the pipeline flags the ticket, it never guesses.

Frames are chosen for quality: frames where the bed box touches the image edge
(the truck is cut off) are skipped when enough whole frames remain, and so are
frames where the truck is far away and small. The spread of per-frame coverage
is reported so frames that disagree lower confidence.

Every number is a pixel count or a ratio of pixel counts, so the fill % stays
auditable. Mask decoding is CPU work; callers run :func:`measure` in a thread.
"""

from __future__ import annotations

import re
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

# Keys of the stored SAM output (TrackResult.segments). The overlay draws the
# bed and load keys; every load phrase is also kept under LOAD_PREFIX + phrase.
BED_LABEL = "truck bed"
LOAD_LABEL = "debris pile"
RIM_LABEL = "tailgate"
LOAD_PREFIX = "load: "

# Which SAM phrase gave the bed: the bed itself, or (when no bed phrase matched)
# the whole truck, a coarser outline that lowers confidence.
BED_FROM_BED = "bed"
BED_FROM_TRUCK = "truck"

# Bumped whenever the measurement method OR the SAM concept set changes, so
# stored tracks from an older run are re-evaluated: re-measured offline when the
# stored masks suffice, else re-run through SAM (to pick up new/named load
# concepts). v3: Muse Spark now names the load concepts per clip and the load
# set gained "barrels and containers", so a v2 track that found no load must get
# another SAM pass rather than keep its stale 0%.
MEASURE_VERSION = 3

# How the load was measured on the selected frames.
LOAD_SEGMENTED = "segmented"  # a SAM load phrase matched inside the bed
LOAD_NONE = "none"  # no SAM load phrase matched inside the bed

_SIZE = re.compile(r";w=(\d+);h=(\d+)")
# Frames whose bed is smaller than this share of the largest are too far away.
_MIN_AREA_SHARE = 0.35
# Keep at least this many frames after quality filtering.
_MIN_GOOD_FRAMES = 3
# Load heaped above the front rim may lift coverage to at most a full bed.
_MAX_COVERAGE = 1.0
# Depth term reported for gate-camera measurements: coverage already reads depth.
_GATE_DEPTH = 1.0
# A tailgate top must sit in the lower part of the bed box to count as its rim.
_RIM_MIN_SHARE = 0.25


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
    media_size: tuple[int, int] | None = None  # (width, height) of the frame


@dataclass(frozen=True, slots=True)
class FrameMeasure:
    """What one frame measured inside the bed opening."""

    frame: int
    opening_px: int
    load_px: int  # SAM load pixels in the opening, plus load above the front rim
    rim_y: int
    rim_from_tailgate: bool
    clipped: bool
    bed_area: int  # bed silhouette area, for frame quality

    @property
    def coverage(self) -> float:
        return min(_MAX_COVERAGE, self.load_px / self.opening_px) if self.opening_px else 0.0


def parse_segmentation(text: str, *, media_kind: str) -> list[Detection]:
    """Parse one SAM response's output text into per-frame detections."""
    if not text.strip():
        return []
    size_match = _SIZE.search(text)
    size = (int(size_match.group(1)), int(size_match.group(2))) if size_match else None
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
        out.append(Detection(frame, oid, box, m.mask if m is not None else None, origin, size))
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


class _Rows:
    """A detection's mask read as 0/1 byte rows, clipped to a column window."""

    def __init__(self, d: Detection, x0: int, x1: int) -> None:
        self._x0, self._x1 = x0, x1
        self._d = d
        self._raster = decode_mask_to_raster(d.mask) if d.mask is not None else None

    def row(self, y: int) -> bytes:
        """Image row ``y`` between the window columns, as 0/1 bytes."""
        width = self._x1 - self._x0
        d = self._d
        if self._raster is None or d.mask is None:
            # Box-only detection: the box itself is the mask.
            if not d.box.top <= y < d.box.bottom:
                return bytes(width)
            a, b = max(self._x0, d.box.left), min(self._x1, d.box.right)
            body = b"\x01" * max(0, b - a)
        else:
            mx, my = d.mask_origin
            mw, mh = d.mask.width, d.mask.height
            if not my <= y < my + mh:
                return bytes(width)
            a, b = max(self._x0, mx), min(self._x1, mx + mw)
            start = (y - my) * mw + (a - mx)
            body = bytes(self._raster[start : start + max(0, b - a)])
        if b <= a:
            return bytes(width)
        return bytes(a - self._x0) + body + bytes(self._x1 - b)


def _or(a: bytes, b: bytes) -> bytes:
    return (int.from_bytes(a, "big") | int.from_bytes(b, "big")).to_bytes(len(a), "big")


def _overlaps(a: Box, b: Box) -> bool:
    return min(a.right, b.right) > max(a.left, b.left) and min(a.bottom, b.bottom) > max(
        a.top, b.top
    )


def _rim_y(bed: Box, tailgates: list[Detection]) -> int | None:
    """The bed's rear rim: the top of SAM's tailgate mask on this bed, if any."""
    floor = bed.top + (bed.bottom - bed.top) * _RIM_MIN_SHARE
    tops = [
        t.box.top for t in tailgates if _overlaps(t.box, bed) and floor <= t.box.top < bed.bottom
    ]
    return min(tops) if tops else None


def measure_frame(
    bed: Detection, loads: list[Detection], tailgates: list[Detection] | None = None
) -> FrameMeasure:
    """Measure one frame: the bed opening above SAM's tailgate rim, and the load in it."""
    box = bed.box
    x0, x1 = box.left, box.right
    rim = _rim_y(box, tailgates or [])
    rim_line = rim if rim is not None else box.bottom
    in_bed = [ld for ld in loads if _overlaps(ld.box, box)]
    bed_rows = _Rows(bed, x0, x1)
    load_rows = [_Rows(ld, x0, x1) for ld in in_bed]
    y_start = min([box.top] + [ld.box.top for ld in in_bed])

    zero = bytes(x1 - x0)
    opening = load_px = heap_px = bed_area = 0
    for y in range(max(0, y_start), box.bottom):
        b = bed_rows.row(y)
        lr = zero
        for rows in load_rows:
            lr = _or(lr, rows.row(y))
        load_count = lr.count(1)
        if y < box.top:
            heap_px += load_count  # load heaped above the front rim
            continue
        bed_area += b.count(1)
        if y >= rim_line:
            continue  # the tailgate face, not the opening
        sil = _or(b, lr)
        first = sil.find(1)
        if first < 0:
            continue
        opening += sil.rfind(1) - first + 1
        load_px += load_count

    clipped = False
    if bed.media_size is not None:
        w, h = bed.media_size
        clipped = box.left <= 0 or box.top <= 0 or box.right >= w - 1 or box.bottom >= h - 1
    return FrameMeasure(
        frame=bed.frame,
        opening_px=opening,
        load_px=load_px + heap_px,
        rim_y=rim_line,
        rim_from_tailgate=rim is not None,
        clipped=clipped,
        bed_area=bed_area,
    )


def _good_frames(measures: list[FrameMeasure]) -> list[FrameMeasure]:
    """Prefer frames with a SAM rim, whole in view, and close to the camera."""
    usable = [m for m in measures if m.opening_px > 0]
    with_rim = [m for m in usable if m.rim_from_tailgate]
    if len(with_rim) >= _MIN_GOOD_FRAMES:
        usable = with_rim
    if not usable:
        return []
    # Cut-off frames first: their boxes are the largest, so they would make
    # every whole frame look far away.
    whole = [m for m in usable if not m.clipped]
    if len(whole) >= _MIN_GOOD_FRAMES:
        usable = whole
    largest = max(m.bed_area for m in usable)
    close = [m for m in usable if m.bed_area >= largest * _MIN_AREA_SHARE]
    return close if len(close) >= _MIN_GOOD_FRAMES else usable


def _spread(values: list[float]) -> float:
    """Interquartile spread of per-frame coverages (0 for fewer than 4 frames)."""
    if len(values) < 4:
        return 0.0
    ordered = sorted(values)
    q = len(ordered) // 4
    return round(ordered[-1 - q] - ordered[q], 4)


def measure(
    bed_run: list[Detection],
    load_run: list[Detection],
    *,
    media_kind: str,
    max_frames: int,
    rim_run: list[Detection] | None = None,
) -> TrackResult:
    """Build the Stage-2 ``TrackResult`` from the bed, load, and tailgate responses.

    ``load_run`` may hold the merged detections of several load phrases.
    """
    frame_count = 1 if media_kind == "image" else frames_covered(bed_run, load_run)
    if not bed_run:
        return TrackResult(
            objects=[],
            frame_count=frame_count,
            load_source=LOAD_NONE,
            measure_version=MEASURE_VERSION,
        )

    # The truck being measured: the bed track with the largest total box area.
    totals: dict[str, int] = defaultdict(int)
    for d in bed_run:
        totals[d.object_id] += d.box.area
    bed_id = max(totals, key=lambda k: totals[k])
    bed_by_frame = {d.frame: d for d in bed_run if d.object_id == bed_id}
    loads_by_frame: dict[int, list[Detection]] = defaultdict(list)
    for d in load_run:
        loads_by_frame[d.frame].append(d)
    rims_by_frame: dict[int, list[Detection]] = defaultdict(list)
    for d in rim_run or []:
        rims_by_frame[d.frame].append(d)

    frames = _even_sample(sorted(bed_by_frame), max_frames)
    measures = [
        measure_frame(bed_by_frame[f], loads_by_frame.get(f, []), rims_by_frame.get(f, []))
        for f in frames
    ]
    good = _good_frames(measures)

    coverages = [m.coverage for m in good]
    source = LOAD_SEGMENTED if any(m.load_px > 0 for m in good) else LOAD_NONE
    rim_frames = sum(1 for m in good if m.rim_from_tailgate)

    # Per-frame load area at that frame's coverage, so averaging the two area
    # lists (as the orchestrator and Re-verify do) reproduces a frame-weighted
    # coverage over the good frames.
    bed_areas = [float(m.opening_px) for m in good]
    load_areas = [round(c * m.opening_px, 1) for c, m in zip(coverages, good, strict=True)]
    return TrackResult(
        objects=[
            TrackedObject(BED_LABEL, f"bed-{bed_id}", bed_areas, 0.0),
            # From the gate camera the opening coverage already reads depth, so
            # the depth term is 1.0 (see app.pipeline.geometry).
            TrackedObject(LOAD_LABEL, "load", load_areas, _GATE_DEPTH),
        ],
        frame_count=frame_count,
        notes={"Rim from tailgate": f"{rim_frames} of {len(good)} measured frames"},
        load_source=source,
        coverage_spread=_spread(coverages),
        measure_version=MEASURE_VERSION,
    )


def remeasure(stored: TrackResult, *, media_kind: str, max_frames: int) -> TrackResult:
    """Re-run the current measurement over a stored track's raw SAM output.

    Offline and free: it parses the SAM text kept on the stored result (no model
    call) and keeps the stored segments and notes, so the Review overlay and the
    trace are unchanged while the numbers move to the current method.
    """
    bed = parse_segmentation(stored.segments.get(BED_LABEL, ""), media_kind=media_kind)
    rim = parse_segmentation(stored.segments.get(RIM_LABEL, ""), media_kind=media_kind)
    phrase_keys = [k for k in stored.segments if k.startswith(LOAD_PREFIX)] or [LOAD_LABEL]
    load = [
        d
        for k in phrase_keys
        for d in parse_segmentation(stored.segments.get(k, ""), media_kind=media_kind)
    ]
    fresh = measure(bed, load, media_kind=media_kind, max_frames=max_frames, rim_run=rim)
    return TrackResult(
        objects=fresh.objects,
        frame_count=stored.frame_count or fresh.frame_count,
        usage=stored.usage,
        segments=dict(stored.segments),
        notes={**stored.notes, **fresh.notes},
        analysis=stored.analysis,
        load_source=fresh.load_source,
        coverage_spread=fresh.coverage_spread,
        measure_version=fresh.measure_version,
        bed_source=stored.bed_source,
    )
