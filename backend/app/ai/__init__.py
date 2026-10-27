"""The AI seam: SAM 3.1 + Muse Spark behind one interface (PLAN.md §5, §5b).

Nothing outside this package talks to Meta directly. The pipeline depends on the
`AIClient` protocol; under MOCK_AI (or with no key) it gets `MockAIClient`
(replays committed fixtures, $0), and with a `MODEL_API_KEY` it gets
`LiveAIClient` (app/ai/live.py). Switching modes needs no change to any caller.
"""

from app.ai.base import (
    AIClient,
    CallUsage,
    ClassifyResult,
    ClipMedia,
    Narration,
    OCRResult,
    TrackedObject,
    TrackResult,
)
from app.ai.factory import clip_session, get_ai_client
from app.ai.mock import MockAIClient

__all__ = [
    "AIClient",
    "CallUsage",
    "ClassifyResult",
    "ClipMedia",
    "MockAIClient",
    "Narration",
    "OCRResult",
    "TrackResult",
    "TrackedObject",
    "clip_session",
    "get_ai_client",
]
