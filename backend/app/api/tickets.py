"""Ticket, event, and dashboard API routes.

The review surface (PLAN.md §3.3) and the dashboard money-frame roll-up (§3.4,
§7a) are served here. Recording a monitor call recomputes and persists the
signed dollar-delta via the deterministic `value_ticket()` path — the UI never
does the math itself.
"""

from __future__ import annotations

import wave
from decimal import Decimal
from io import BytesIO
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, Field, field_validator

from app.api.cache import cached_api, invalidate_cache_tags
from app.api.deps import CurrentMember, require
from app.api.event_policy import require_event_write
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_manage_settings, can_review_tickets, is_super_admin
from app.config import get_settings
from app.pipeline import evidence_store
from app.pipeline.benchmark_media import benchmark_media_url
from app.pipeline.trace import display_stage_summary
from app.tickets.repository import EventNotFoundError, TicketNotFoundError
from app.tickets.schemas import (
    AnomalyOut,
    DashboardOut,
    DebrisClass,
    EventIn,
    EventOut,
    EventPatch,
    MonitorCallIn,
    PaginatedTickets,
    ReportsSummary,
    SortOrder,
    StatusIn,
    TicketOut,
    TicketPatch,
    TicketSort,
    TicketStatus,
    event_to_out,
    ticket_to_out,
)

router = APIRouter(tags=["tickets"])

# Managing events and their rate tables requires SuperAdmin;
# reviewing tickets (monitor call, confirm/override/dispute) needs review rights.
_NO_EVENTS = "Only SuperAdmin can manage workspace events and rate tables."
_NO_REVIEW = "You do not have permission to review tickets."
ManageEvents = Depends(require(can_manage_settings, _NO_EVENTS))
ReviewTickets = Depends(require(can_review_tickets, _NO_REVIEW))


class MonitorCallTranscriptOut(BaseModel):
    transcript: str
    audio_duration_ms: int
    suggested_fill_pct: float | None = None
    issue_flags: list[str] = Field(default_factory=list)
    follow_up_question: str | None = None
    saved_fill_pct: float | None = None
    updated_ticket: TicketOut | None = None


class ManualMonitorFilingIn(BaseModel):
    monitor_fill_pct: Decimal | None = Field(default=None, ge=0, le=100)
    issue_description: str | None = Field(default=None, max_length=512)

    @field_validator("issue_description")
    @classmethod
    def normalize_issue(cls, value: str | None) -> str | None:
        return value.strip() if value and value.strip() else None


async def _require_writable_ticket(
    repo: Repository, tenant: UUID, ticket_id: UUID, role: str
) -> None:
    """Keep curated benchmark tickets immutable for every role."""
    try:
        ticket = await repo.get_ticket(tenant, ticket_id)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    await require_event_write(repo, tenant, ticket.event_id, role, review=True)


@router.get("/events", response_model=list[EventOut])
async def list_events(repo: Repository, tenant: ActiveTenant) -> list[EventOut]:
    """List disaster events in the active tenant."""

    async def _compute() -> list[EventOut]:
        events = await repo.list_events(tenant)
        return [event_to_out(e) for e in events]

    return await cached_api(
        tags=[f"tenant:{tenant}:events"],
        key=f"events:{tenant}",
        compute=_compute,
        to_dict=lambda evts: [e.model_dump(mode="json") for e in evts],
        from_dict=lambda data: [EventOut.model_validate(e) for e in data],
    )


@router.post(
    "/events",
    response_model=EventOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[ManageEvents],
)
async def create_event(repo: Repository, tenant: ActiveTenant, body: EventIn) -> EventOut:
    """Create a disaster event in the active tenant (admin screen)."""
    event = await repo.create_event(
        tenant,
        name=body.name,
        location=body.location,
        status=body.status,
        rate_table=body.rate_table,
        tags=body.tags,
    )
    await invalidate_cache_tags(f"tenant:{tenant}:events")
    return event_to_out(event)


