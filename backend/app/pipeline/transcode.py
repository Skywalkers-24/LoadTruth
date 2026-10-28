"""Shrink a clip before it goes to the Meta Model API (cost control).

SAM 3.1 bills per video frame and Muse Spark bills per input token, so the clip
we send is the main cost lever (LEARNINGS.md §5). When ``ffmpeg`` is installed
(it is in the backend Docker image) a video is resampled to ``frame_sample_fps``,
its audio is dropped, its longest edge is capped at
``frame_downscale_longest_edge``, and it is re-encoded as H.264 MP4 with the
index at the front (the only video type Muse Spark accepts). A still image is
downscaled to a JPEG the same way.

Geometry is a ratio of pixel areas, so downscaling does not move the fill %.
Without ffmpeg, or if it fails, the original bytes are used unchanged.
"""

from __future__ import annotations

import asyncio
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.log import get_logger
from app.pipeline.media import guess_mime

log = get_logger("pipeline.transcode")

# Anything smaller holds no decodable frame (an empty MP4 is about 260 bytes).
_MIN_OUTPUT_BYTES = 2048


@dataclass(frozen=True, slots=True)
class PreparedBytes:
    """The bytes to send, their MIME type, and whether ffmpeg produced them."""

    data: bytes
    mime: str
    transcoded: bool = False
    # The fps the video was resampled to (None for an image or untranscoded).
    # The Review player uses it to map SAM frame indexes to playback time.
    fps: float | None = None


async def _probe_duration_s(ffmpeg_dir_hint: str, src: Path) -> float | None:
    """The clip's duration in seconds via ffprobe, or None if it can't be read."""
    ffprobe = shutil.which("ffprobe")
    if ffprobe is None:
        return None
    try:
        proc = await asyncio.create_subprocess_exec(
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(src),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=20.0)
    except (OSError, TimeoutError):
        return None
    try:
        seconds = float(out.decode().strip())
    except ValueError:
        return None
    return seconds if seconds > 0 else None


def _fps_for_target(duration_s: float | None, target_frames: int) -> float:
    """fps that samples ~``target_frames`` evenly across a clip of this duration.

    Independent of the clip's length: a 10s clip and a 40s clip both yield about
    ``target_frames`` evenly spaced frames. Clamped to 1..30 fps so a very short
    or very long clip stays sane. Falls back to a mid rate if duration is unknown.
    """
    if not duration_s or duration_s <= 0:
        return 6.0
    return max(1.0, min(30.0, target_frames / duration_s))


def _scale_filter(longest_edge: int) -> str:
    # Cap the longest edge, keep the aspect ratio, keep both sides even (H.264).
    edge = max(16, longest_edge)
    return f"scale='if(gt(iw,ih),min({edge},iw),-2)':'if(gt(iw,ih),-2,min({edge},ih))'"


def ffmpeg_args(
    src: Path, dst: Path, *, media_kind: str, fps: float, longest_edge: int
) -> list[str]:
    """The ffmpeg argument list (no shell) for one preparation."""
    base = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(src)]
    scale = _scale_filter(longest_edge)
    if media_kind == "image":
        return [*base, "-vf", scale, "-frames:v", "1", "-q:v", "3", str(dst)]
    return [
        *base,
        "-vf",
        f"fps={fps:g},{scale}",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(dst),
    ]


async def prepare_media(data: bytes, *, media_kind: str, filename: str) -> PreparedBytes:
    """Return the bytes to send to Meta for one clip (see module docstring)."""
    original = PreparedBytes(data, guess_mime(filename, media_kind))
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None or not data:
        return original
    s = get_settings()
    suffix = Path(filename).suffix.lower() or (".jpg" if media_kind == "image" else ".mp4")
    out_name = "out.jpg" if media_kind == "image" else "out.mp4"
    fps = s.frame_sample_fps
    with tempfile.TemporaryDirectory(prefix="lt-media-") as tmp:
        src, dst = Path(tmp) / f"in{suffix}", Path(tmp) / out_name
        await asyncio.to_thread(src.write_bytes, data)
        if media_kind != "image":
            # Resample so the clip yields ~target_sampled_frames evenly spaced
            # frames whatever its length, so SAM measures the same number of
            # frames for a 10s clip and a 40s clip.
            duration = await _probe_duration_s(ffmpeg, src)
            fps = _fps_for_target(duration, s.target_sampled_frames)
        args = ffmpeg_args(
            src,
            dst,
            media_kind=media_kind,
            fps=fps,
            longest_edge=s.frame_downscale_longest_edge,
        )
        ok = await _run(ffmpeg, args, timeout_s=s.transcode_timeout_s)
        if not ok or not dst.exists():
            return original
        out = await asyncio.to_thread(dst.read_bytes)
    if len(out) < _MIN_OUTPUT_BYTES:
        # A container with no frames (e.g. the fps filter dropped a one-frame
        # clip). Sending it would segment nothing, so keep the original.
        log.warning("media_prepare_empty_output", bytes_in=len(data), bytes_out=len(out))
        return original
    if media_kind == "image" and len(out) >= len(data):
        return original  # already small; keep the original pixels
    log.info(
        "media_prepared",
        media_kind=media_kind,
        bytes_in=len(data),
        bytes_out=len(out),
    )
    return PreparedBytes(
        out,
        "image/jpeg" if media_kind == "image" else "video/mp4",
        True,
        fps=None if media_kind == "image" else fps,
    )


async def _run(ffmpeg: str, args: list[str], *, timeout_s: float) -> bool:
    """Run ffmpeg; return True on success. Never raises."""
    try:
        proc = await asyncio.create_subprocess_exec(
            ffmpeg,
            *args,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError:
        log.warning("ffmpeg_start_failed", exc_info=True)
        return False
    try:
        _, err = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        log.warning("ffmpeg_timeout", timeout_s=timeout_s)
        return False
    if proc.returncode != 0:
        log.warning(
            "ffmpeg_failed", code=proc.returncode, stderr=err.decode(errors="replace")[:300]
        )
        return False
    return True
