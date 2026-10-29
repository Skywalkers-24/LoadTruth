"""Browser-independent ingestion jobs for the single-process deployment.

A 202 acknowledges that all media bytes are owned by the server. Analysis uses
its own DB session and is not cancelled when a browser disconnects. The latest
job can be rediscovered by event after a refresh. This is not a durable queue:
server restarts and multiple replicas require a shared worker/job store.
"""

from __future__ import annotations

import asyncio
import time
from io import BytesIO
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel

from app.api.deps import CurrentMember, require
from app.api.ingest import ingest_clip
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_ingest
from app.config import get_settings
from app.db.engine import get_sessionmaker
from app.log import get_logger
from app.pipeline.ingest import ingest_upload
from app.pipeline.trace import get_progress_store
from app.tickets.repository import SqlTicketRepository
from app.tickets.schemas import TicketOut

router = APIRouter(tags=["ingest"])
log = get_logger("ingest.jobs")


class IngestJobOut(BaseModel):
    id: str
    event_id: str
    filename: str
    content_hash: str
    status: Literal["accepted", "running", "completed", "failed"] = "accepted"
    started_at: float
    detail: str | None = None
    ticket: TicketOut | None = None


# One latest attempt per tenant/event, matching the live progress store's scope.
_jobs: dict[tuple[UUID, UUID], IngestJobOut] = {}
_tasks: set[asyncio.Task[None]] = set()
_lock = asyncio.Lock()


async def _process(job: IngestJobOut, tenant: UUID, event_id: UUID, data: bytes) -> None:
    job.status = "running"
    upload = UploadFile(filename=job.filename, file=BytesIO(data))
    try:
        # Never retain the request's session or UploadFile after its response.
        async with get_sessionmaker()() as session:
            try:
                ticket = await ingest_clip(
                    repo=SqlTicketRepository(session),
                    tenant=tenant,
                    event_id=event_id,
                    file=upload,
                    bypass_cache=False,
                )
                await session.commit()
            except BaseException:
                await session.rollback()
                raise
        job.ticket = ticket
        job.status = "completed"
    except HTTPException as exc:
        job.status = "failed"
        job.detail = str(exc.detail)
    except asyncio.CancelledError:
        job.status = "failed"
        job.detail = "Processing was interrupted by a server shutdown. Upload the clip again."
        raise
    except Exception:  # noqa: BLE001 — worker failures must remain observable to the browser
        log.exception("ingest_job_failed", job_id=job.id)
        job.status = "failed"
        job.detail = "Analysis could not finish. Upload the clip again to retry."
    finally:
        if job.status == "failed":
            progress = get_progress_store()
            snapshot = await progress.latest(event_id)
            if snapshot is not None and snapshot.status != "done":
                await progress.finish(
                    event_id, job.content_hash, outcome="failed", detail=job.detail
                )
        await upload.close()


@router.post(
    "/events/{event_id}/ingest-jobs",
    response_model=IngestJobOut,
    status_code=202,
    dependencies=[Depends(require(can_ingest, "You do not have permission to upload clips."))],
)
async def submit_ingest_job(
    repo: Repository, tenant: ActiveTenant, event_id: UUID, file: UploadFile
) -> IngestJobOut:
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(404, "event not found")
    if "read-only" in event.tags:
        raise HTTPException(409, "Choose a working event to upload clips.")
    data = await file.read(1024**3 + 1)
    if not data:
        raise HTTPException(400, "The upload was empty. Choose a file.")
    if len(data) > 1024**3:
        raise HTTPException(413, "That clip exceeds 1 GiB. Upload a shorter clip.")
    key = (tenant, event_id)
    async with _lock:
        previous = _jobs.get(key)
        if previous is not None and previous.status in ("accepted", "running"):
            raise HTTPException(
                409, "This event already has a clip processing. Follow its updates."
            )
        artifact = ingest_upload(
            file.filename or "upload.mp4",
            data,
            allow_scenario_override=not get_settings().live_ai_enabled,
        )
        job = IngestJobOut(
            id=str(uuid4()),
            content_hash=artifact.content_hash,
            event_id=str(event_id),
            filename=file.filename or "upload.mp4",
            started_at=time.time(),
        )
        _jobs[key] = job
        # Publish a processing slot immediately, including preparation before
        # the original ingestion pipeline starts emitting its stage records.
        await get_progress_store().start(event_id, artifact.content_hash)
        task = asyncio.create_task(_process(job, tenant, event_id, data))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    return job


@router.get("/events/{event_id}/ingest-jobs", response_model=IngestJobOut | None)
async def latest_ingest_job(
    _: CurrentMember, repo: Repository, tenant: ActiveTenant, event_id: UUID
) -> IngestJobOut | None:
    if await repo.get_event(tenant, event_id) is None:
        raise HTTPException(404, "event not found")
    return _jobs.get((tenant, event_id))


async def stop_ingest_jobs() -> None:
    """Release sessions before application shutdown closes shared resources."""
    pending = list(_tasks)
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
