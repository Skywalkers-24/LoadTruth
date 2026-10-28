"""Pre-send media preparation (app/pipeline/transcode.py)."""

from __future__ import annotations

import shutil
from pathlib import Path

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
