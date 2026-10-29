"""Portable VLM input: images or a bounded set of timestamped video keyframes."""

from __future__ import annotations

import asyncio
import base64
import shutil
import tempfile
from pathlib import Path
from typing import Any

from app.ai.meta_http import ModelAPIRequestError
from app.config import get_settings
from app.pipeline.transcode import _probe_duration_s, _scale_filter


def image_part(data: bytes, mime: str) -> dict[str, Any]:
    encoded = base64.b64encode(data).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}}


async def _extract_keyframes(data: bytes, media_kind: str) -> list[tuple[float, bytes]]:
    if media_kind == "image":
        return [(0.0, data)]
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise ModelAPIRequestError("ffmpeg is required for partner video keyframes.")
    s = get_settings()
    wanted = max(1, min(s.spark_frames_per_task, 8))
    with tempfile.TemporaryDirectory(prefix="loadtruth-vlm-") as folder:
        root = Path(folder)
        src = root / "clip.mp4"
        await asyncio.to_thread(src.write_bytes, data)
        duration = await _probe_duration_s("", src)
        if not duration:
            raise ModelAPIRequestError("Cannot read video duration for partner vision input.")
        proc = await asyncio.create_subprocess_exec(
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-i",
            str(src),
            "-vf",
            f"fps={wanted / duration:g},{_scale_filter(s.frame_downscale_longest_edge)}",
            "-frames:v",
            str(wanted),
            "-q:v",
            "3",
            str(root / "frame-%02d.jpg"),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(proc.wait(), timeout=s.transcode_timeout_s)
        except (TimeoutError, asyncio.CancelledError):
            proc.kill()
            await proc.wait()
            raise
        frames = await asyncio.to_thread(lambda: sorted(root.glob("frame-*.jpg")))
        if proc.returncode or not frames:
            raise ModelAPIRequestError("Cannot extract partner vision keyframes.")
        return [
            (index * duration / wanted, await asyncio.to_thread(frame.read_bytes))
            for index, frame in enumerate(frames)
        ]


async def media_parts(data: bytes, mime: str, media_kind: str) -> list[dict[str, Any]]:
    frames = await _extract_keyframes(data, media_kind)
    if media_kind == "image" and len(data) > 7_000_000:
        raise ModelAPIRequestError("Partner image input is too large; use a smaller image.")
    if media_kind == "video" and not frames:
        raise ModelAPIRequestError("Cannot extract partner vision keyframes.")
    parts: list[dict[str, Any]] = []
    total = 0
    for timestamp, image in frames:
        total += len(image)
        parts.extend(
            [
                {"type": "text", "text": f"Sampled frame near {timestamp:.2f}s."},
                image_part(image, "image/jpeg" if media_kind == "video" else mime),
            ]
        )
    if total > 7_000_000:
        raise ModelAPIRequestError("Partner keyframes exceed the image budget.")
    return parts


async def meta_keyframe_parts(data: bytes, mime: str, media_kind: str) -> list[dict[str, str]]:
    """Extract individual images for Muse so it can estimate and combine each frame."""
    frames = await _extract_keyframes(data, media_kind)
    if media_kind == "video" and len(frames) < 2:
        raise ModelAPIRequestError("Muse fill estimation needs at least two video keyframes.")
    parts: list[dict[str, str]] = []
    total = 0
    image_mime = "image/jpeg" if media_kind == "video" else mime
    for index, (timestamp, image) in enumerate(frames, start=1):
        total += len(image)
        encoded = base64.b64encode(image).decode("ascii")
        parts.extend(
            [
                {
                    "type": "input_text",
                    "text": f"Frame {index}, sampled near {timestamp:.2f}s.",
                },
                {
                    "type": "input_image",
                    "image_url": f"data:{image_mime};base64,{encoded}",
                },
            ]
        )
    if total > 7_000_000:
        raise ModelAPIRequestError("Muse keyframes exceed the image budget.")
    return parts
