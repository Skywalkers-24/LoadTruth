"""LiveAIClient — real Meta Model API calls (SAM 3.1 + Muse Spark).

Intentionally a thin stub for now: the method bodies that call Meta land with the
one-time round-trip + fixture recording (PLAN.md §8a day 0), gated on a real
MODEL_API_KEY. Until then, calling a live method raises a clear error rather than
silently returning wrong data, so a misconfigured run fails loudly instead of
spending nothing and producing nonsense.

The class already conforms to the AIClient protocol, so wiring the bodies is the
only remaining step — no caller changes.
"""

from __future__ import annotations

from app.ai.base import ClassifyResult, OCRResult, TrackResult


class LiveAINotWiredError(RuntimeError):
    """Raised when a live AI call is attempted before the HTTP calls are wired."""


_MSG = (
    "LiveAIClient is not wired yet. Set MODEL_API_KEY and record fixtures "
    "(scripts/record-fixtures.sh), or run with MOCK_AI=1 to use fixtures."
)


class LiveAIClient:
    """Real client. Bodies are filled in with the one-time API round-trip."""

    async def track(self, content_hash: str) -> TrackResult:
        raise LiveAINotWiredError(_MSG)

    async def read_placard(self, content_hash: str) -> OCRResult:
        raise LiveAINotWiredError(_MSG)

    async def classify_debris(self, content_hash: str) -> ClassifyResult:
        raise LiveAINotWiredError(_MSG)

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> str:
        raise LiveAINotWiredError(_MSG)
