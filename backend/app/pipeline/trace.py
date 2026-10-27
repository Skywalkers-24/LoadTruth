# ruff: noqa: E501
"""Visible pipeline trace + a process-wide job store (PLAN.md §5, §1a).

Every clip that runs through the pipeline produces a `PipelineTrace`: an ordered
list of stage records, each with the model that ran, a human summary of what it
produced, an optional confidence, and timing. The `JobStore` keeps the most
recent runs so the UI can show a live "Pipeline" view of all jobs and so a single
ticket can show exactly how its numbers were produced.

This is an in-memory, async-safe store (like the cost ledger). It is not the
system of record; it is operational telemetry for the demo's "show the AI work"
surface. Swap for a DB table (`pipeline_runs`) later with no caller change.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from uuid import UUID


@dataclass(slots=True)
class StageRecord:
    """One pipeline stage and what it produced."""

    key: str
    label: str
    model: str
    status: str  # "ok" | "skipped" | "flagged"
    summary: str
    confidence: float | None = None
    duration_ms: float = 0.0


@dataclass(slots=True)
class PipelineTrace:
    """The full trace for one clip run. Collected during the pipeline."""

    content_hash: str
    stages: list[StageRecord] = field(default_factory=list)
    started_at: float = field(default_factory=time.time)
    # Populated once the ticket is drafted / the run resolves.
    ticket_id: str | None = None
    truck_id: str | None = None
    debris_class: str | None = None
    fill_pct: float | None = None
    dollar_value: float | None = None
    delta_dollar_value: float | None = None
    anomaly_count: int = 0
    outcome: str = "running"  # "running" | "drafted" | "no_truck" | "cached"
    cached: bool = False
    _t0: float = field(default_factory=time.perf_counter)

    def stage(
        self,
        key: str,
        label: str,
        model: str,
        summary: str,
        *,
        status: str = "ok",
        confidence: float | None = None,
    ) -> None:
        now = time.perf_counter()
        dur = (now - self._t0) * 1000.0
        self._t0 = now
        self.stages.append(
            StageRecord(
                key=key,
                label=label,
                model=model,
                status=status,
                summary=summary,
                confidence=confidence,
                duration_ms=round(dur, 1),
            )
        )


@dataclass(slots=True)
class JobSummary:
    """A compact row for the Pipeline jobs list."""

    content_hash: str
    event_id: str
    ticket_id: str | None
    truck_id: str | None
    debris_class: str | None
    outcome: str
    cached: bool
    stage_count: int
    anomaly_count: int
    dollar_value: float | None
    started_at: float


class JobStore:
    """Async-safe ring buffer of the most recent pipeline runs."""

    def __init__(self, maxlen: int = 100) -> None:
        self._runs: deque[tuple[str, PipelineTrace]] = deque(maxlen=maxlen)
        self._lock = asyncio.Lock()

    async def add(self, event_id: UUID, trace: PipelineTrace) -> None:
        async with self._lock:
            self._runs.appendleft((str(event_id), trace))

    async def recent(self, event_id: UUID | None = None, limit: int = 50) -> list[tuple[str, PipelineTrace]]:
        async with self._lock:
            rows = list(self._runs)
        if event_id is not None:
            rows = [r for r in rows if r[0] == str(event_id)]
        return rows[:limit]

    async def for_ticket(self, ticket_id: str) -> PipelineTrace | None:
        async with self._lock:
            for _ev, tr in self._runs:
                if tr.ticket_id == ticket_id:
                    return tr
        return None


_job_store = JobStore()


def get_job_store() -> JobStore:
    """The shared pipeline job store."""
    return _job_store
