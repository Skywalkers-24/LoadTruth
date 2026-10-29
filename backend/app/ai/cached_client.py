"""A durable, content-hash-keyed caching layer over any ``AIClient``.

This is the single mechanism that enforces "run the vision models once per clip,
ever — then serve every later read from the database." It wraps a real client
(mock or live Meta) and, for each vision stage:

  1. looks up a persisted result for this clip's content hash (tenant-scoped);
  2. on a hit, replays the stored output with **no model call** (and no media);
  3. on a miss, calls the wrapped client once and persists the raw output.

Because it conforms to the ``AIClient`` protocol, the pipeline orchestrator does
not change: it calls ``ai.track(clip)`` / ``ai.read_placard(clip)`` /
``ai.classify_debris(clip)``, and those calls are backed by a durable store that
survives restarts, unlike the process-local result cache. A replayed result
carries a ``cached=True`` usage at $0 so the cost ledger counts the hit.

``narrate_anomaly`` is intentionally **not** cached here: it is keyed by anomaly
facts, not the clip hash, and its output is already persisted on the ``Anomaly``
row. Caching it by content hash would be wrong (the same clip can raise different
flags after a monitor call), so it passes straight through.

The persistence is best-effort on the write path: if a save fails we still return
the fresh result, so a storage hiccup degrades to "recompute next time," never a
pipeline failure.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace
from typing import Protocol
from uuid import UUID

from app.ai import serde
from app.ai.base import (
    AIClient,
    CallUsage,
    ClassifyResult,
    ClipMedia,
    Narration,
    OCRResult,
    StageExplanations,
    TrackResult,
)
from app.ai.sam_measure import MEASURE_VERSION, RIM_LABEL, SAM_PROMPT_VERSION, remeasure
from app.config import get_settings
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

    def _hit(self) -> CallUsage:
        return CallUsage(model=self._model, requests=0, cached=True)

    async def track(self, clip: ClipMedia) -> TrackResult:
        h = clip.content_hash
        cached = await self._repo.get_ai_stage_result(self._tenant, h, serde.STAGE_TRACK)
        outdated = cached is not None and serde.track_is_outdated(cached, MEASURE_VERSION)
        prompt_outdated = (
            cached is not None
            and get_settings().live_ai_enabled
            and serde.track_prompt_is_outdated(cached, SAM_PROMPT_VERSION)
        )
        if (
            cached is not None
            and serde.track_is_current(cached)
            and not outdated
            and not prompt_outdated
        ):
            return replace(serde.track_from_json(cached), usage=self._hit())
        if (
            cached is not None
            and outdated
            and not prompt_outdated
            and serde.track_can_remeasure(cached, RIM_LABEL)
        ):
            # Older measurement method, and SAM already returned every concept the
            # current one reads (rim + a load mask): re-measure offline, no call.
            stored = await asyncio.to_thread(
                remeasure,
                serde.track_from_json(cached),
                media_kind=clip.media_kind,
                max_frames=get_settings().max_sampled_frames,
            )
            await self._persist(h, serde.STAGE_TRACK, serde.track_to_json(stored))
            log.info("ai_track_remeasured", content_hash=h, version=MEASURE_VERSION)
            return replace(stored, usage=self._hit())
        # Re-run SAM once when: a miss; or an outdated row that can't be replayed
        # offline (missing the tailgate rim, or no load mask so an offline replay
        # would reproduce the same 0% while the current method has new/named load
        # concepts that may find it). The fresh result is persisted, so this
        # costs at most one run per clip per measurement-version bump.
        if cached is not None and outdated and not serde.track_has_load(cached):
            log.info("ai_track_reran_no_stored_load", content_hash=h, version=MEASURE_VERSION)
        if prompt_outdated:
            log.info("ai_track_reran_prompt_version", content_hash=h, version=SAM_PROMPT_VERSION)
        result = await self._inner.track(clip)
        await self._persist(h, serde.STAGE_TRACK, serde.track_to_json(result))
        return result

    async def read_placard(self, clip: ClipMedia) -> OCRResult:
        h = clip.content_hash
        cached = await self._repo.get_ai_stage_result(self._tenant, h, serde.STAGE_OCR)
        if cached is not None:
            return replace(serde.ocr_from_json(cached), usage=self._hit())
        result = await self._inner.read_placard(clip)
        await self._persist(h, serde.STAGE_OCR, serde.ocr_to_json(result))
        return result

    async def classify_debris(self, clip: ClipMedia) -> ClassifyResult:
        h = clip.content_hash
        cached = await self._repo.get_ai_stage_result(self._tenant, h, serde.STAGE_CLASSIFY)
        if cached is not None:
            return replace(serde.classify_from_json(cached), usage=self._hit())
        result = await self._inner.classify_debris(clip)
        await self._persist(h, serde.STAGE_CLASSIFY, serde.classify_to_json(result))
        return result

    async def narrate_anomaly(self, anomaly_type: str, facts: dict[str, str]) -> Narration:
        # Not clip-keyed — pass through (see module docstring).
        return await self._inner.narrate_anomaly(anomaly_type, facts)

    async def explain_pipeline(self, facts: dict[str, object]) -> StageExplanations:
        # Keyed by the run's measured facts (which include monitor-dependent
        # anomalies), not the clip hash alone — pass through. The whole-run
        # result cache already prevents a repeat call on a re-ingest.
        return await self._inner.explain_pipeline(facts)

    async def answer_question(self, prompt: str) -> Narration:
        # Not clip-keyed — pass through.
        return await self._inner.answer_question(prompt)

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
            log.warning(
                "ai_stage_persist_failed",
                stage=stage_key,
                content_hash=content_hash,
                exc_info=True,
            )
