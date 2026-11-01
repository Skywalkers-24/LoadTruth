"""Ingest API — upload evidence, run the pipeline, and save a ticket.

POST /events/{event_id}/ingest accepts a video/image upload, runs the full
pipeline (SAM/Spark via the AI seam — fixtures under MOCK_AI), and persists the
resulting ticket + review flags. Returns the new ticket (or 422 when no truck
is found in the footage).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import asdict, replace
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from redis.asyncio import Redis

from app.ai import clip_session, get_ai_client
from app.ai.cached_client import CachingAIClient
from app.ai.meta_http import (
    ModelAPIAuthError,
    ModelAPIError,
    ModelAPIRequestError,
    ModelAPIUnavailableError,
)
from app.ai.providers import ai_config_fingerprint
from app.api.deps import authorize_fresh_analysis, require
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_ingest
from app.config import get_settings
from app.log import get_logger
from app.pipeline import b2_store, evidence_store
from app.pipeline.anomalies import Anomaly, AnomalyType, Severity
from app.pipeline.cache import InMemoryResultCache, RedisResultCache, ResultCache
from app.pipeline.frames import sample_frames
from app.pipeline.ingest import ingest_upload
from app.pipeline.ledger import BudgetExceededError, CostLedger
from app.pipeline.media import MediaTooLargeError, guess_mime, plan_transport
from app.pipeline.orchestrator import PipelineResult, run_pipeline
from app.pipeline.registry import CertifiedTruck, TruckRegistry
from app.pipeline.trace import StageRecord, get_job_store, get_progress_store
from app.tickets.domain import Ticket
from app.tickets.schemas import DebrisClass, TicketOut, TicketStatus, ticket_to_out

router = APIRouter(tags=["ingest"])
log = get_logger("ingest")

# Use Render Key Value (Redis-compatible) when REDIS_URL is configured. Keep
# the local in-memory cache for development and as a fallback during outages.
_local_pipeline_cache: InMemoryResultCache[PipelineResult] = InMemoryResultCache()
_redis_client: Redis | None = None
_pipeline_cache: ResultCache[PipelineResult] | None = None
_cost_ledger = CostLedger()


def _encode_pipeline_result(value: PipelineResult) -> bytes:
    """Encode the shared cache value as JSON without request-local trace callbacks."""
    result = replace(value, trace=None)

    def encode_scalar(item: object) -> str:
        if isinstance(item, (UUID, Decimal)):
            return str(item)
        if isinstance(item, datetime):
            return item.isoformat()
        raise TypeError(f"Unsupported cache value: {type(item).__name__}")

    return json.dumps(asdict(result), default=encode_scalar, separators=(",", ":")).encode()


def _decode_pipeline_result(payload: bytes) -> PipelineResult:
    """Rebuild pipeline domain records from their shared JSON cache form."""
    data = json.loads(payload)
    ticket_data = data["ticket"]
    for field in ("tenant_id", "event_id", "clip_id", "id"):
        if ticket_data[field] is not None:
            ticket_data[field] = UUID(ticket_data[field])
    for field in (
        "certified_cubic_yards",
        "rate_per_cy",
        "est_fill_pct",
        "est_cubic_yards",
        "est_dollar_value",
        "monitor_call_fill_pct",
        "monitor_cubic_yards",
        "monitor_dollar_value",
        "delta_cubic_yards",
        "delta_dollar_value",
        "confirmed_fill_pct",
    ):
        if ticket_data[field] is not None:
            ticket_data[field] = Decimal(ticket_data[field])
    ticket_data["debris_class"] = DebrisClass(ticket_data["debris_class"])
    ticket_data["status"] = TicketStatus(ticket_data["status"])
    ticket_data["created_at"] = datetime.fromisoformat(ticket_data["created_at"])
    anomalies = [
        Anomaly(
            type=AnomalyType(row["type"]),
            severity=Severity(row["severity"]),
            explanation=row["explanation"],
            evidence_frame=row["evidence_frame"],
        )
        for row in data["anomalies"]
    ]
    return PipelineResult(
        ticket=Ticket(**ticket_data),
        anomalies=anomalies,
        identity_confidence=data["identity_confidence"],
        fill_confidence=data["fill_confidence"],
        no_truck=data["no_truck"],
        segments=data["segments"],
    )


def get_pipeline_cache() -> ResultCache[PipelineResult] | None:
    """Return the shared result cache, using Render Key Value when configured."""
    global _pipeline_cache, _redis_client
    if not get_settings().pipeline_result_cache_enabled:
        return None
    if _pipeline_cache is None:
        settings = get_settings()
        if settings.redis_url != "redis://localhost:6379/0":
            _redis_client = Redis.from_url(
                settings.redis_url,
                socket_connect_timeout=3,
                socket_timeout=3,
                health_check_interval=30,
            )
            _pipeline_cache = RedisResultCache(
                _redis_client,
                fallback=_local_pipeline_cache,
                encode=_encode_pipeline_result,
                decode=_decode_pipeline_result,
            )
        else:
            _pipeline_cache = _local_pipeline_cache
    return _pipeline_cache


async def initialize_pipeline_cache() -> bool:
    """Check the configured shared cache at startup; cache failure is non-fatal."""
    global _pipeline_cache
    get_pipeline_cache()
    if _redis_client is None:
        return False
    try:
        await _redis_client.ping()
        return True
    except Exception:  # noqa: BLE001 — Redis is optional; local fallback remains usable.
        log.warning("redis_cache_unavailable; using process-local fallback", exc_info=True)
        _pipeline_cache = _local_pipeline_cache
        return False


async def get_cache_status() -> dict[str, object]:
    """Report the current pipeline cache status for diagnostics and health checks."""
    settings = get_settings()
    is_configured = settings.redis_url != "redis://localhost:6379/0"
    connected = False
    if is_configured and _redis_client is not None:
        try:
            connected = bool(await _redis_client.ping())
        except Exception:
            connected = False
    return {
        "backend": ("redis" if connected else "memory")
        if settings.pipeline_result_cache_enabled
        else "database-stage-cache",
        "redis_configured": is_configured,
        "redis_connected": connected,
    }


async def close_pipeline_cache() -> None:
    """Close the shared Redis connection pool during application shutdown."""
    if _redis_client is not None:
        await _redis_client.aclose()


def get_cost_ledger() -> CostLedger:
    """The shared cost ledger (read by the future cost dashboard)."""
    return _cost_ledger


@router.post(
    "/events/{event_id}/ingest",
    response_model=TicketOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require(can_ingest, "You do not have permission to upload clips.")),
        Depends(authorize_fresh_analysis),
    ],
)
async def ingest_clip(
    repo: Repository,
    tenant: ActiveTenant,
    event_id: UUID,
    file: UploadFile,
    keep_footage: bool = Query(default=True),
    bypass_cache: bool = Query(  # noqa: B008 — FastAPI dependency default
        default=False,
        description=(
            "Skip every result cache and force a fresh model run. Used by judge "
            "mode's 'bypass cache' toggle to prove the pipeline is live."
        ),
    ),
) -> TicketOut:
    """Ingest one clip/image and return the created ticket.

    ``bypass_cache`` forces a live run: the result cache and the
    durable per-stage cache are both skipped, so the vision models are actually
    called again. It is the proof, for a judge, that a re-run is the real
    pipeline and not a replay.
    """
    with evidence_store.storage_scope(keep_footage):
        event = await repo.get_event(tenant, event_id)
        if event is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
        if "playground" in event.tags:
            raise HTTPException(
                409, "Choose a saved result in the playground. New AI calls are disabled here."
            )
        if "read-only" in event.tags:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This preprocessed showcase event is read-only. Choose a working event "
                "to upload clips.",
            )

        limit = get_settings().analysis_max_bytes
        data = await file.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, "Trim this clip below the configured analysis size limit.")
        filename = file.filename or "upload.mp4"
        settings = get_settings()
        try:
            # Scenario filenames only steer fixture replay during offline testing;
            # live runs are strictly keyed by true content hash with zero mock steering.
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
        # no media sent. The result cache below is an additional shortcut layered
        # over that durable store, shared through Render Key Value when configured.
        model_label = f"{settings.sam_model} · {settings.spark_model}"
        inner = get_ai_client()
        # Judge-mode "bypass cache": call the raw client and skip both caches so the
        # models actually run again; otherwise wrap in the durable per-stage cache.
        ai_namespace = ai_config_fingerprint() if settings.live_ai_enabled else ""
        ai = (
            inner
            if bypass_cache
            else CachingAIClient(
                inner, repo, tenant, model_label=model_label, cache_namespace=ai_namespace
            )
        )
        result_cache = None if bypass_cache else get_pipeline_cache()

        # Live progress: record "started", then each stage as it lands, in a store
        # the UI polls, so the New Ticket / Pipeline pages show the run moving left
        # to right (and still see it after a page refresh) instead of a long wait.
        progress = get_progress_store()
        ch = artifact.content_hash
        await progress.start(event_id, ch)
        _on_stage: Callable[[StageRecord], None] = progress.stage_sink(event_id, ch)

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
                    on_stage=_on_stage,
                )
        except b2_store.StorageUnavailableError as exc:
            await progress.finish(
                event_id, ch, outcome="failed", detail="B2 storage is unavailable."
            )
            raise HTTPException(
                503, "B2 storage is unavailable. The saved input can be retried later."
            ) from exc
        except BudgetExceededError as exc:
            await progress.finish(
                event_id, ch, outcome="failed", detail="AI spending limit reached."
            )
            log.warning("ingest_budget_cap_reached", spent_usd=exc.spent_usd)
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "This workspace has reached its AI spending limit. Raise the limit to analyze "
                "new clips.",
            ) from exc
        except ModelAPIError as exc:
            await progress.finish(event_id, ch, outcome="failed", detail="AI service error")
            raise _model_api_http_error(exc) from exc
        except Exception as exc:  # noqa: BLE001 — surface a clean 500, never a stack trace
            log.error("ingest_pipeline_failed", content_hash=artifact.content_hash, exc_info=True)
            await progress.finish(event_id, ch, outcome="failed", detail="The pipeline failed.")
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "The analysis pipeline failed on that clip. Please try again.",
            ) from exc

        # Record the run in the job store so the Pipeline view and the ticket's AI
        # analysis panel can show exactly how the result was produced.
        if result.no_truck:
            presence_uncertain = (
                result.trace is not None and result.trace.outcome == "segmentation_failed"
            )
            detail = (
                "Truck presence could not be confirmed from the saved evidence; review this clip."
                if presence_uncertain
                else "No truck or load was detected in that footage."
            )
            await progress.finish(
                event_id,
                ch,
                outcome="segmentation_failed" if presence_uncertain else "no_truck",
                detail=detail,
            )
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail + " No ticket was created.",
            )

        try:
            saved = await repo.add_from_pipeline(result.ticket, list(result.anomalies))
            # Persist the AI stage trace so this ticket keeps its analysis permanently.
            if result.trace is not None and result.trace.stages:
                await repo.save_pipeline_stages(tenant, saved.id, list(result.trace.stages))
            # Keep the clip for the Review console. The live client already stored
            # the exact media the models saw; otherwise (fixtures, or a cached
            # replay of an older clip) store the upload itself.
            stored = await evidence_store.load(artifact.content_hash)
            if stored is None:
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
                ai_cache_namespace=ai_namespace,
                media_storage="b2" if keep_footage else "memory",
            )
            from app.api.cache import invalidate_cache_tags

            await invalidate_cache_tags(f"event:{event_id}", f"tenant:{tenant}:billing")
        except Exception as exc:  # noqa: BLE001 — return a clean failure and close progress.
            log.error("ingest_persistence_failed", content_hash=ch, exc_info=True)
            await progress.finish(
                event_id, ch, outcome="failed", detail="The ticket could not be saved."
            )
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "The ticket could not be saved. Please try the upload again.",
            ) from exc

        if result.trace is not None:
            result.trace.ticket_id = str(saved.id)
            await get_job_store().add(event_id, result.trace)
        await progress.finish(
            event_id,
            ch,
            outcome="cached" if result.trace is not None and result.trace.cached else "created",
            ticket_id=str(saved.id),
            truck_id=saved.truck_id,
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
    if exc.status == 404 and exc.code == "model_not_found":
        return HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The AI service could not find the configured model. An administrator should "
            "check the selected model and account access.",
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
