"""Durable, serial analysis of B2 library clips on a small Render instance."""

from __future__ import annotations

import asyncio
import tempfile
from datetime import UTC
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, update

from app.api.demo_videos import owned_video
from app.api.deps import CurrentMember, require
from app.api.ingest import ingest_clip
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_ingest
from app.config import get_settings
from app.db.engine import get_sessionmaker as get_sessionmaker
from app.db.models import AnalysisJob, DemoVideo
from app.log import get_logger
from app.pipeline import b2_store
from app.pipeline.trace import get_progress_store
from app.tickets.repository import SqlTicketRepository
from app.tickets.schemas import TicketOut, ticket_to_out

router = APIRouter(tags=["ingest"])
log = get_logger("ingest.jobs")
_worker: asyncio.Task[None] | None = None


class IngestJobOut(BaseModel):
    id: str
    event_id: str
    filename: str
    content_hash: str
    status: Literal["accepted", "running", "completed", "failed"]
    started_at: float
    detail: str | None = None
    ticket: TicketOut | None = None


async def job_out(repo: SqlTicketRepository, row: AnalysisJob) -> IngestJobOut:
    video = await repo.session.get(DemoVideo, row.video_id)
    ticket = (
        ticket_to_out(await repo.get_ticket(row.tenant_id, row.ticket_id))
        if row.ticket_id
        else None
    )
    return IngestJobOut(
        id=str(row.id),
        event_id=str(row.event_id),
        filename=video.filename if video else "Unavailable clip",
        content_hash=row.content_hash or row.video_id.hex,
        status="accepted" if row.status == "queued" else row.status,
        started_at=(
            row.created_at.replace(tzinfo=UTC) if row.created_at.tzinfo is None else row.created_at
        ).timestamp(),
        detail=row.detail,
        ticket=ticket,
    )


async def _run(job_id: UUID) -> None:
    async with get_sessionmaker()() as session:
        row = await session.get(AnalysisJob, job_id)
        if row is None:
            return
        tenant, event_id = row.tenant_id, row.event_id
        video = await session.get(DemoVideo, row.video_id)
        if video is None or video.tenant_id != tenant or video.status != "ready":
            row.status, row.detail = "failed", "The stored video is unavailable."
            await session.commit()
            return
        video_id = video.id
        await get_progress_store().start(event_id, video_id.hex)
        try:
            # Disk is transient processing workspace, never fallback storage.
            # No media bytes live in the queue, and only one clip is decoded at a time.
            with tempfile.TemporaryFile() as handle:
                content_hash = await asyncio.to_thread(
                    b2_store.download_to,
                    video.object_key,
                    handle,
                    get_settings().analysis_max_bytes,
                    video.object_version,
                )
                row.content_hash = content_hash
                upload = UploadFile(filename=video.filename, file=handle)
                ticket = await ingest_clip(
                    repo=SqlTicketRepository(session),
                    tenant=tenant,
                    event_id=event_id,
                    file=upload,
                    bypass_cache=False,
                )
                row.ticket_id = UUID(ticket.id) if isinstance(ticket.id, str) else ticket.id
                row.status, row.detail = "completed", None
                # The ticket and completion marker commit in the same transaction.
                await session.commit()
        except asyncio.CancelledError:
            await session.rollback()
            raise
        except Exception as exc:
            await session.rollback()
            row = await session.get(AnalysisJob, job_id)
            if row:
                row.status = "failed"
                row.detail = (
                    str(exc.detail)[:500]
                    if isinstance(exc, HTTPException)
                    else "Analysis failed. Retry the saved clip; no re-upload is needed."
                )
                await session.commit()
            await get_progress_store().finish(
                event_id,
                video_id.hex,
                outcome="failed",
                detail="Analysis failed. The B2 clip is preserved.",
            )
            log.warning("analysis_job_failed", job_id=str(job_id), error_type=type(exc).__name__)


async def _drain() -> None:
    while True:
        async with get_sessionmaker()() as session:
            row = (
                await session.execute(
                    select(AnalysisJob)
                    .where(AnalysisJob.status == "queued")
                    .order_by(AnalysisJob.created_at)
                    .limit(1)
                    .with_for_update(skip_locked=True)
                )
            ).scalar_one_or_none()
            if row is None:
                return
            job_id = row.id
            row.status = "running"
            await session.commit()
        await _run(job_id)


def ensure_worker() -> None:
    global _worker
    if _worker is None or _worker.done():
        _worker = asyncio.create_task(_drain())


async def recover_ingest_jobs() -> None:
    # Single-process Render deployment: a previous running job was interrupted.
    async with get_sessionmaker()() as session:
        await session.execute(
            update(AnalysisJob)
            .where(AnalysisJob.status == "running")
            .values(status="queued", detail="Resuming after backend restart.")
        )
        await session.commit()
    ensure_worker()


@router.post(
    "/events/{event_id}/demo-videos/{video_id}/analyze",
    response_model=IngestJobOut,
    status_code=202,
    dependencies=[Depends(require(can_ingest, "You do not have permission to analyze clips."))],
)
async def analyze_video(
    repo: Repository, tenant: ActiveTenant, event_id: UUID, video_id: UUID
) -> IngestJobOut:
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(404, "event not found")
    if "read-only" in event.tags:
        raise HTTPException(409, "Choose a working event to analyze clips.")
    video = await owned_video(repo, tenant, video_id)
    if video.status != "ready":
        raise HTTPException(409, "The clip must be verified in B2 before analysis.")
    if video.size_bytes > get_settings().analysis_max_bytes:
        raise HTTPException(
            413, "This clip is stored safely, but must be trimmed below the analysis limit."
        )
    # Lock the event row on Postgres to serialize simultaneous submissions.
    from app.db.models import Event

    await repo.session.execute(
        select(Event).where(Event.id == event_id, Event.tenant_id == tenant).with_for_update()
    )
    active = (
        await repo.session.execute(
            select(AnalysisJob.id)
            .where(
                AnalysisJob.tenant_id == tenant,
                AnalysisJob.event_id == event_id,
                AnalysisJob.status.in_(["queued", "running"]),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if active:
        raise HTTPException(409, "This event already has a queued or running clip.")
    row = AnalysisJob(tenant_id=tenant, event_id=event_id, video_id=video_id, status="queued")
    repo.session.add(row)
    await repo.session.flush()
    result = await job_out(repo, row)
    await repo.session.commit()
    ensure_worker()
    return result


@router.get("/events/{event_id}/ingest-jobs", response_model=IngestJobOut | None)
async def latest_ingest_job(
    _: CurrentMember, repo: Repository, tenant: ActiveTenant, event_id: UUID
) -> IngestJobOut | None:
    if await repo.get_event(tenant, event_id) is None:
        raise HTTPException(404, "event not found")
    row = (
        await repo.session.execute(
            select(AnalysisJob)
            .where(AnalysisJob.tenant_id == tenant, AnalysisJob.event_id == event_id)
            .order_by(AnalysisJob.created_at.desc(), AnalysisJob.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    result = await job_out(repo, row) if row else None
    if row and row.status == "queued":
        ensure_worker()
    return result


async def stop_ingest_jobs() -> None:
    if _worker is not None and not _worker.done():
        _worker.cancel()
        await asyncio.gather(_worker, return_exceptions=True)
