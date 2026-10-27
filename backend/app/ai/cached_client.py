"""A durable, content-hash-keyed caching layer over any ``AIClient``.

This is the single mechanism that enforces "run the vision models once per clip,
ever — then serve every later read from the database." It wraps a real client
(mock or live Meta) and, for each vision stage:

  1. looks up a persisted result for this clip's content hash (tenant-scoped);
  2. on a hit, replays the stored output with **no model call** (and no media);
  3. on a miss, calls the wrapped client once and persists the raw output.

Because it conforms to the ``AIClient`` protocol, the pipeline orchestrator does
not change at all — it still calls ``ai.track(h)`` / ``ai.read_placard(h)`` /
``ai.classify_debris(h)``. The difference is those calls are now backed by a
durable store that survives restarts, unlike the process-local result cache.

``narrate_anomaly`` is intentionally **not** cached here: it is keyed by anomaly
facts, not the clip hash, and its output is already persisted on the ``Anomaly``
row. Caching it by content hash would be wrong (the same clip can raise different
flags after a monitor call), so it passes straight through.

The persistence is best-effort on the write path: if a save fails we still return
the fresh result, so a storage hiccup degrades to "recompute next time," never a
pipeline failure.
"""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.ai import serde
from app.ai.base import AIClient, ClassifyResult, OCRResult, TrackResult
from app.log import get_logger

log = get_logger("ai.cache")


class StageResultStore(Protocol):
    """The repository methods ``CachingAIClient`` needs.

    A structural type so we don't import the heavy repository module into the AI
    package (which would create an import cycle). ``SqlTicketRepository``
    satisfies it.
    """

    async def get_ai_stage_result(
        self, tenant_id: UUID, content_hash: str, stage_key: str
    ) -> dict[str, object] | None: ...

    async def save_ai_stage_result(
        self,
        tenant_id: UUID,
        content_hash: str,
        stage_key: str,
        *,
        result_json: dict[str, object],
        model: str = "",
        confidence: float | None = None,
    ) -> None: ...


class CachingAIClient:
    """Wrap an ``AIClient`` with durable, content-hash-keyed result persistence.

    Bound to one tenant and a repository (the request's session). Construct a new
    one per request/pipeline run, exactly like the repository it borrows.
    """

    def __init__(
        self, inner: AIClient, repo: StageResultStore, tenant_id: UUID, model_label: str = ""
    ) -> None:
        self._inner = inner
        self._repo = repo
        self._tenant = tenant_id
        self._model = model_label

    async def track(self, content_hash: str) -> TrackResult:
        cached = await self._repo.get_ai_stage_result(self._tenant, content_hash, serde.STAGE_TRACK)
        if cached is not None:
            return serde.track_from_json(cached)
        result = await self._inner.track(content_hash)
        await self._persist(content_hash, serde.STAGE_TRACK, serde.track_to_json(result))
        return result

    async def read_placard(self, content_hash: str) -> OCRResult:
        cached = await self._repo.get_ai_stage_result(self._tenant, content_hash, serde.STAGE_OCR)
        if cached is not None:
            return serde.ocr_from_json(cached)
        result = await self._inner.read_placard(content_hash)
        await self._persist(content_hash, serde.STAGE_OCR, serde.ocr_to_json(result))
        return result

    async def classify_debris(self, content_hash: str) -> ClassifyResult:
        cached = await self._repo.get_ai_stage_result(
            self._tenant, content_hash, serde.STAGE_CLASSIFY
        )
        if cached is not None:
            return serde.classify_from_json(cached)
        result = await self._inner.classify_debris(content_hash)
        await self._persist(content_hash, serde.STAGE_CLASSIFY, serde.classify_to_json(result))
        return result

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> str:
        # Not clip-keyed — pass through (see module docstring).
        return await self._inner.narrate_anomaly(anomaly_type, facts)

    async def _persist(self, content_hash: str, stage_key: str, payload: dict[str, object]) -> None:
        try:
            await self._repo.save_ai_stage_result(
                self._tenant,
                content_hash,
                stage_key,
                result_json=payload,
                model=self._model,
                confidence=serde.confidence_of(stage_key, payload),
            )
        except Exception:  # noqa: BLE001 — a storage hiccup must not fail the pipeline
            log.warning("ai_stage_persist_failed", stage=stage_key, content_hash=content_hash)
