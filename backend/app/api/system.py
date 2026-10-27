"""System insight API: the AI pipeline cost ledger and model status (PLAN.md §1a).

Surfaces the "depth you can't otherwise see" widget: per-stage run counts, the
cache hit rate, spend against the budget caps, and which AI models back the
pipeline (and whether they are live or fixture-backed). Read-only.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
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
from app.auth.roles import can_manage_events
from app.config import get_settings
from app.pipeline.trace import PipelineTrace, get_job_store

router = APIRouter(prefix="/system", tags=["system"])

# Tuning which model/effort powers the pipeline is a county-admin-and-up action.
ManageAIConfig = Depends(
    require(can_manage_events, "You do not have permission to change AI settings.")
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
        spark_model=settings.spark_model,
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
        stages=[
            StageOut(
                key=s.key,
                label=s.label,
                model=s.model,
                status=s.status,
                summary=s.summary,
                confidence=s.confidence,
                duration_ms=s.duration_ms,
            )
            for s in tr.stages
        ],
    )


@router.get("/jobs", response_model=list[JobOut])
async def list_jobs(
    _: CurrentMember, event_id: UUID | None = None, limit: int = 50
) -> list[JobOut]:
    """Recent pipeline runs (newest first), optionally scoped to one event."""
    rows = await get_job_store().recent(event_id, limit)
    return [_job_out(ev, tr) for ev, tr in rows]


@router.get("/jobs/ticket/{ticket_id}", response_model=JobOut | None)
async def job_for_ticket(_: CurrentMember, ticket_id: str) -> JobOut | None:
    """The pipeline trace that produced a given ticket, if still in the buffer."""
    tr = await get_job_store().for_ticket(ticket_id)
    return _job_out("", tr) if tr else None


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
    return AICatalog(
        models=list(catalog.MODELS.values()),
        tasks=list(catalog.TASKS.values()),
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
