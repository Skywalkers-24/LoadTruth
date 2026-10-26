"""The AI seam: SAM 3.1 + Muse Spark behind one interface (PLAN.md §5, §5b).

Nothing outside this package talks to Meta directly. The pipeline depends on the
`AIClient` protocol; under MOCK_AI it gets `MockAIClient` (replays committed
fixtures, $0, no key), and in production it gets the real HTTP-backed client.
Switching modes needs no change to any caller — fixtures are byte-compatible
with live responses by design.
"""

from app.ai.base import (
    AIClient,
    ClassifyResult,
    OCRResult,
    TrackedObject,
    TrackResult,
)
from app.ai.factory import get_ai_client
from app.ai.mock import MockAIClient

__all__ = [
    "AIClient",
    "ClassifyResult",
    "MockAIClient",
    "OCRResult",
    "TrackResult",
    "TrackedObject",
    "get_ai_client",
]
