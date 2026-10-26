"""Select the AI client implementation from configuration.

MOCK_AI (or an unconfigured key) -> MockAIClient (fixtures, $0).
Otherwise -> LiveAIClient (real Meta Model API).
"""

from __future__ import annotations

from functools import lru_cache

from app.ai.base import AIClient
from app.ai.live import LiveAIClient
from app.ai.mock import MockAIClient
from app.config import get_settings


@lru_cache
def get_ai_client() -> AIClient:
    """Return the process-wide AI client (mock under MOCK_AI or no key)."""
    settings = get_settings()
    if settings.mock_ai or not settings.model_api_configured:
        return MockAIClient()
    return LiveAIClient()
