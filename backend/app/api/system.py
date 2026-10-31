"""System insight API: the AI pipeline cost ledger and model status (PLAN.md §1a).

Surfaces the "depth you can't otherwise see" widget: per-stage run counts, the
cache hit rate, spend against the budget caps, and which AI models back the
pipeline (and whether they are live or fixture-backed). Read-only.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.ai import catalog
from app.ai.config_store import (
    ConfigValidationError,
    TaskConfig,
    TaskConfigUpdate,
    get_ai_config_store,
)
from app.api.deps import CurrentMember, require
from app.api.ingest import get_cost_ledger
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import can_manage_settings
from app.config import get_settings
from app.pipeline.trace import (
    PipelineTrace,
    StageRecord,
    display_stage_summary,
    get_job_store,
    get_progress_store,
)
from app.tickets.repository import TicketNotFoundError

router = APIRouter(prefix="/system", tags=["system"])

# Tuning which model/effort powers the pipeline can only be changed by SuperAdmin.
ManageAIConfig = Depends(
    require(can_manage_settings, "Only SuperAdmin can change AI model settings.")
)


class PipelineStats(BaseModel):
    total_runs: int
    cache_hits: int
    cache_hit_rate: float
    per_stage: dict[str, int]
    spent_usd: float
    hard_cap_usd: float
    remaining_usd: float
    soft_cap_hit: bool
    hard_cap_hit: bool
    # Model layer status.
    mode: str  # "fixtures" (mock) or "live"
    sam_model: str
    spark_model: str


@router.get("/pipeline", response_model=PipelineStats)
async def pipeline_stats(_: CurrentMember) -> PipelineStats:
    """Cost ledger summary + budget + model status for the AI pipeline."""
    ledger = get_cost_ledger()
    summary = ledger.summarize()
    budget = ledger.budget_status()
    settings = get_settings()
    live = settings.model_api_configured and not settings.mock_ai
    return PipelineStats(
        total_runs=summary.total_runs,
        cache_hits=summary.cache_hits,
        cache_hit_rate=summary.cache_hit_rate,
        per_stage=summary.per_stage,
        spent_usd=budget.spent_usd,
        hard_cap_usd=budget.hard_cap_usd,
        remaining_usd=budget.remaining_usd,
        soft_cap_hit=budget.soft_cap_hit,
        hard_cap_hit=budget.hard_cap_hit,
        mode="live" if live else "fixtures",
        sam_model=settings.sam_model,
        spark_model=", ".join(
            dict.fromkeys(
                cfg.model for cfg in get_ai_config_store().all() if cfg.task_id != "sam_track"
            )
        ),
    )


# ── Pipeline jobs + per-ticket trace (the visible AI work) ───────────────────


class StageOut(BaseModel):
    key: str
    label: str
    model: str
    status: str
    summary: str
    confidence: float | None = None
    duration_ms: float
    # Ordered [label, value] facts from the model's response.
    details: list[list[str]] = []
    # Model-authored "AI analysis" paragraph for this stage (empty = fall back
    # to summary in the UI).
    analysis: str = ""


class JobOut(BaseModel):
    content_hash: str
    event_id: str
    ticket_id: str | None
    truck_id: str | None
    debris_class: str | None
    outcome: str
    cached: bool
    anomaly_count: int
    dollar_value: float | None
    started_at: float
    stages: list[StageOut]


class PaginatedJobs(BaseModel):
    """A page of pipeline jobs plus the full matching count, like PaginatedTickets."""

    items: list[JobOut]
    total: int
    limit: int
    offset: int


def _details(raw: object) -> list[list[str]]:
    """Persisted stage details as clean [label, value] pairs (tolerates nulls)."""
    if not isinstance(raw, list):
        return []
    return [[str(r[0]), str(r[1])] for r in raw if isinstance(r, list | tuple) and len(r) == 2]


def _stage_out(s: StageRecord) -> StageOut:
    return StageOut(
        key=s.key,
        label=s.label,
        model=s.model,
        status=s.status,
        summary=display_stage_summary(s.key, s.summary, s.details),
        confidence=s.confidence,
        duration_ms=s.duration_ms,
        details=s.details,
        analysis=s.analysis,
    )


def _job_out(event_id: str, tr: PipelineTrace) -> JobOut:
    return JobOut(
        content_hash=tr.content_hash,
        event_id=event_id,
        ticket_id=tr.ticket_id,
        truck_id=tr.truck_id,
        debris_class=tr.debris_class,
        outcome=tr.outcome,
        cached=tr.cached,
        anomaly_count=tr.anomaly_count,
        dollar_value=tr.dollar_value,
        started_at=tr.started_at,
        stages=[_stage_out(s) for s in tr.stages],
    )


@router.get("/jobs", response_model=PaginatedJobs)
async def list_jobs(
    _: CurrentMember,
    tenant: ActiveTenant,
    repo: Repository,
    event_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedJobs:
    """Pipeline runs as a paginated envelope (newest first), scoped to the tenant.

    The shared job store is process-global and holds runs for every tenant, so
    we filter to the events this tenant actually owns before returning anything.
    The in-memory live traces are merged with every ticket's persisted trace
    from the database (de-duped by ticket), then paged on the server with
    ``limit`` (1-100, default 20) / ``offset`` so the UI can walk the whole list
    rather than only the first window. ``total`` is the full matching count.
    """
    owned = {str(e.id) for e in await repo.list_events(tenant)}
    if event_id is not None and str(event_id) not in owned:
        return PaginatedJobs(items=[], total=0, limit=limit, offset=offset)
    # Live window first: the in-memory store has the richest, freshest traces.
    rows = await get_job_store().recent(event_id, limit=get_job_store().capacity())
    jobs = [_job_out(ev, tr) for ev, tr in rows if ev in owned]
    seen_tickets: set[str] = {j.ticket_id for j in jobs if j.ticket_id}

    # Durable fallback: the store is process-local and empties on restart, so
    # also surface every ticket's persisted trace from the database. This keeps
    # the AI Pipeline populated across restarts, de-duped against the live rows.
    db_jobs = await _persisted_jobs(repo, tenant, event_id, seen_tickets)
    jobs.extend(db_jobs)
    jobs.sort(key=lambda j: j.started_at, reverse=True)

    total = len(jobs)
    page = jobs[offset : offset + limit]
    return PaginatedJobs(items=page, total=total, limit=limit, offset=offset)


async def _persisted_jobs(
    repo: Repository,
    tenant: UUID,
    event_id: UUID | None,
    skip_tickets: set[str],
) -> list[JobOut]:
    """Reconstruct pipeline jobs from the database: tickets plus saved stages.

    Returns every ticket with a persisted trace (newest-first) that is not
    already shown by a live run; paging happens once in :func:`list_jobs` over
    the merged list, so this returns the full set and never trims.
    """
    all_tickets = await repo.list_tickets(tenant, event_id)
    candidates = [t for t in all_tickets if str(t.id) not in skip_tickets]
    if not candidates:
        return []
    stages_by_ticket = await repo.pipeline_stages_for_tickets(tenant, [t.id for t in candidates])
    out: list[JobOut] = []
    for t in candidates:
        stage_rows = stages_by_ticket.get(t.id, [])
        if not stage_rows:
            continue  # nothing persisted for this ticket; skip rather than show an empty run
        out.append(
            JobOut(
                content_hash=f"ticket:{t.id}",
                event_id=str(t.event_id),
                ticket_id=str(t.id),
                truck_id=t.truck_id,
                debris_class=t.debris_class.value,
                outcome="created",
                cached=False,
                anomaly_count=t.anomaly_count,
                dollar_value=float(t.est_dollar_value),
                started_at=t.created_at.timestamp(),
                stages=[
                    StageOut(
                        key=s.stage_key,
                        label=s.label,
                        model=s.model,
                        status=s.status,
                        summary=display_stage_summary(s.stage_key, s.summary, s.details),
                        confidence=float(s.confidence) if s.confidence is not None else None,
                        duration_ms=float(s.duration_ms),
                        details=_details(s.details),
                        analysis=s.analysis or "",
                    )
                    for s in stage_rows
                ],
            )
        )
    return out


@router.get("/jobs/ticket/{ticket_id}", response_model=JobOut | None)
async def job_for_ticket(
    _: CurrentMember, tenant: ActiveTenant, repo: Repository, ticket_id: str
) -> JobOut | None:
    """The pipeline trace that produced a given ticket, if still in the buffer.

    Verifies the ticket belongs to the caller's tenant before returning any
    trace, so a job from another tenant can't be read by guessing its id.
    """
    try:
        ticket = await repo.get_ticket(tenant, UUID(ticket_id))
    except (TicketNotFoundError, ValueError):
        return None
    tr = await get_job_store().for_ticket(ticket_id)
    return _job_out(str(ticket.event_id), tr) if tr else None


# ── Live pipeline progress (polled) ───────────────────────────────────────────


class ProgressOut(BaseModel):
    """The current (or most recent) pipeline run for an event, for the UI to poll.

    ``status`` is "running" or "done"; the UI keeps polling while it is running
    and stops once it is done. Because the server holds this, a page refreshed
    mid-run still shows the in-flight run instead of a blank upload box.
    """

    event_id: str
    content_hash: str
    status: str
    outcome: str | None = None
    ticket_id: str | None = None
    truck_id: str | None = None
    detail: str | None = None
    started_at: float
    updated_at: float
    revision: int
    stages: list[StageOut]


@router.get("/events/{event_id}/pipeline-progress", response_model=ProgressOut | None)
async def pipeline_progress(
    _: CurrentMember, tenant: ActiveTenant, repo: Repository, event_id: UUID
) -> ProgressOut | None:
    """The latest pipeline run for an event (polled every few seconds by the UI).

    Returns null when no run has happened for this event yet. Tenant-scoped: a
    caller can only see runs for events their tenant owns."""
    owned = {str(e.id) for e in await repo.list_events(tenant)}
    if str(event_id) not in owned:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    snap = await get_progress_store().latest(event_id)
    if snap is None:
        return None
    return ProgressOut(
        event_id=snap.event_id,
        content_hash=snap.content_hash,
        status=snap.status,
        outcome=snap.outcome,
        ticket_id=snap.ticket_id,
        truck_id=snap.truck_id,
        detail=snap.detail,
        started_at=snap.started_at,
        updated_at=snap.updated_at,
        revision=snap.revision,
        stages=[_stage_out(s) for s in snap.stages],
    )


# ── AI model & effort configuration (admin) ──────────────────────────────────


class AICatalog(BaseModel):
    """The full menu the settings UI renders: models, effort levels, and tasks."""

    models: list[catalog.ModelInfo]
    tasks: list[catalog.TaskInfo]
    efforts: list[str]
    cost_modes: list[str]


class AIConfigResponse(BaseModel):
    """Current effective per-task config plus the catalog to render it against."""

    catalog: AICatalog
    config: list[TaskConfig]


def _catalog() -> AICatalog:
    from app.ai.providers import default_chat_model, endpoint

    models = []
    for model in catalog.MODELS.values():
        if model.provider == "meta":
            models.append(model)
        else:
            s = get_settings()
            rates = [
                float(getattr(s, f"{model.provider}_{name}_price"))
                for name in ("input", "cached_input", "output")
            ]
            price = (
                catalog.ModelPricing(input=rates[0], cached_input=rates[1], output=rates[2])
                if rates[0] and rates[2]
                else None
            )
            modalities = ["text", "image"] if endpoint(model.provider).vision else ["text"]
            models.append(
                model.model_copy(
                    update={
                        "available": endpoint(model.provider).configured,
                        "pricing": price,
                        "modalities": modalities,
                    }
                )
            )
    tasks = []
    for task in catalog.TASKS.values():
        if task.kind != "chat":
            tasks.append(task)
            continue
        eligible = list(task.eligible_models)
        if (
            get_settings().fireworks_supports_vision
            and "fireworks/configured-model" not in eligible
        ):
            eligible.append("fireworks/configured-model")
        tasks.append(
            task.model_copy(
                update={
                    "default_model": default_chat_model(
                        task.default_model,
                        vision=task.id in ("spark_ocr", "spark_classify", "name_load"),
                    ),
                    "eligible_models": eligible,
                }
            )
        )
    return AICatalog(
        models=models,
        tasks=tasks,
        efforts=[e.value for e in catalog.ReasoningEffort],
        cost_modes=[m.value for m in catalog.CostMode],
    )


@router.get("/ai-config", response_model=AIConfigResponse)
async def get_ai_config(_: CurrentMember) -> AIConfigResponse:
    """The model/effort catalog + the admin's current per-task selections."""
    store = get_ai_config_store()
    return AIConfigResponse(catalog=_catalog(), config=store.all())


@router.patch("/ai-config/{task_id}", response_model=TaskConfig, dependencies=[ManageAIConfig])
async def update_ai_config(task_id: str, patch: TaskConfigUpdate) -> TaskConfig:
    """Set the model, reasoning effort, and cost mode for one AI task."""
    store = get_ai_config_store()
    try:
        return await store.update(task_id, patch)
    except ConfigValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/ai-config/{task_id}/reset", response_model=TaskConfig, dependencies=[ManageAIConfig])
async def reset_ai_config(task_id: str) -> TaskConfig:
    """Revert one task to the recommended catalog default."""
    store = get_ai_config_store()
    try:
        return await store.reset(task_id)
    except ConfigValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
