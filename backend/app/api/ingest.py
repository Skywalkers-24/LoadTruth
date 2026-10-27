"""Ingest API — upload evidence, run the pipeline, persist a draft ticket.

POST /events/{event_id}/ingest accepts a video/image upload, runs the full
pipeline (SAM/Spark via the AI seam — fixtures under MOCK_AI), and persists the
resulting draft ticket + anomalies. Returns the new ticket (or 422 when no truck
is found in the footage).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.ai import get_ai_client
from app.api.deps import require
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_ingest
from app.pipeline.cache import InMemoryResultCache
from app.pipeline.frames import sample_frames
from app.pipeline.ingest import ingest_upload
from app.pipeline.ledger import CostLedger
from app.pipeline.orchestrator import PipelineResult, run_pipeline
from app.pipeline.registry import CertifiedTruck, TruckRegistry
from app.pipeline.trace import get_job_store
from app.tickets.schemas import TicketOut, ticket_to_out

router = APIRouter(tags=["ingest"])

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
    repo: Repository, tenant: ActiveTenant, event_id: UUID, file: UploadFile
) -> TicketOut:
    """Ingest one clip/image and return the drafted ticket."""
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")

    data = await file.read()
    filename = file.filename or "upload.mp4"
    try:
        artifact = ingest_upload(filename, data)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty or invalid upload") from exc

    # Stage 1 — sample keyframes at the cost-safe fps (degrades if PyAV is absent).
    sample_frames(data, filename=filename, media_kind=artifact.media_kind)

    registry = TruckRegistry(
        [
            CertifiedTruck(truck_number=n, certified_cubic_yards=cap, body_type=bt or "")
            for n, bt, cap in await repo.get_registry(tenant)
        ]
    )

    result = await run_pipeline(
        artifact=artifact,
        tenant_id=tenant,
        event_id=event_id,
        registry=registry,
        rate_table=event.rate_table,
        ai=get_ai_client(),
        cache=get_pipeline_cache(),
        ledger=get_cost_ledger(),
    )
    # Record the run in the job store so the Pipeline view and the ticket's AI
    # analysis panel can show exactly how the result was produced.
    if result.trace is not None:
        await get_job_store().add(event_id, result.trace)

    if result.no_truck:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "no truck detected in the footage; no ticket drafted",
        )

    saved = await repo.add_from_pipeline(result.ticket, list(result.anomalies))
    return ticket_to_out(saved)
