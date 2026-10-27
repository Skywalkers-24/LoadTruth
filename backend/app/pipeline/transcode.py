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


@dataclass(frozen=True, slots=True)
class PreparedBytes:
    """The bytes to send, their MIME type, and whether ffmpeg produced them."""

    data: bytes
    mime: str
    transcoded: bool = False


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
    with tempfile.TemporaryDirectory(prefix="lt-media-") as tmp:
        src, dst = Path(tmp) / f"in{suffix}", Path(tmp) / out_name
        await asyncio.to_thread(src.write_bytes, data)
        args = ffmpeg_args(
            src,
            dst,
            media_kind=media_kind,
            fps=s.frame_sample_fps,
            longest_edge=s.frame_downscale_longest_edge,
        )
        ok = await _run(ffmpeg, args, timeout_s=s.transcode_timeout_s)
        if not ok or not dst.exists():
            return original
        out = await asyncio.to_thread(dst.read_bytes)
    if not out:
        return original
    if media_kind == "image" and len(out) >= len(data):
        return original  # already small; keep the original pixels
    log.info(
        "media_prepared",
        media_kind=media_kind,
        bytes_in=len(data),
        bytes_out=len(out),
    )
    return PreparedBytes(out, "image/jpeg" if media_kind == "image" else "video/mp4", True)


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
