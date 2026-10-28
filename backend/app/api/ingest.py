"""Ingest API — upload evidence, run the pipeline, persist a draft ticket.

POST /events/{event_id}/ingest accepts a video/image upload, runs the full
pipeline (SAM/Spark via the AI seam — fixtures under MOCK_AI), and persists the
resulting draft ticket + anomalies. Returns the new ticket (or 422 when no truck
is found in the footage).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status

from app.ai import clip_session, get_ai_client
from app.ai.cached_client import CachingAIClient
from app.ai.meta_http import (
    ModelAPIAuthError,
    ModelAPIError,
    ModelAPIRequestError,
    ModelAPIUnavailableError,
)
from app.api.deps import require
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_ingest
from app.config import get_settings
from app.log import get_logger
from app.pipeline import evidence_store
from app.pipeline.cache import InMemoryResultCache
from app.pipeline.frames import sample_frames
from app.pipeline.ingest import ingest_upload
from app.pipeline.ledger import BudgetExceededError, CostLedger
from app.pipeline.media import MediaTooLargeError, guess_mime, plan_transport
from app.pipeline.orchestrator import PipelineResult, run_pipeline
from app.pipeline.registry import CertifiedTruck, TruckRegistry
from app.pipeline.trace import get_job_store
from app.tickets.schemas import TicketOut, ticket_to_out

router = APIRouter(tags=["ingest"])
log = get_logger("ingest")

# Process-local pipeline cache + cost ledger. In-memory now (per the cache's
# ResultCache protocol, swap for Redis later); the ledger backs the future cost
# dashboard. Shared across requests so a re-run of the same clip is free.
_pipeline_cache: InMemoryResultCache[PipelineResult] = InMemoryResultCache()
_cost_ledger = CostLedger()


def get_pipeline_cache() -> InMemoryResultCache[PipelineResult]:
    """The shared pipeline result cache (content-hash keyed)."""
    return _pipeline_cache


def get_cost_ledger() -> CostLedger:
    """The shared cost ledger (read by the future cost dashboard)."""
    return _cost_ledger


@router.post(
    "/events/{event_id}/ingest",
    response_model=TicketOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require(can_ingest, "You do not have permission to upload clips."))],
)
async def ingest_clip(
    repo: Repository,
    tenant: ActiveTenant,
    event_id: UUID,
    file: UploadFile,
    bypass_cache: bool = Query(  # noqa: B008 — FastAPI dependency default
        default=False,
        description=(
            "Skip every result cache and force a fresh model run. Used by judge "
            "mode's 'bypass cache' toggle to prove the pipeline is live."
        ),
    ),
) -> TicketOut:
    """Ingest one clip/image and return the drafted ticket.

    ``bypass_cache`` forces a live run: the process-local result cache and the
    durable per-stage cache are both skipped, so the vision models are actually
    called again. It is the proof, for a judge, that a re-run is the real
    pipeline and not a replay.
    """
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")

    data = await file.read()
    filename = file.filename or "upload.mp4"
    settings = get_settings()
    try:
        # Scenario filenames only steer the fixture replay; live results are
        # always keyed by the true content hash.
        artifact = ingest_upload(
            filename, data, allow_scenario_override=not settings.live_ai_enabled
        )
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "The upload was empty. Choose a file."
        ) from exc

    # Decide how the clip's bytes reach the models (inline vs upload-once-and-
    # reuse-file_id). Oversized clips (> 1 GiB) are rejected here, not at the
    # model. See pipeline/media.py for the Meta-doc-grounded rules.
    try:
        plan = plan_transport(len(data))
    except MediaTooLargeError as exc:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "That clip is too large (over 1 GB). Upload a shorter or lower-resolution clip.",
        ) from exc
    log.info(
        "ingest_media_plan",
        filename=filename,
        size_bytes=plan.size_bytes,
        send_method=plan.send_method.value,
        reuse_across_calls=plan.reuse_across_calls,
    )

    # Stage 1 — sample keyframes at the cost-safe fps (capped by media.py). A
    # corrupt/non-video file makes the decoder throw; treat that as a bad
    # upload (400), never a 500.
    try:
        sample_frames(data, filename=filename, media_kind=artifact.media_kind)
    except Exception as exc:  # noqa: BLE001 — any decode failure is a bad upload
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That file could not be read as a video or image. Try a different clip.",
        ) from exc

    registry = TruckRegistry(
        [
            CertifiedTruck(truck_number=n, certified_cubic_yards=cap, body_type=bt or "")
            for n, bt, cap in await repo.get_registry(tenant)
        ]
    )

    # Wrap the model client in the durable, content-hash-keyed cache so each
    # vision stage runs at most once per clip, ever. On a re-ingest (or after a
    # restart) the raw outputs are replayed from the DB with no model call and
    # no media sent. The process-local result cache below is now just a fast
    # same-process shortcut layered on top of that durable store.
    model_label = f"{settings.sam_model} · {settings.spark_model}"
    inner = get_ai_client()
    # Judge-mode "bypass cache": call the raw client and skip both caches so the
    # models actually run again; otherwise wrap in the durable per-stage cache.
    ai = inner if bypass_cache else CachingAIClient(inner, repo, tenant, model_label=model_label)
    result_cache = None if bypass_cache else get_pipeline_cache()

    try:
        async with clip_session(inner, artifact.content_hash):
            result = await run_pipeline(
                artifact=artifact,
                tenant_id=tenant,
                event_id=event_id,
                registry=registry,
                rate_table=event.rate_table,
                ai=ai,
                cache=result_cache,
                ledger=get_cost_ledger(),
                data=data,
            )
    except BudgetExceededError as exc:
        log.warning("ingest_budget_cap_reached", spent_usd=exc.spent_usd)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "This workspace has reached its AI spending limit. Raise the limit to analyze "
            "new clips.",
        ) from exc
    except ModelAPIError as exc:
        raise _model_api_http_error(exc) from exc
    except Exception as exc:  # noqa: BLE001 — surface a clean 500, never a stack trace
        log.error("ingest_pipeline_failed", content_hash=artifact.content_hash, exc_info=True)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "The analysis pipeline failed on that clip. Please try again.",
        ) from exc

    # Record the run in the job store so the Pipeline view and the ticket's AI
    # analysis panel can show exactly how the result was produced.
    if result.trace is not None:
        await get_job_store().add(event_id, result.trace)

    if result.no_truck:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No truck or load was detected in that footage, so no ticket was drafted.",
        )

    saved = await repo.add_from_pipeline(result.ticket, list(result.anomalies))
    # Persist the AI stage trace so this ticket keeps its analysis permanently.
    if result.trace is not None and result.trace.stages:
        await repo.save_pipeline_stages(tenant, saved.id, list(result.trace.stages))
    # Keep the clip for the Review console. The live client already stored the
    # exact media the models saw; otherwise (fixtures, or a cached replay of an
    # older clip) store the upload itself, which plays without an overlay.
    await evidence_store.save(
        artifact.content_hash, data, mime=guess_mime(filename, artifact.media_kind)
    )
    stored = await evidence_store.load(artifact.content_hash)
    await repo.save_ticket_evidence(
        tenant,
        saved.id,
        content_hash=artifact.content_hash,
        media_kind=artifact.media_kind,
        mime=stored.mime if stored else guess_mime(filename, artifact.media_kind),
        fps=stored.fps if stored else None,
        segments=result.segments,
    )
    return ticket_to_out(saved)


def _model_api_http_error(exc: ModelAPIError) -> HTTPException:
    """Map a Meta Model API failure to a clear status and message.

    The upstream message is logged (it can name the problem precisely) but not
    returned, so no provider internals reach the browser.
    """
    log.error(
        "ingest_model_api_failed",
        error=type(exc).__name__,
        status=exc.status,
        code=exc.code,
        detail=str(exc)[:300],
    )
    if isinstance(exc, ModelAPIAuthError):
        return HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The AI service did not accept this server's credentials. An administrator "
            "should check the Model API key.",
        )
    if isinstance(exc, ModelAPIUnavailableError):
        return HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The AI service is busy right now. Try the upload again in a minute.",
        )
    if isinstance(exc, ModelAPIRequestError):
        return HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "The AI service could not read that file. Upload an MP4 or MOV video, or a "
            "JPEG or PNG photo.",
        )
    return HTTPException(
        status.HTTP_502_BAD_GATEWAY,
        "The AI service could not finish analyzing that clip. Try again or use a different clip.",
    )