@router.patch("/events/{event_id}", response_model=EventOut, dependencies=[ManageEvents])
async def update_event(
    repo: Repository, tenant: ActiveTenant, event_id: UUID, body: EventPatch
) -> EventOut:
    """Update an event; only supplied fields change."""
    event_row = await repo.get_event(tenant, event_id)
    if event_row is not None and "read-only" in event_row.tags:
        raise HTTPException(status.HTTP_409_CONFLICT, "This showcase event is read-only.")
    try:
        event = await repo.update_event(
            tenant,
            event_id,
            name=body.name,
            location=body.location,
            status=body.status,
            rate_table=body.rate_table,
            tags=body.tags,
            fields_set=set(body.model_fields_set),
        )
    except EventNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found") from exc
    await invalidate_cache_tags(f"tenant:{tenant}:events", f"event:{event_id}")
    return event_to_out(event)


@router.get("/tickets", response_model=PaginatedTickets)
async def list_tickets(
    repo: Repository,
    tenant: ActiveTenant,
    event_id: UUID | None = None,
    status: TicketStatus | None = None,
    debris_class: DebrisClass | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    sort: TicketSort = TicketSort.CREATED,
    order: SortOrder = SortOrder.DESC,
) -> PaginatedTickets:
    """List tickets as a paginated envelope.

    Supports optional ``event_id``/``status``/``debris_class`` filters,
    ``limit`` (1-100, default 20) / ``offset`` (default 0) paging, and
    ``sort``/``order`` (default newest first). ``total`` is the full matching
    count, not the size of the returned page. Sorting and paging happen on the
    server so the ledger can walk every row in the chosen order, not just the
    first window.
    """
    tickets, total = await repo.list_tickets_page(
        tenant,
        event_id=event_id,
        status=status,
        debris_class=debris_class,
        limit=limit,
        offset=offset,
        sort=sort,
        order=order,
    )
    return PaginatedTickets(
        items=[ticket_to_out(t) for t in tickets],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(repo: Repository, tenant: ActiveTenant, ticket_id: UUID) -> TicketOut:
    """Fetch a single ticket with its valuation, evidence, and itemized flags."""
    try:
        ticket = await repo.get_ticket(tenant, ticket_id)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    out = ticket_to_out(ticket)
    rows = await repo.list_anomalies_for_ticket(tenant, ticket_id)
    out.anomalies = [
        AnomalyOut(
            type=r.type,
            severity=r.severity,
            explanation=r.explanation or "",
            evidence_frame=r.evidence_frame,
        )
        for r in rows
    ]
    return out


class PipelineStageOut(BaseModel):
    """One persisted AI pipeline stage for a ticket."""

    key: str
    label: str
    model: str
    status: str
    summary: str
    confidence: float | None = None
    duration_ms: float = 0.0
    details: list[list[str]] = Field(default_factory=list)
    analysis: str = ""


@router.get("/tickets/{ticket_id}/pipeline", response_model=list[PipelineStageOut])
async def ticket_pipeline(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID
) -> list[PipelineStageOut]:
    """The persisted AI pipeline trace for a ticket (how its numbers were produced)."""
    rows = await repo.list_pipeline_stages(tenant, ticket_id)
    return [
        PipelineStageOut(
            key=r.stage_key,
            label=r.label,
            model=r.model,
            status=r.status,
            summary=display_stage_summary(r.stage_key, r.summary, r.details),
            confidence=float(r.confidence) if r.confidence is not None else None,
            duration_ms=float(r.duration_ms),
            details=[
                [str(d[0]), str(d[1])]
                for d in (r.details or [])
                if isinstance(d, list | tuple) and len(d) == 2
            ],
            analysis=r.analysis or "",
        )
        for r in rows
    ]


class EvidenceOut(BaseModel):
    """The processed clip behind a ticket and SAM's raw per-frame segmentation."""

    media_kind: str
    mime: str
    # Frame rate of the stored video when known; SAM frame N plays at N / fps.
    fps: float | None = None
    has_media: bool
    media_url: str | None = None
    media_storage: str = "b2"
    footage_expired: bool = False
    # Concept label ("truck bed", "debris pile") -> SAM 3.1 output text.
    segments: dict[str, str] = Field(default_factory=dict)


@router.get("/tickets/{ticket_id}/evidence", response_model=EvidenceOut)
async def ticket_evidence(repo: Repository, tenant: ActiveTenant, ticket_id: UUID) -> EvidenceOut:
    """What the models saw for this ticket, for the Review console overlay."""
    row = await repo.get_ticket_evidence(tenant, ticket_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no evidence for this ticket")
    public_url = benchmark_media_url(row.content_hash)
    stored = (
        await evidence_store.load(row.content_hash, storage=row.media_storage)
        if public_url is None
        else None
    )
    raw = row.segments if isinstance(row.segments, dict) else {}
    return EvidenceOut(
        media_kind=row.media_kind,
        mime=stored.mime if stored else row.mime,
        fps=float(row.fps) if row.fps is not None else (stored.fps if stored else None),
        has_media=public_url is not None or stored is not None,
        media_url=public_url,
        media_storage=row.media_storage,
        footage_expired=(row.media_storage == "memory" and stored is None and public_url is None),
        segments={str(k): str(v) for k, v in raw.items()},
    )


@router.get("/tickets/{ticket_id}/evidence/media")
async def ticket_evidence_media(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID
) -> Response:
    """Authorize once, then play private B2 evidence without proxying video bytes."""
    row = await repo.get_ticket_evidence(tenant, ticket_id)
    if row is not None and (public_url := benchmark_media_url(row.content_hash)):
        return RedirectResponse(public_url, status_code=307)
    if row is not None and row.media_storage == "memory":
        entry = evidence_store.memory_entry(row.content_hash)
        if entry is None:
            raise HTTPException(410, "Footage expired — ticket details retained.")
        return Response(entry[1], media_type=entry[2], headers={"Cache-Control": "no-store"})
    stored = (
        await evidence_store.load(row.content_hash, storage=row.media_storage)
        if row is not None
        else None
    )
    if row is None or stored is None:
        raise HTTPException(404, "no evidence media for this ticket")
    return RedirectResponse(
        await evidence_store.media_url(row.content_hash),
        status_code=307,
        headers={"Cache-Control": "no-store"},
    )


@router.get("/tickets/{ticket_id}/evidence/url")
async def ticket_evidence_url(
    repo: Repository,
    tenant: ActiveTenant,
    ticket_id: UUID,
    quality: str = "high",
) -> dict[str, str]:
    row = await repo.get_ticket_evidence(tenant, ticket_id)
    if row is not None and (public_url := benchmark_media_url(row.content_hash, quality=quality)):
        return {"url": public_url}
    if (
        row is None
        or await evidence_store.load(row.content_hash, storage=row.media_storage) is None
    ):
        raise HTTPException(404, "no evidence media for this ticket")
    if row.media_storage == "memory":
        return {"url": f"/tickets/{ticket_id}/evidence/media", "storage": "memory"}
    return {"url": await evidence_store.media_url(row.content_hash)}


class ReverifyOut(BaseModel):
    """The result of reproducing a ticket's number from its stored evidence.

    ``reproducible`` is true when the fill % recomputed from the stored Muse
    per-frame estimates (or SAM masks for legacy/fixture results) matches the
    ticket. ``receipt_hash`` fingerprints every pinned input.
    """

    ticket_id: UUID
    reproducible: bool
    reason: str
    stored_fill_pct: Decimal
    recomputed_fill_pct: Decimal | None = None
    receipt_hash: str | None = None
    receipt_inputs: dict[str, object] = Field(default_factory=dict)


@router.post("/tickets/{ticket_id}/reverify", response_model=ReverifyOut)
async def reverify_ticket(repo: Repository, tenant: ActiveTenant, ticket_id: UUID) -> ReverifyOut:
    """Reproduce the ticket's measured fill % from its stored evidence.

    Deterministic and offline: combines stored Muse frame estimates using the
    ingestion median (or replays SAM geometry for legacy/fixture results) and
    rebuilds the evidence receipt without any model call.
    """
    try:
        r = await repo.reverify_ticket(tenant, ticket_id)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    return ReverifyOut(
        ticket_id=ticket_id,
        reproducible=r.reproducible,
        reason=r.reason,
        stored_fill_pct=r.stored_fill_pct,
        recomputed_fill_pct=r.recomputed_fill_pct,
        receipt_hash=r.receipt_hash,
        receipt_inputs=r.receipt_inputs,
    )


@router.patch("/tickets/{ticket_id}/monitor-call", response_model=TicketOut, dependencies=[])
async def set_monitor_call(
    repo: Repository,
    tenant: ActiveTenant,
    ticket_id: UUID,
    body: MonitorCallIn,
    member: CurrentMember,
) -> TicketOut:
    """Record the monitor's fill-% call; recomputes and persists the §7a delta."""
    await _require_writable_ticket(repo, tenant, ticket_id, member.role)
    try:
        t = await repo.set_monitor_call(tenant, ticket_id, body.monitor_fill_pct)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    await invalidate_cache_tags(f"event:{t.event_id}", f"tenant:{tenant}:billing")
    return ticket_to_out(t)


@router.post(
    "/tickets/{ticket_id}/monitor-call/manual",
    response_model=TicketOut,
    dependencies=[],
)
async def file_manual_monitor_report(
    repo: Repository,
    tenant: ActiveTenant,
    ticket_id: UUID,
    body: ManualMonitorFilingIn,
    member: CurrentMember,
) -> TicketOut:
    """Save a manually entered monitor fill call and/or issue review flag."""
    await _require_writable_ticket(repo, tenant, ticket_id, member.role)
    issue = body.issue_description
    if body.monitor_fill_pct is None and issue is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Enter a fill call or issue description."
        )
    if issue is not None and len(issue) < 4:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Describe the issue in at least 4 characters."
        )

    if body.monitor_fill_pct is not None:
        try:
            await repo.set_monitor_call(tenant, ticket_id, body.monitor_fill_pct)
        except TicketNotFoundError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc

    if issue is not None:
        from app.db import models

        previous = await repo.list_anomalies_for_ticket(tenant, ticket_id)
        duplicate = any(row.type == "monitor_call" and row.explanation == issue for row in previous)
        if not duplicate:
            repo.session.add(
                models.Anomaly(
                    tenant_id=tenant,
                    ticket_id=ticket_id,
                    type="monitor_call",
                    severity="warn",
                    explanation=issue,
                    evidence_frame=None,
                )
            )
            await repo.session.flush()

    ticket = await repo.get_ticket(tenant, ticket_id)
    await invalidate_cache_tags(f"event:{ticket.event_id}", f"tenant:{tenant}:billing")
    return ticket_to_out(ticket)


