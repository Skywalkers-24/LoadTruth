"""Media optimization for Meta Model API calls (cost + payload shaping).

The pipeline keeps the same seven stages, but every byte sent to SAM/Spark costs
money and latency, so this module centralizes the decisions the Meta docs make
necessary (dev.meta.ai/docs/file-handling, image/video understanding):

* **Inline vs upload.** A Responses request carries a file inline up to **50 MB**
  (base64 ``file_data`` / ``file_url``). Above that you MUST use the Files API
  (up to **1 GiB**), which returns a reusable ``file_id``. Because one clip drives
  *three* model calls (SAM track, Spark OCR, Spark classify), uploading once and
  reusing the ``file_id`` sends the bytes once instead of three times — a 3×
  payload saving on anything big enough to upload. We also upload proactively
  below the hard cap (``media_inline_max_bytes``) so medium clips get the reuse
  win without re-base64-encoding per call.

* **Frame budget.** A single VLM request accepts at most **50 images**. The
  perception tasks (OCR a placard, classify debris) need only a few well-chosen
  keyframes, so we cap frames per task far below the budget and downscale each to
  a ``frame_downscale_longest_edge`` longest edge to keep tokens cheap
  (LEARNINGS §1: downscale before base64).

* **SAM frame cost.** SAM video segmentation bills per frame, so the sampled-
  frame count (Stage 1) is the dominant cost lever; we hard-cap it with
  ``max_sampled_frames`` regardless of clip duration/fps.

Nothing here calls Meta — it only decides *how* a clip should be sent. The live
client consumes these decisions; the mock ignores them (it keys off the hash).
This keeps the module pure and unit-testable with no network or heavy deps.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.config import get_settings


class SendMethod(StrEnum):
    """How a clip's bytes should reach the API."""

    INLINE = "inline"  # base64 in the request body (small, one-off)
    UPLOAD = "upload"  # Files API once → reuse file_id across calls (large/reused)


@dataclass(frozen=True, slots=True)
class MediaPlan:
    """The transport decision for one clip, shared across its model calls."""

    send_method: SendMethod
    size_bytes: int
    # True when the same uploaded file_id should be reused across SAM + Spark
    # calls for this clip (always the case for UPLOAD).
    reuse_across_calls: bool
    reason: str


class MediaTooLargeError(ValueError):
    """Raised when a clip exceeds the Files API hard ceiling (1 GiB)."""


# Files API hard ceiling from the docs (1 GiB).
_FILES_API_MAX_BYTES = 1_073_741_824


def plan_transport(size_bytes: int) -> MediaPlan:
    """Decide inline vs upload for a clip of ``size_bytes``.

    * ``> 1 GiB`` → rejected (Files API ceiling).
    * ``>= media_inline_max_bytes`` (default 8 MB) → upload once, reuse the
      ``file_id`` across this clip's SAM + Spark calls.
    * otherwise → inline (skip the upload round-trip for a small one-off).

    The hard 50 MB inline cap is also enforced: anything at/above it must upload
    even if the soft threshold were raised.
    """
    s = get_settings()
    if size_bytes > _FILES_API_MAX_BYTES:
        msg = (
            f"clip is {size_bytes} bytes, above the Files API ceiling "
            f"({_FILES_API_MAX_BYTES} bytes / 1 GiB)"
        )
        raise MediaTooLargeError(msg)

    must_upload = size_bytes >= s.media_upload_threshold_bytes
    should_upload = size_bytes >= s.media_inline_max_bytes
    if must_upload or should_upload:
        reason = (
            "above the 50 MB inline cap — upload required"
            if must_upload
            else "large enough to reuse one upload across SAM + Spark calls"
        )
        return MediaPlan(
            send_method=SendMethod.UPLOAD,
            size_bytes=size_bytes,
            reuse_across_calls=True,
            reason=reason,
        )
    return MediaPlan(
        send_method=SendMethod.INLINE,
        size_bytes=size_bytes,
        reuse_across_calls=False,
        reason="small one-off clip — inline avoids an upload round-trip",
    )


def cap_frames_for_sam(total_frames: int) -> int:
    """Number of keyframes SAM should segment, capped for cost.

    SAM bills per frame, so this bounds the dominant cost of a long clip.
    """
    return max(1, min(total_frames, get_settings().max_sampled_frames))


def select_keyframe_indices(total_frames: int, wanted: int | None = None) -> list[int]:
    """Pick up to ``wanted`` evenly spaced keyframe indices from ``total_frames``.

    Used to hand a VLM (Spark) a small, representative set of frames for a
    perception task without exceeding the per-request image budget. Even spacing
    beats "first N" for a moving truck — the placard/load is visible at different
    moments. Deterministic, so a re-run hits the cache.
    """
    s = get_settings()
    budget = min(
        wanted if wanted is not None else s.spark_frames_per_task,
        s.spark_max_images_per_request,
    )
    if total_frames <= 0 or budget <= 0:
        return []
    if total_frames <= budget:
        return list(range(total_frames))
    # Evenly spaced across the clip, inclusive of a near-start and near-end frame.
    step = total_frames / budget
    return [min(total_frames - 1, round(i * step + step / 2)) for i in range(budget)]


@dataclass(frozen=True, slots=True)
class DownscaleTarget:
    """Target dimensions for a frame before it's base64'd into a VLM request."""

    width: int
    height: int
    scaled: bool


def downscale_target(width: int, height: int) -> DownscaleTarget:
    """Compute the downscaled size for a frame, preserving aspect ratio.

    Caps the longest edge at ``frame_downscale_longest_edge`` (default 1024 px,
    per LEARNINGS §1). Never upscales. Returns the original size with
    ``scaled=False`` when the frame already fits.
    """
    longest = get_settings().frame_downscale_longest_edge
    if width <= 0 or height <= 0:
        return DownscaleTarget(width=width, height=height, scaled=False)
    longest_edge = max(width, height)
    if longest_edge <= longest:
        return DownscaleTarget(width=width, height=height, scaled=False)
    scale = longest / longest_edge
    return DownscaleTarget(
        width=max(1, round(width * scale)),
        height=max(1, round(height * scale)),
        scaled=True,
    )
