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

    # Supabase / Postgres
    database_url: str = Field(default="", alias="DATABASE_URL")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_anon_key: str = Field(default="", alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")

    # Redis / background worker
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Runtime
    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Pipeline cost controls (see PLAN.md §5, LESSONS.md)
    frame_sample_fps: float = Field(default=3.0)
    spark_max_output_tokens: int = Field(default=4000)

    @property
    def model_api_configured(self) -> bool:
        return bool(self.model_api_key) and self.model_api_key != "TO_BE_UPDATED_LATER"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