@router.post(
    "/tickets/{ticket_id}/monitor-call/transcribe",
    response_model=MonitorCallTranscriptOut,
    dependencies=[],
)
async def transcribe_monitor_call(
    repo: Repository,
    tenant: ActiveTenant,
    ticket_id: UUID,
    member: CurrentMember,
    audio: UploadFile = File(...),  # noqa: B008 - FastAPI request field
    context: str = Form(default=""),
) -> MonitorCallTranscriptOut:
    """Transcribe, interpret, and apply clear inspector-call values and flags."""
    if not is_super_admin(member.role):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Microphone transcription is available in Administrator mode only.",
        )
    await _require_writable_ticket(repo, tenant, ticket_id, member.role)
    settings = get_settings()
    if not settings.model_api_configured:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Muse audio analysis is not configured."
        )
    if audio.content_type not in {
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "application/octet-stream",
    }:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Record a WAV audio clip.")

    raw = await audio.read(2_000_001)
    if len(raw) > 3_000_000:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Audio must be 15 seconds or shorter."
        )
    try:
        with wave.open(BytesIO(raw), "rb") as wav:
            channels, sample_width, sample_rate, frames = (
                wav.getnchannels(),
                wav.getsampwidth(),
                wav.getframerate(),
                wav.getnframes(),
            )
            if channels != 1 or sample_width != 2 or sample_rate not in (16000, 24000):
                raise ValueError("unsupported WAV format")
            duration_ms = round(frames * 1000 / sample_rate)
            if not 250 <= duration_ms <= 15_000:
                raise ValueError("audio must be between 0.25 and 15 seconds")
    except (wave.Error, EOFError, ValueError) as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Audio must be mono 16-bit PCM WAV at 16 or 24 kHz and 0.25–15 seconds long.",
        ) from exc

    try:
        from app.ai.live import LiveAIClient

        ai = LiveAIClient()
        try:
            analysis = await ai.interpret_monitor_call_audio(raw, context)
        finally:
            await ai.aclose()
    except Exception:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Muse could not transcribe and interpret this recording. "
            "Please retry or enter the call manually.",
        ) from None

    transcript = analysis.get("transcript")
    if not isinstance(transcript, str) or not transcript.strip():
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Muse returned no transcript. Please retry."
        )

    suggested = analysis.get("fill_pct")
    if (
        isinstance(suggested, bool)
        or not isinstance(suggested, int | float)
        or not 0 <= suggested <= 100
    ):
        suggested = None
    flags = analysis.get("issue_flags")
    if not isinstance(flags, list):
        flags = []
    flags = [item.strip()[:160] for item in flags if isinstance(item, str) and item.strip()][:5]
    question = analysis.get("follow_up_question")
    if not isinstance(question, str) or not question.strip():
        question = None
    saved_fill: float | None = None
    updated_ticket: TicketOut | None = None
    if suggested is not None:
        try:
            updated = await repo.set_monitor_call(tenant, ticket_id, Decimal(str(suggested)))
            saved_fill = float(suggested)
            updated_ticket = ticket_to_out(updated)
            await invalidate_cache_tags(f"event:{updated.event_id}", f"tenant:{tenant}:billing")
        except TicketNotFoundError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc

    # Explicitly spoken problems become review flags, deduplicated on repeated
    # recordings. They remain ordinary review anomalies and never decide the ticket.
    if flags:
        from app.db import models

        previous = await repo.list_anomalies_for_ticket(tenant, ticket_id)
        known = {row.explanation for row in previous if row.type == "monitor_call"}
        recorded_flags: list[str] = []
        for issue in flags:
            if issue in known:
                continue
            repo.session.add(
                models.Anomaly(
                    tenant_id=tenant,
                    ticket_id=ticket_id,
                    type="monitor_call",
                    severity="warn",
                    explanation=issue[:512],
                    evidence_frame=None,
                )
            )
            recorded_flags.append(issue)
        await repo.session.flush()
        updated_ticket = ticket_to_out(await repo.get_ticket(tenant, ticket_id))
        await invalidate_cache_tags(f"event:{updated_ticket.event_id}")
        flags = recorded_flags

    return MonitorCallTranscriptOut(
        transcript=transcript.strip(),
        audio_duration_ms=duration_ms,
        suggested_fill_pct=float(suggested) if suggested is not None else None,
        issue_flags=flags,
        follow_up_question=question.strip()[:300] if question else None,
        saved_fill_pct=saved_fill,
        updated_ticket=updated_ticket,
    )


