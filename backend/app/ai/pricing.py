"""Dollar cost of one Meta Model API response, from its ``usage`` block.

Muse Spark bills per token (input, cached input, output; reasoning tokens bill as
output). SAM 3.1 bills per image, or per video frame with a 50-frame minimum per
request (dev.meta.ai/docs/pricing-rate-limits). Token prices come from the model
catalog so the admin view and the ledger agree; SAM prices come from settings.
"""

from __future__ import annotations

from collections.abc import Mapping

from app.ai.catalog import MODELS
from app.config import get_settings

_FALLBACK_SPARK = "muse-spark-1.3"


def _int(value: object) -> int:
    return int(value) if isinstance(value, int | float) else 0


def token_counts(usage: Mapping[str, object]) -> tuple[int, int, int]:
    """(input, cached input, output) token counts from a Responses usage block."""
    details = usage.get("input_tokens_details")
    cached = _int(details.get("cached_tokens")) if isinstance(details, Mapping) else 0
    return _int(usage.get("input_tokens")), cached, _int(usage.get("output_tokens"))


def spark_cost_usd(model: str, usage: Mapping[str, object]) -> float:
    """Cost of one Spark response. Unknown models are priced as Spark 1.3."""
    info = MODELS.get(model) or MODELS[_FALLBACK_SPARK]
    price = info.pricing
    if price is None or price.input is None or price.output is None:
        return 0.0
    tokens_in, cached, tokens_out = token_counts(usage)
    cached = min(cached, tokens_in)
    cached_rate = price.cached_input if price.cached_input is not None else price.input
    cost = (
        (tokens_in - cached) * price.input + cached * cached_rate + tokens_out * price.output
    ) / 1_000_000
    return round(cost, 6)


def sam_billed_units(usage: Mapping[str, object], *, media_kind: str, frames_seen: int) -> int:
    """Images or frames SAM billed for one request.

    Uses the count the API reports when present, else the frames the response
    covered. Video requests bill at least the configured minimum.
    """
    if media_kind == "image":
        return max(1, _int(usage.get("images_processed")))
    reported = max(
        _int(usage.get("frames_processed")),
        _int(usage.get("video_frames_processed")),
        _int(usage.get("images_processed")),
    )
    frames = reported or frames_seen
    return max(get_settings().sam_video_min_billed_frames, frames)


def sam_cost_usd(usage: Mapping[str, object], *, media_kind: str, frames_seen: int) -> float:
    """Cost of one SAM response."""
    s = get_settings()
    units = sam_billed_units(usage, media_kind=media_kind, frames_seen=frames_seen)
    per_1k = s.sam_image_price_per_1k if media_kind == "image" else s.sam_video_frame_price_per_1k
    return round(units * per_1k / 1000, 6)
