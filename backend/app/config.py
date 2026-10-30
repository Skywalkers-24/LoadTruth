"""Application configuration, validated on boot from the environment.

Secrets come from the repo-root `.env` (gitignored). The service-role key is
server-side only and must never be exposed to the frontend bundle.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
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
    model_api_key: str = Field(default="TO_BE_UPDATED_LATER", alias="MODEL_API_KEY", repr=False)
    model_api_base_url: str = Field(default="https://api.meta.ai/v1")
    sam_model: str = Field(default="sam-3.1")
    spark_model: str = Field(default="muse-spark-1.3")

    # Partner inference routes. Meta remains the default and owns SAM segmentation.
    spark_provider: Literal["meta", "baseten", "modal", "fireworks"] = "meta"
    spark_fallback_providers: str = ""
    baseten_api_key: str = Field(default="", alias="BASETEN_API_KEY", repr=False)
    baseten_base_url: str = "https://inference.baseten.co/v1"
    baseten_model: str = "meta-models/muse-spark-open-1026"
    modal_proxy_token_id: str = Field(
        default="", validation_alias=AliasChoices("MODAL_PROXY_TOKEN_ID", "ModalKey"), repr=False
    )
    modal_proxy_token_secret: str = Field(
        default="",
        validation_alias=AliasChoices("MODAL_PROXY_TOKEN_SECRET", "Modal-Secret"),
        repr=False,
    )
    modal_base_url: str = ""
    modal_model: str = "meta-models/Muse-Spark-Open-816B-A42B"
    modal_routing_affinity_key: str = ""
    fireworks_api_key: str = Field(default="", alias="FIREWORKS_API_KEY", repr=False)
    fireworks_base_url: str = "https://api.fireworks.ai/inference/v1"
    # No guessed Fireworks model/deployment: supplied by the operator.
    fireworks_model: str = ""
    fireworks_supports_vision: bool = False
    # Prices per million tokens; zero means not configured, not a free provider.
    baseten_input_price: float = 1.25
    baseten_cached_input_price: float = 0.15
    baseten_output_price: float = 4.25
    modal_input_price: float = 1.25
    modal_cached_input_price: float = 0.15
    modal_output_price: float = 4.25
    fireworks_input_price: float = 0.0
    fireworks_cached_input_price: float = 0.0
    fireworks_output_price: float = 0.0

    @field_validator("spark_fallback_providers")
    @classmethod
    def validate_fallbacks(cls, value: str) -> str:
        providers = [item.strip() for item in value.split(",") if item.strip()]
        if any(item not in ("meta", "baseten", "modal", "fireworks") for item in providers):
            raise ValueError("Fallback providers must be meta, baseten, modal, or fireworks.")
        return ",".join(dict.fromkeys(providers))

    # Private Backblaze evidence storage with a local working copy/fallback.
    b2_key_id: str = Field(default="", alias="B2_KEY_ID", repr=False)
    b2_application_key: str = Field(default="", alias="B2_APPLICATION_KEY", repr=False)
    b2_bucket_name: str = Field(default="", alias="B2_BUCKET_NAME")
    b2_s3_endpoint: str = Field(default="", alias="B2_S3_ENDPOINT")
    b2_region: str = Field(default="", alias="B2_REGION")
    b2_key_prefix: str = "loadtruth/evidence"
    demo_upload_max_bytes: int = 100 * 1024 * 1024
    analysis_max_bytes: int = 20 * 1024 * 1024
    b2_signed_url_ttl_s: int = 900

    @property
    def b2_configured(self) -> bool:
        return all(
            (
                self.b2_key_id,
                self.b2_application_key,
                self.b2_bucket_name,
                self.b2_s3_endpoint,
                self.b2_region,
            )
        )

    # Database. Defaults to a local SQLite file (async aiosqlite) until Supabase
    # Postgres is wired; then set DATABASE_URL to the postgresql+asyncpg URL.
    database_url: str = Field(
        default="sqlite+aiosqlite:///./loadtruth.db", alias="DATABASE_URL", repr=False
    )
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_anon_key: str = Field(default="", alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    # Supabase JWT signing secret (HS256) — verifies access tokens on the API.
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")

    # SuperAdmin / Developer credentials (stored hashed in .env)
    superadmin_username_hash: str = Field(
        default="",
        alias="SUPERADMIN_USERNAME_HASH",
    )
    superadmin_password_hash: str = Field(
        default="",
        alias="SUPERADMIN_PASSWORD_HASH",
        repr=False,
    )
    superadmin_username: str = Field(default="", alias="SUPERADMIN_USERNAME")
    superadmin_password: str = Field(default="", alias="SUPERADMIN_PASSWORD", repr=False)

    # Redis / background worker
    pipeline_result_cache_enabled: bool = Field(default=True, alias="PIPELINE_RESULT_CACHE_ENABLED")
    api_cache_enabled: bool = Field(default=True, alias="API_CACHE_ENABLED")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Runtime
    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    cors_origins: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")

    @property
    def allowed_origins(self) -> list[str]:
        """Configured browser origins, comma-separated for Render environment variables."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

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
    spark_narrate_max_output_tokens: int = Field(default=4000)  # includes reasoning tokens
    analyst_max_output_tokens: int = Field(default=4000)  # grounded analyst answer
    spark_explain_max_output_tokens: int = Field(default=8000)  # reasoning + stage analysis

    # ── Live Meta client (app/ai/live.py) ──
    model_api_timeout_s: float = Field(default=300.0)
    # Retries for 429 / 5xx / network errors (a 400 is permanent, never retried).
    model_api_max_retries: int = Field(default=2)
    # SAM takes one short noun phrase per request (dev.meta.ai/docs/sam/segmenting),
    # so the clip is segmented once per concept. Tune these on real footage.
    # Every phrase below is one SAM request, all sent in parallel per clip (one
    # SAM video request has a 50-frame minimum, about $0.01). Tuned on gate
    # footage on 2026-10-29 (see LESSONS.md):
    #   bed: "truck bed" defines the cargo region; "dump truck bed" is an
    #        independently requested fallback only when the primary misses.
    #   body: "truck" is a visual outline, never a fallback bed region.
    #   rim:  "tailgate"; its top edge bounds the bed opening.
    sam_bed_concepts: list[str] = Field(default_factory=lambda: ["truck bed", "truck"])
    # Only used when the primary bed phrase produced no detections. The exterior
    # outline above is evidence, never a substitute for the cargo opening.
    sam_bed_fallback_concept: str = "dump truck bed"
    sam_rim_concept: str = Field(default="tailgate")
    #   load: Muse Spark names visible objects by class per clip. The legacy
    #         setting below remains accepted for env compatibility; runtime
    #         fallbacks are class-specific. `sam_load_max_concepts` caps the
    #         load requests (each is one SAM request).
    sam_load_concepts: list[str] = Field(
        default_factory=lambda: ["debris pile", "pile", "barrels and containers"]
    )
    sam_load_max_concepts: int = Field(default=3, ge=1, le=6)
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
    # Every Meta API exchange is appended here as one JSON line (app/ai/api_log.py).
    # Empty disables recording. Media bytes and the key are never written.
    model_api_log_path: str = Field(
        default=str(_REPO_ROOT / "logs" / "meta_api.jsonl"), alias="MODEL_API_LOG_PATH"
    )
    model_api_log_max_chars: int = Field(default=200_000)
    # Processed evidence media (the exact clip the models saw), by content hash.
    # Target number of frames sampled from any clip, whatever its length. The
    # transcode step picks the fps per clip (target / duration) so a 10s clip and
    # a 40s clip both yield ~60 evenly spaced frames. `max_sampled_frames` is the
    # hard ceiling SAM's output is downsampled to; kept equal to the target so the
    # Review overlay always steps through the same count and scrubs smoothly.
    target_sampled_frames: int = Field(default=60)
    max_sampled_frames: int = Field(default=60)
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
        """True when a live route is configured and MOCK_AI is off.

        Partner-only text tasks can run without a Meta key; SAM still requires it.
        """
        partners_ready = (
            self.spark_provider == "baseten"
            and bool(self.baseten_api_key)
            or self.spark_provider == "modal"
            and bool(
                self.modal_base_url and self.modal_proxy_token_id and self.modal_proxy_token_secret
            )
            or self.spark_provider == "fireworks"
            and bool(self.fireworks_model and self.fireworks_api_key)
        )
        return not self.mock_ai and (self.model_api_configured or partners_ready)

    @property
    def is_sqlite(self) -> bool:
        """True when running on the interim SQLite database (not Postgres)."""
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
