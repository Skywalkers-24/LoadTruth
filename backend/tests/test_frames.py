"""Tests for Stage 1 frame sampling (app.pipeline.frames).

Must pass with or without PyAV installed: an image always yields one frame, and
a video with no decoder degrades to an empty sample rather than crashing.
"""

import pytest

from app.pipeline import frames
from app.pipeline.frames import FrameSample, sample_frames


def test_image_returns_single_frame() -> None:
    s = sample_frames(b"\xff\xd8\xff", filename="frame.jpg", media_kind="image")
    assert s.media_kind == "image"
    assert s.frame_count == 1
    assert s.frames[0].index == 0
    assert not s.degraded


def test_image_detected_from_extension_even_if_kind_wrong() -> None:
    # media_kind says video but the filename is an image → treated as image.
    s = sample_frames(b"\x89PNG", filename="still.png", media_kind="video")
    assert s.media_kind == "image"
    assert s.frame_count == 1


def test_fps_is_clamped_to_cost_safe_band() -> None:
    low = sample_frames(b"x", filename="a.jpg", media_kind="image", fps=0.1)
    high = sample_frames(b"x", filename="a.jpg", media_kind="image", fps=60.0)
    assert low.fps == 2.0
    assert high.fps == 4.0


def test_fps_defaults_from_settings() -> None:
    s = sample_frames(b"x", filename="a.jpg", media_kind="image")
    assert 2.0 <= s.fps <= 4.0


def test_video_without_decoder_degrades_gracefully(monkeypatch: pytest.MonkeyPatch) -> None:
    # Force the "no PyAV" path regardless of what's installed.
    monkeypatch.setattr(frames, "_PYAV_AVAILABLE", False)
    s = sample_frames(b"not-a-real-video", filename="clip.mp4", media_kind="video")
    assert isinstance(s, FrameSample)
    assert s.media_kind == "video"
    assert s.frame_count == 0
    assert s.degraded
    assert not s.decoder_available


def test_frame_sample_frame_count_property() -> None:
    s = sample_frames(b"x", filename="a.jpg", media_kind="image")
    assert s.frame_count == len(s.frames)
