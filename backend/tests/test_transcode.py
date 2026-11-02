"""Pre-send media preparation (app/pipeline/transcode.py)."""

from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from typing import Any

import pytest

from app.pipeline.transcode import _fps_for_target, ffmpeg_args, prepare_media


def test_fps_targets_a_fixed_frame_count_regardless_of_duration() -> None:
    # ~60 frames whatever the clip length: short clips sample faster, long slower.
    assert _fps_for_target(10.0, 60) == 6.0
    assert _fps_for_target(30.0, 60) == 2.0
    assert round(_fps_for_target(40.0, 60), 3) == 1.5
    # Clamped so a very short or very long clip stays in a sane fps band.
    assert _fps_for_target(1.0, 60) == 30.0
    assert _fps_for_target(600.0, 60) == 1.0
    # Unknown duration falls back to a mid rate, never 0.
    assert _fps_for_target(None, 60) == 6.0
    assert _fps_for_target(0.0, 60) == 6.0


def test_video_args_resample_drop_audio_and_faststart() -> None:
    args = ffmpeg_args(
        Path("in.mov"), Path("out.mp4"), media_kind="video", fps=3, longest_edge=1024
    )
    vf = args[args.index("-vf") + 1]
    assert vf.startswith("fps=3,scale=")
    assert "min(1024,iw)" in vf
    assert "-an" in args
    assert args[args.index("-c:v") + 1] == "libx264"
    assert "+faststart" in args
    assert args[-1] == "out.mp4"


def test_image_args_take_one_frame() -> None:
    args = ffmpeg_args(Path("in.png"), Path("out.jpg"), media_kind="image", fps=3, longest_edge=800)
    assert "-frames:v" in args and "fps=" not in " ".join(args)
    assert "min(800,iw)" in args[args.index("-vf") + 1]


@pytest.mark.asyncio
async def test_without_ffmpeg_the_original_bytes_are_sent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.pipeline.transcode.shutil.which", lambda _: None)
    out = await prepare_media(b"raw", media_kind="video", filename="clip.mov")
    assert out.data == b"raw"
    assert out.mime == "video/quicktime"
    assert out.transcoded is False


@pytest.mark.asyncio
async def test_ffmpeg_failure_falls_back_to_the_original() -> None:
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg is not installed on this host")
    out = await prepare_media(b"not a video", media_kind="video", filename="clip.mp4")
    assert out.data == b"not a video"
    assert out.transcoded is False


@pytest.mark.asyncio
async def test_video_transcode_success_without_host_ffmpeg(monkeypatch: pytest.MonkeyPatch) -> None:
    """Exercise the success path with a mocked executable, independent of host tools."""
    from app.pipeline import transcode

    monkeypatch.setattr("shutil.which", lambda name: "/mock/ffmpeg")

    async def probe(_hint: object, _src: object) -> float:
        return 10.0

    async def run(_ffmpeg: object, args: list[str], *, timeout_s: float) -> bool:
        await asyncio.to_thread(Path(args[-1]).write_bytes, b"x" * 3000)
        return True

    monkeypatch.setattr(transcode, "_probe_duration_s", probe)
    monkeypatch.setattr(transcode, "_run", run)
    result = await prepare_media(b"original-video", media_kind="video", filename="clip.mov")
    assert result.transcoded is True
    assert result.mime == "video/mp4"
    assert result.fps is not None and result.fps > 0
    assert len(result.data) == 3000


@pytest.mark.asyncio
async def test_image_transcode_keeps_original_when_output_is_larger(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.pipeline import transcode

    monkeypatch.setattr("shutil.which", lambda name: "/mock/ffmpeg")

    async def run(_ffmpeg: object, args: list[str], *, timeout_s: float) -> bool:
        await asyncio.to_thread(Path(args[-1]).write_bytes, b"x" * 3000)
        return True

    monkeypatch.setattr(transcode, "_run", run)
    original = b"original-image"
    result = await prepare_media(original, media_kind="image", filename="photo.png")
    assert result.data == original
    assert result.transcoded is False


@pytest.mark.asyncio
async def test_partner_media_image_parts_and_size_limit() -> None:
    from app.ai.meta_http import ModelAPIRequestError
    from app.ai.partner_media import media_parts, meta_keyframe_parts

    parts = await media_parts(b"image-bytes", "image/png", "image")
    assert parts[0]["text"] == "Sampled frame near 0.00s."
    assert "data:image/png;base64," in parts[1]["image_url"]["url"]
    meta_parts = await meta_keyframe_parts(b"image-bytes", "image/png", "image")
    assert meta_parts[0]["type"] == "input_text"
    assert "data:image/png;base64," in meta_parts[1]["image_url"]
    with pytest.raises(ModelAPIRequestError, match="too large"):
        await media_parts(b"x" * 7_000_001, "image/png", "image")


@pytest.mark.asyncio
async def test_preserve_source_frames_falls_back_if_frame_rate_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from types import SimpleNamespace

    from app.pipeline import transcode

    monkeypatch.setattr("shutil.which", lambda name: "/mock/ffmpeg")
    monkeypatch.setattr(
        transcode,
        "get_settings",
        lambda: SimpleNamespace(preserve_source_frames=True, frame_sample_fps=6.0),
    )

    async def probe(_src: object) -> float | None:
        return None

    monkeypatch.setattr(transcode, "_probe_fps", probe)
    result = await prepare_media(b"raw", media_kind="video", filename="clip.mp4")
    assert result.transcoded is False
    assert result.data == b"raw"


@pytest.mark.asyncio
async def test_partner_video_media_requires_ffmpeg(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.ai import partner_media
    from app.ai.meta_http import ModelAPIRequestError

    monkeypatch.setattr("shutil.which", lambda _name: None)
    with pytest.raises(ModelAPIRequestError, match="ffmpeg is required"):
        await partner_media.media_parts(b"video", "video/mp4", "video")


@pytest.mark.asyncio
async def test_probe_helpers_return_none_without_ffprobe(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.pipeline import transcode

    monkeypatch.setattr("shutil.which", lambda _name: None)
    assert await transcode._probe_duration_s("", Path("missing.mp4")) is None
    assert await transcode._probe_fps(Path("missing.mp4")) is None


@pytest.mark.asyncio
async def test_empty_media_returns_original_without_transcode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("shutil.which", lambda _name: "/mock/ffmpeg")
    result = await prepare_media(b"", media_kind="video", filename="clip.mp4")
    assert result.data == b""
    assert result.transcoded is False


@pytest.mark.asyncio
async def test_ffmpeg_start_error_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.pipeline import transcode

    async def fail(*_args: object, **_kwargs: object) -> Any:
        raise OSError("not installed")

    monkeypatch.setattr("asyncio.create_subprocess_exec", fail)
    assert await transcode._run("/mock/ffmpeg", [], timeout_s=1) is False