@router.patch("/tickets/{ticket_id}/status", response_model=TicketOut, dependencies=[])
async def set_status(
    repo: Repository, tenant: ActiveTenant, ticket_id: UUID, body: StatusIn, member: CurrentMember
) -> TicketOut:
    """Confirm, override, or dispute a ticket (the review action)."""
    await _require_writable_ticket(repo, tenant, ticket_id, member.role)
    if body.status is TicketStatus.DRAFT:
        ticket = await repo.get_ticket(tenant, ticket_id)
        event = await repo.get_event(tenant, ticket.event_id)
        if event is None or "playground" not in event.tags:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot set a ticket back to draft")
        from sqlalchemy import update

        from app.db.models import Ticket as TicketRow

        await repo.session.execute(
            update(TicketRow)
            .where(TicketRow.id == ticket_id, TicketRow.tenant_id == tenant)
            .values(
                status="draft",
                confirmed_fill_pct=None,
                monitor_call_fill_pct=None,
                monitor_cubic_yards=None,
                monitor_dollar_value=None,
                delta_cubic_yards=None,
                delta_dollar_value=None,
            )
        )
    try:
        t = await repo.set_status(tenant, ticket_id, body.status)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    await invalidate_cache_tags(f"event:{t.event_id}", f"tenant:{tenant}:billing")
    return ticket_to_out(t)


