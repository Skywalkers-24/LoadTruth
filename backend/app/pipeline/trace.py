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
from collections.abc import Callable
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
    # Ordered (label, value) facts from the model's response: its raw answer,
    # tokens, cost, objects found, and the measurement inputs.
    details: list[list[str]] = field(default_factory=list)
    # Model-authored "AI analysis" paragraph for the Pipeline screen (empty when
    # the model supplied none; the UI falls back to the summary).
    analysis: str = ""


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
    # Optional sink called with each StageRecord the instant it is recorded, so
    # a live progress view can stream stages as they land (set by the ingest run;
    # None for a plain trace). Must not raise.
    on_stage: Callable[[StageRecord], None] | None = field(default=None, compare=False, repr=False)

    def stage(
        self,
        key: str,
        label: str,
        model: str,
        summary: str,
        *,
        status: str = "ok",
        confidence: float | None = None,
        details: list[list[str]] | None = None,
        duration_ms: float | None = None,
        analysis: str = "",
    ) -> None:
        """Record a stage. ``duration_ms`` overrides the wall-clock gap since the
        previous stage (use the model's own response time for AI stages, since
        those calls run in parallel). ``analysis`` is the model-authored
        paragraph for the Pipeline screen (empty falls back to the summary)."""
        now = time.perf_counter()
        dur = (now - self._t0) * 1000.0
        self._t0 = now
        record = StageRecord(
            key=key,
            label=label,
            model=model,
            status=status,
            summary=summary,
            confidence=confidence,
            duration_ms=round(duration_ms if duration_ms is not None else dur, 1),
            details=list(details or []),
            analysis=analysis,
        )
        self.stages.append(record)
        if self.on_stage is not None:
            self.on_stage(record)

    def set_analysis(self, by_key: dict[str, str]) -> None:
        """Fill in model-authored analysis on already-recorded stages.

        Stages are appended in pipeline order as they run, but the batched
        ``explain_pipeline`` call that authors their analysis only has the full
        set of facts near the end. This assigns each paragraph to its stage by
        key, leaving a stage's analysis untouched when the model did not supply
        one (the UI then falls back to the summary)."""
        for s in self.stages:
            text = by_key.get(s.key)
            if text:
                s.analysis = text


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
        self._maxlen = maxlen
        self._lock = asyncio.Lock()

    def capacity(self) -> int:
        """How many runs the buffer can hold (its ring size)."""
        return self._maxlen

    async def add(self, event_id: UUID, trace: PipelineTrace) -> None:
        async with self._lock:
            self._runs.appendleft((str(event_id), trace))

    async def recent(
        self, event_id: UUID | None = None, limit: int = 50
    ) -> list[tuple[str, PipelineTrace]]:
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


# ── Live progress (polled by the UI while a clip is running) ─────────────────


@dataclass(slots=True)
class ProgressSnapshot:
    """The current state of the most recent pipeline run for one event.

    The ingest run mutates this as it goes (start, each stage, resolve); the UI
    polls it every few seconds. Because the server holds it, a page refresh
    mid-run still sees the in-flight run instead of a blank upload box. Held in
    memory (per process); not the system of record, which is the durable trace
    saved on the ticket.
    """

    event_id: str
    content_hash: str
    status: str  # "running" | "done"
    stages: list[StageRecord] = field(default_factory=list)
    outcome: str | None = None  # "drafted" | "cached" | "no_truck" | "failed"
    ticket_id: str | None = None
    truck_id: str | None = None
    detail: str | None = None
    started_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    # Monotonic counter bumped on every mutation, so a poller can tell whether
    # anything changed since its last read without diffing the stage list.
    revision: int = 0


class ProgressStore:
    """In-memory, pollable snapshot of the latest run per event.

    One slot per event id: a new run replaces the previous snapshot, so the UI
    always polls the current run. Async-safe. Swap for Redis to share across
    multiple backend replicas (single process is fine for this build).
    """

    def __init__(self) -> None:
        self._runs: dict[str, ProgressSnapshot] = {}
        self._lock = asyncio.Lock()

    async def start(
        self, event_id: UUID, content_hash: str, *, truck_id: str | None = None
    ) -> None:
        async with self._lock:
            self._runs[str(event_id)] = ProgressSnapshot(
                event_id=str(event_id),
                content_hash=content_hash,
                status="running",
                truck_id=truck_id,
            )

    async def add_stage(self, event_id: UUID, content_hash: str, stage: StageRecord) -> None:
        async with self._lock:
            snap = self._runs.get(str(event_id))
            if snap is None or snap.content_hash != content_hash:
                return  # a stale run (superseded by a newer upload); ignore
            snap.stages.append(stage)
            snap.updated_at = time.time()
            snap.revision += 1

    async def finish(
        self,
        event_id: UUID,
        content_hash: str,
        *,
        outcome: str,
        ticket_id: str | None = None,
        truck_id: str | None = None,
        detail: str | None = None,
    ) -> None:
        async with self._lock:
            snap = self._runs.get(str(event_id))
            if snap is None or snap.content_hash != content_hash:
                return
            snap.status = "done"
            snap.outcome = outcome
            snap.ticket_id = ticket_id
            if truck_id is not None:
                snap.truck_id = truck_id
            snap.detail = detail
            snap.updated_at = time.time()
            snap.revision += 1

    async def latest(self, event_id: UUID) -> ProgressSnapshot | None:
        """The most recent run snapshot for an event, or None if none yet."""
        async with self._lock:
            return self._runs.get(str(event_id))

    def stage_sink(self, event_id: UUID, content_hash: str) -> Callable[[StageRecord], None]:
        """A sync callback for the trace's ``on_stage`` hook that records a stage.

        Called synchronously from the pipeline; it hands off to the async
        ``add_stage`` on the running loop without blocking stage recording."""
        loop = asyncio.get_running_loop()

        def _emit(stage: StageRecord) -> None:
            loop.create_task(  # noqa: RUF006 — fire and forget
                self.add_stage(event_id, content_hash, stage)
            )

        return _emit


_progress_store = ProgressStore()


def get_progress_store() -> ProgressStore:
    """The shared live-progress snapshot store."""
    return _progress_store
