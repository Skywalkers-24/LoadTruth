"""Select the AI client implementation from configuration.

MOCK_AI (or no configured inference route) -> MockAIClient (fixtures, $0).
Otherwise -> LiveAIClient (Meta SAM plus the configured chat/vision providers).
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
    """Return the process-wide AI client (mock under MOCK_AI or no key)."""
    if get_settings().live_ai_enabled:
        return LiveAIClient()
    return MockAIClient()


def clip_session(client: AIClient, content_hash: str) -> AbstractAsyncContextManager[None]:
    """Scope one pipeline run so the live client can clean up the clip's upload.

    A no-op for the mock (and any client without media to release).
    """
    if isinstance(client, LiveAIClient):
        return client.clip_session(content_hash)
    return nullcontext()