@router.patch("/tickets/{ticket_id}", response_model=TicketOut, dependencies=[])
async def update_ticket(
    repo: Repository,
    tenant: ActiveTenant,
    ticket_id: UUID,
    body: TicketPatch,
    member: CurrentMember,
) -> TicketOut:
    """Edit a ticket's truck ID and/or debris class; recomputes the valuation.

    Setting the truck re-derives its certified capacity from the registry;
    setting the debris class re-reads the event rate. Both re-run the §7a dollar
    math so cubic yards, the monitor delta, and the value stay consistent.
    """
    fields = set(body.model_fields_set)
    await _require_writable_ticket(repo, tenant, ticket_id, member.role)
    if not fields:
        # Nothing to change — return the ticket as-is.
        try:
            return ticket_to_out(await repo.get_ticket(tenant, ticket_id))
        except TicketNotFoundError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    try:
        t = await repo.update_ticket(
            tenant,
            ticket_id,
            truck_id=body.truck_id,
            debris_class=body.debris_class,
            fields_set=fields,
        )
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    await invalidate_cache_tags(f"event:{t.event_id}", f"tenant:{tenant}:billing")
    return ticket_to_out(t)


@router.delete("/tickets/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(
    repo: Repository,
    tenant: ActiveTenant,
    ticket_id: UUID,
    member: CurrentMember,
) -> None:
    """Delete a ticket and its associated anomalies, stages, and evidence."""
    await _require_writable_ticket(repo, tenant, ticket_id, member.role)
    try:
        ticket = await repo.get_ticket(tenant, ticket_id)
        event_id = ticket.event_id
        await repo.delete_ticket(tenant, ticket_id)
    except TicketNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ticket not found") from exc
    await invalidate_cache_tags(f"event:{event_id}", f"tenant:{tenant}:billing")


