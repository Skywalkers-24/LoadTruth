"""Application configuration, validated on boot from the environment.

Secrets come from the repo-root `.env` (gitignored). The service-role key is
server-side only and must never be exposed to the frontend bundle.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root is two levels up from this file: backend/app/config.py -> repo/
_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Typed, validated settings. Fails fast at startup if required vars are missing."""

    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Meta Model API
    model_api_key: str = Field(default="TO_BE_UPDATED_LATER", alias="MODEL_API_KEY")
    model_api_base_url: str = Field(default="https://api.meta.ai/v1")
    sam_model: str = Field(default="sam-3.1")
    spark_model: str = Field(default="muse-spark-1.3")

    # Database. Defaults to a local SQLite file (async aiosqlite) until Supabase
    # Postgres is wired; then set DATABASE_URL to the postgresql+asyncpg URL.
    database_url: str = Field(default="sqlite+aiosqlite:///./loadtruth.db", alias="DATABASE_URL")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_anon_key: str = Field(default="", alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    # Supabase JWT signing secret (HS256) — verifies access tokens on the API.
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")

    # Redis / background worker
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Runtime
    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Pipeline cost controls (see PLAN.md §5, §5a, LESSONS.md)
    frame_sample_fps: float = Field(default=3.0)
    spark_max_output_tokens: int = Field(default=4000)

    # ── Meta Model API media limits + optimization knobs ──
    # Grounded in the Meta docs (dev.meta.ai/docs/file-handling, image/video
    # understanding): inline requests cap at 50 MB; the Files API accepts up to
    # 1 GiB and returns a reusable `file_id`; a single VLM request accepts at
    # most 50 images. SAM video segmentation bills per frame ($0.20/1k frames),
    # so the sampled-frame count is the dominant cost lever.
    #
    # Inline vs upload: anything at/above this many bytes is uploaded once via
    # the Files API and referenced by `file_id` across all per-clip calls
    # (SAM track + Spark OCR + Spark classify), so the bytes are sent once, not
    # three times. Smaller clips go inline to skip the upload round-trip.
    media_inline_max_bytes: int = Field(default=8_000_000)  # 8 MB; well under the 50 MB cap
    # Hard inline ceiling from the docs; above this we MUST upload.
    media_upload_threshold_bytes: int = Field(default=50_000_000)  # 50 MB
    # Max frames a single VLM (Spark) request may carry (Meta's image budget).
    spark_max_images_per_request: int = Field(default=50)
    # Frames we actually send Spark for a perception task (OCR/classify). A few
    # well-chosen keyframes are plenty and keep token cost low; never exceed the
    # image budget above.
    spark_frames_per_task: int = Field(default=4)
    # Output-token caps per Spark call type. Muse Spark is a reasoning model and
    # its reasoning tokens count against `max_output_tokens` (dev.meta.ai/docs/
    # reasoning), so a tight cap returns an empty answer. Billing is on tokens
    # actually generated, so a roomy cap costs nothing extra; low reasoning
    # effort is what keeps perception calls cheap.
    spark_perception_max_output_tokens: int = Field(default=4000)  # OCR / classify
    spark_narrate_max_output_tokens: int = Field(default=2000)  # one-line flag narrative
    analyst_max_output_tokens: int = Field(default=4000)  # grounded analyst answer

    # ── Live Meta client (app/ai/live.py) ──
    model_api_timeout_s: float = Field(default=300.0)
    # Retries for 429 / 5xx / network errors (a 400 is permanent, never retried).
    model_api_max_retries: int = Field(default=2)
    # SAM takes one short noun phrase per request (dev.meta.ai/docs/sam/segmenting),
    # so the clip is segmented once per concept. Tune these on real footage.
    sam_bed_concept: str = Field(default="truck bed")
    sam_load_concept: str = Field(default="debris pile")
    # SAM pricing (dev.meta.ai/docs/pricing-rate-limits): images per 1k, video per
    # 1k frames with a 50-frame minimum per request.
    sam_image_price_per_1k: float = Field(default=2.50)
    sam_video_frame_price_per_1k: float = Field(default=0.20)
    sam_video_min_billed_frames: int = Field(default=50)
    # Before a clip goes to Meta, ffmpeg (when installed) resamples it to
    # `frame_sample_fps`, drops audio, and caps the longest edge at
    # `frame_downscale_longest_edge`. SAM bills per frame, so this is the main
    # cost lever. Without ffmpeg the original bytes are sent.
    transcode_timeout_s: float = Field(default=180.0)
    # Uploaded clips are deleted after the run; this expiry is the safety net.
    media_file_ttl_s: int = Field(default=3600)
    # Hard cap on keyframes sampled from any one clip (bounds SAM frame cost and
    # memory for a long video, regardless of fps/duration).
    max_sampled_frames: int = Field(default=120)
    # Longest edge (px) to downscale a frame to before sending to a VLM. Keeps
    # the base64 payload small and the per-call token cost down (LEARNINGS §1).
    frame_downscale_longest_edge: int = Field(default=1024)
    # Zero-credit dev: replay recorded fixtures instead of calling Meta (PLAN §5b).
    mock_ai: bool = Field(default=False, alias="MOCK_AI")
    # Build-time spend cap; reserve the rest for judging (PLAN §5a).
    build_spend_cap_usd: float = Field(default=100.0, alias="BUILD_SPEND_CAP_USD")
    spend_warn_usd: float = Field(default=80.0, alias="SPEND_WARN_USD")

    @property
    def model_api_configured(self) -> bool:
        return bool(self.model_api_key) and self.model_api_key != "TO_BE_UPDATED_LATER"

    @property
    def live_ai_enabled(self) -> bool:
        """True when the pipeline calls Meta (a key is set and MOCK_AI is off)."""
        return self.model_api_configured and not self.mock_ai

    @property
    def is_sqlite(self) -> bool:
        """True when running on the interim SQLite database (not Postgres)."""
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
