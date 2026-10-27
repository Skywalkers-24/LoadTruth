"""Tests for the media-optimization decisions (inline vs upload, frame budgets).

These encode the Meta Model API limits the pipeline must respect (50 MB inline,
1 GiB upload ceiling, 50-image VLM budget, downscale target) so a regression in
the cost/payload logic fails loudly.
"""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.pipeline.media import (
    MediaTooLargeError,
    SendMethod,
    cap_frames_for_sam,
    downscale_target,
    plan_transport,
    select_keyframe_indices,
)


def test_small_clip_goes_inline() -> None:
    plan = plan_transport(1_000_000)  # 1 MB
    assert plan.send_method is SendMethod.INLINE
    assert plan.reuse_across_calls is False


def test_medium_clip_uploads_for_reuse() -> None:
    # Between the soft reuse threshold (8 MB) and the 50 MB hard cap.
    plan = plan_transport(20_000_000)
    assert plan.send_method is SendMethod.UPLOAD
    assert plan.reuse_across_calls is True


def test_large_clip_must_upload() -> None:
    plan = plan_transport(60_000_000)  # over the 50 MB inline cap
    assert plan.send_method is SendMethod.UPLOAD
    assert "inline cap" in plan.reason


def test_oversized_clip_rejected() -> None:
    with pytest.raises(MediaTooLargeError):
        plan_transport(2_000_000_000)  # ~2 GiB, over the Files API ceiling


def test_sam_frame_cap() -> None:
    cap = get_settings().max_sampled_frames
    assert cap_frames_for_sam(10) == 10
    assert cap_frames_for_sam(cap + 500) == cap
    assert cap_frames_for_sam(0) == 1


def test_keyframe_selection_respects_budget() -> None:
    budget = get_settings().spark_frames_per_task
    idx = select_keyframe_indices(100)
    assert len(idx) == budget
    assert idx == sorted(idx)
    assert all(0 <= i < 100 for i in idx)


def test_keyframe_selection_small_clip_returns_all() -> None:
    assert select_keyframe_indices(2) == [0, 1]


def test_keyframe_selection_never_exceeds_image_budget() -> None:
    idx = select_keyframe_indices(10_000, wanted=1000)
    assert len(idx) <= get_settings().spark_max_images_per_request


def test_downscale_caps_longest_edge() -> None:
    longest = get_settings().frame_downscale_longest_edge
    t = downscale_target(4000, 2000)  # 4K-ish
    assert t.scaled is True
    assert max(t.width, t.height) == longest
    # Aspect ratio preserved (2:1).
    assert t.width == longest and t.height == longest // 2


def test_downscale_leaves_small_frames_untouched() -> None:
    t = downscale_target(640, 360)
    assert t.scaled is False
    assert (t.width, t.height) == (640, 360)