@router.get("/events/{event_id}/dashboard", response_model=DashboardOut)
async def event_dashboard(repo: Repository, tenant: ActiveTenant, event_id: UUID) -> DashboardOut:
    """Event roll-up: summed dollar-delta, review progress, anomalies, accuracy."""

    async def _compute() -> DashboardOut:
        summary = await repo.dashboard(tenant, event_id)
        return DashboardOut(
            event_id=summary.event_id,
            ticket_count=summary.ticket_count,
            reviewed_count=summary.reviewed_count,
            anomaly_count=summary.anomaly_count,
            overbill_ticket_count=summary.overbill_ticket_count,
            total_delta_cubic_yards=summary.total_delta_cubic_yards,
            total_delta_dollar_value=summary.total_delta_dollar_value,
            accuracy_within_10pct=summary.accuracy_within_10pct,
        )

    return await cached_api(
        tags=[f"event:{event_id}"],
        key=f"dashboard:{tenant}:{event_id}",
        compute=_compute,
        to_dict=lambda d: d.model_dump(mode="json"),
        from_dict=DashboardOut.model_validate,
    )


@router.get("/events/{event_id}/reports/summary", response_model=ReportsSummary)
async def event_reports_summary(
    repo: Repository, tenant: ActiveTenant, event_id: UUID
) -> ReportsSummary:
    """Reports-page roll-up: counts by status/class, dollars, overbill, anomalies."""

    async def _compute() -> ReportsSummary:
        s = await repo.reports_summary(tenant, event_id)
        return ReportsSummary(
            event_id=s.event_id,
            ticket_count=s.ticket_count,
            counts_by_status=s.counts_by_status,
            counts_by_debris_class=s.counts_by_debris_class,
            total_est_dollar_value=s.total_est_dollar_value,
            total_delta_dollar_value=s.total_delta_dollar_value,
            overbill_ticket_count=s.overbill_ticket_count,
            overbill_dollar_value=s.overbill_dollar_value,
            anomaly_counts_by_severity=s.anomaly_counts_by_severity,
            reviewed_count=s.reviewed_count,
            pending_count=s.pending_count,
            accuracy_within_10pct=s.accuracy_within_10pct,
            benchmarked_count=s.benchmarked_count,
        )

    return await cached_api(
        tags=[f"event:{event_id}"],
        key=f"reports_summary:{tenant}:{event_id}",
        compute=_compute,
        to_dict=lambda s: s.model_dump(mode="json"),
        from_dict=ReportsSummary.model_validate,
    )


class PracticeInput(BaseModel):
    source_ticket_id: UUID


