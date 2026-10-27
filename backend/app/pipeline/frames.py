"""Stage 1 — frame decoding / keyframe sampling (PLAN.md §5, LESSONS cost rule).

Sampling the clip at a low fps (2-4) is the first cost lever: the AI stages only
ever see the keyframes this stage produces, so we never pay to analyze 30 fps of
near-identical frames. The sampling is deterministic given the fps and clip, so a
re-run hashes to the same keyframes and hits the cache.

Decoding is optional by design. PyAV (``av``) is a heavy, wheels-not-always-there
dependency, so the import is guarded and feature-detected:

* video + PyAV available → decode and sample at the configured fps;
* image input → return the single frame (no decoder needed);
* no decoder available for a video → return an empty sample with
  ``decoder_available=False`` rather than raising, so the pipeline degrades
  instead of crashing.

Frames are returned as lightweight references (timestamp + index), not pixel
buffers — the rest of the pipeline keys off the content hash and these refs, and
decoding whole frames into memory is deferred to the worker when real media lands.
"""

from __future__ import annotations

import importlib.util
from dataclasses import dataclass, field

from app.config import get_settings

# Feature-detect PyAV without importing it (keeps this module import-safe when
# the optional `av` dependency is not installed).
_PYAV_AVAILABLE = importlib.util.find_spec("av") is not None

_IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp")


@dataclass(frozen=True, slots=True)
class FrameRef:
    """A reference to one sampled keyframe (no pixel data)."""

    index: int
    timestamp_s: float


@dataclass(frozen=True, slots=True)
class FrameSample:
    """Result of Stage 1: which keyframes were sampled, and whether we could decode."""

    media_kind: str  # "video" | "image"
    fps: float
    frames: list[FrameRef] = field(default_factory=list)
    decoder_available: bool = True
    # True when a video could not be decoded (no PyAV) and no frames were produced.
    degraded: bool = False

    @property
    def frame_count(self) -> int:
        return len(self.frames)


def _clamp_fps(fps: float) -> float:
    """Keep the sampling rate in the cost-safe 2-4 fps band (LESSONS cost rule)."""
    return max(2.0, min(4.0, fps))


def _is_image(filename: str) -> bool:
    return filename.lower().endswith(_IMAGE_SUFFIXES)


def _sample_with_pyav(data: bytes, fps: float) -> list[FrameRef]:
    """Decode a video with PyAV and pick keyframes at ``fps``.

    Imported lazily so the module stays import-safe without PyAV. CPU-bound work;
    the worker runs this in an executor off the event loop (agent protocol §4b).
    """
    import io

    import av

    frames: list[FrameRef] = []
    interval = 1.0 / fps
    next_at = 0.0
    index = 0
    # Hard cap on sampled keyframes, independent of clip length. SAM bills per
    # frame, so a 10-minute clip at 3 fps must not silently queue 1,800 frames;
    # we stop once the cap is reached (the whole clip is still represented by
    # evenly-spaced samples up to the cap). See pipeline/media.py.
    cap = get_settings().max_sampled_frames
    with av.open(io.BytesIO(data)) as container:
        stream = container.streams.video[0]
        time_base = float(stream.time_base) if stream.time_base else 0.0
        for frame in container.decode(stream):
            if len(frames) >= cap:
                break
            pts = frame.pts
            ts = pts * time_base if (pts is not None and time_base) else index * interval
            if ts + 1e-9 >= next_at:
                frames.append(FrameRef(index=index, timestamp_s=round(ts, 3)))
                next_at += interval
                index += 1
    return frames


def sample_frames(
    data: bytes,
    *,
    filename: str,
    media_kind: str,
    fps: float | None = None,
) -> FrameSample:
    """Sample keyframes from an upload at a cost-safe fps.

    * An image returns a single frame regardless of decoder availability.
    * A video is decoded with PyAV when available; otherwise the result is marked
      ``degraded`` with no frames (the pipeline reports it; it never crashes).

    ``fps`` defaults to ``settings.frame_sample_fps`` and is clamped to 2-4 fps.
    """
    rate = _clamp_fps(get_settings().frame_sample_fps if fps is None else fps)

    if media_kind == "image" or _is_image(filename):
        return FrameSample(
            media_kind="image",
            fps=rate,
            frames=[FrameRef(index=0, timestamp_s=0.0)],
            decoder_available=_PYAV_AVAILABLE,
            degraded=False,
        )

    if not _PYAV_AVAILABLE:
        return FrameSample(
            media_kind="video",
            fps=rate,
            frames=[],
            decoder_available=False,
            degraded=True,
        )

    frames = _sample_with_pyav(data, rate)
    return FrameSample(
        media_kind="video",
        fps=rate,
        frames=frames,
        decoder_available=True,
        degraded=False,
    )
