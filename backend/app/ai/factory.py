"""Select the AI client implementation from configuration.

LiveAIClient (Meta SAM 3.1 plus Muse Spark) is strictly enforced when live routes are enabled.
Silent mock fallback is eliminated to ensure genuine model inference.
"""

from __future__ import annotations

from contextlib import AbstractAsyncContextManager, nullcontext
from functools import lru_cache

from app.ai.base import AIClient
from app.ai.live import LiveAIClient
from app.ai.mock import MockAIClient
from app.config import get_settings


@lru_cache
def get_ai_client() -> AIClient:
    """Return the process-wide AI client.

    Defaults strictly to LiveAIClient. Silent mock fallback is disabled.
    MockAIClient is only returned if MOCK_AI=true is explicitly configured.
    """
    settings = get_settings()
    if settings.mock_ai:
        return MockAIClient()
    if settings.live_ai_enabled:
        return LiveAIClient()
    raise RuntimeError(
        "Live AI client is required but no live route is configured. "
        "Set MODEL_API_KEY in .env for Meta Model API (https://api.meta.ai/v1). "
        "Silent mock fallback is disabled."
    )


def clip_session(client: AIClient, content_hash: str) -> AbstractAsyncContextManager[None]:
    """Scope one pipeline run so the live client can clean up the clip's upload.

    A no-op for any client without media to release.
    """
    if isinstance(client, LiveAIClient):
        return client.clip_session(content_hash)
    return nullcontext()