@router.get("/practice-sources", response_model=list[TicketOut])
async def practice_sources(repo: Repository, tenant: ActiveTenant) -> list[TicketOut]:
    """Only completed, saved evidence from immutable events can seed practice."""
    from sqlalchemy import select

    from app.db import models

    events = await repo.list_events(tenant)
    ids = [e.id for e in events if "read-only" in e.tags]
    if not ids:
        return []
    rows = (
        (
            await repo.session.execute(
                select(models.Ticket.id)
                .join(models.TicketEvidence, models.TicketEvidence.ticket_id == models.Ticket.id)
                .where(
                    models.Ticket.tenant_id == tenant,
                    models.Ticket.event_id.in_(ids),
                    models.TicketEvidence.tenant_id == tenant,
                    models.TicketEvidence.media_storage != "memory",
                )
                .order_by(models.Ticket.created_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return [ticket_to_out(await repo.get_ticket(tenant, ticket_id)) for ticket_id in rows]


@router.post("/events/{event_id}/practice-tickets", response_model=TicketOut, status_code=201)
async def create_practice_ticket(
    repo: Repository,
    tenant: ActiveTenant,
    event_id: UUID,
    body: PracticeInput,
    member: CurrentMember,
) -> TicketOut:
    """Copy saved results for practice. This route has no inference or upload path."""
    from sqlalchemy import select

    from app.db import models
    from app.tickets.domain import new_ticket

    await require_event_write(repo, tenant, event_id, member.role)
    event = await repo.get_event(tenant, event_id)
    if event is None:
        raise HTTPException(404, "event not found")
    if "playground" not in event.tags:
        raise HTTPException(
            409, "Saved video replays can only create practice tickets in the Sandbox."
        )
    # Serialize practice copies for this event so simultaneous users cannot
    # exceed the 100-ticket retention limit on databases that support row locks.
    await repo.session.execute(
        select(models.Event)
        .where(models.Event.id == event_id, models.Event.tenant_id == tenant)
        .with_for_update()
    )
    try:
        source = await repo.get_ticket(tenant, body.source_ticket_id)
    except TicketNotFoundError as exc:
        raise HTTPException(404, "saved result not found") from exc
    source_event = await repo.get_event(tenant, source.event_id)
    evidence = await repo.get_ticket_evidence(tenant, source.id)
    if (
        source_event is None
        or ("read-only" not in source_event.tags and "benchmark" not in source_event.tags)
        or evidence is None
        or evidence.media_storage == "memory"
    ):
        raise HTTPException(409, "Choose a saved result from a read-only event.")
    # Keep the original estimate and capacity; calculate practice value using its
    # own event rate. Reviews and metadata edits affect only this new ticket.
    draft = new_ticket(
        tenant_id=tenant,
        event_id=event_id,
        debris_class=source.debris_class,
        certified_cubic_yards=source.certified_cubic_yards,
        rate_per_cy=event.rate_for(source.debris_class),
        est_fill_pct=source.est_fill_pct,
        truck_id=source.truck_id,
        evidence_frames=list(source.evidence_frames),
    )
    saved = await repo.add_from_pipeline(draft, [])
    for model in (models.TicketEvidence, models.PipelineStageRow, models.Anomaly):
        originals = (
            (
                await repo.session.execute(
                    select(model).where(model.tenant_id == tenant, model.ticket_id == source.id)
                )
            )
            .scalars()
            .all()
        )
        for row in originals:
            values = {
                c.name: getattr(row, c.name)
                for c in model.__table__.columns
                if c.name not in {"id", "created_at", "updated_at", "ticket_id"}
            }
            repo.session.add(model(**values, ticket_id=saved.id))
    await repo.session.flush()
    # Retain the newest 100 practice tickets. Deleting through the repository
    # also clears linked evidence, pipeline stages, and anomalies.
    old_ids = (
        (
            await repo.session.execute(
                select(models.Ticket.id)
                .where(models.Ticket.tenant_id == tenant, models.Ticket.event_id == event_id)
                .order_by(models.Ticket.created_at.desc(), models.Ticket.id.desc())
                .offset(100)
            )
        )
        .scalars()
        .all()
    )
    for old_id in old_ids:
        await repo.delete_ticket(tenant, old_id)
    await invalidate_cache_tags(f"event:{event_id}", f"tenant:{tenant}:billing")
    return ticket_to_out(await repo.get_ticket(tenant, saved.id))
