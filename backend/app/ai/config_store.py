"""Runtime, admin-tunable AI configuration — per-task model + effort + cost mode.

The ``AIClient`` is a process-wide singleton, so model/effort choices are
operationally global (per workspace/process) rather than per-event. This store
holds the admin's overrides on top of the catalog defaults
(:mod:`app.ai.catalog`). It is an in-memory, async-safe singleton, mirroring the
cost ledger: nothing is persisted to the DB yet, which is fine for a workspace
that runs one API process. Swap the dict for a DB-backed repository later
without changing the public surface.

Call sites resolve a task's effective config with :meth:`AIConfigStore.resolve`,
which falls back to the catalog default for any field the admin hasn't set.
"""

from __future__ import annotations

import asyncio
from functools import lru_cache

from pydantic import BaseModel

from app.ai import catalog
from app.ai.catalog import CostMode, ReasoningEffort


class TaskConfig(BaseModel):
    """Effective configuration for one AI task."""

    task_id: str
    model: str
    effort: ReasoningEffort
    cost_mode: CostMode
    # Per-task output ceiling; None falls back to the global default.
    max_output_tokens: int | None = None


class TaskConfigUpdate(BaseModel):
    """Partial update from the admin UI. Only set fields are applied."""

    model: str | None = None
    effort: ReasoningEffort | None = None
    cost_mode: CostMode | None = None
    max_output_tokens: int | None = None


class ConfigValidationError(ValueError):
    """Raised when an update references an unknown task/model or an ineligible pick."""


class AIConfigStore:
    """In-memory, async-safe holder of per-task AI config overrides."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        # task_id -> TaskConfig. Seeded lazily from catalog defaults on read.
        self._overrides: dict[str, TaskConfig] = {}

    def _default(self, task_id: str) -> TaskConfig:
        task = catalog.TASKS[task_id]
        return TaskConfig(
            task_id=task_id,
            model=task.default_model,
            effort=task.default_effort,
            cost_mode=task.default_cost_mode,
            max_output_tokens=None,
        )

    def resolve(self, task_id: str) -> TaskConfig:
        """Effective config for a task: override if set, else catalog default.

        Synchronous so non-async call sites (the live client building a request)
        can read it without an event loop. Reads are atomic enough for a dict
        swap of immutable models.
        """
        if task_id not in catalog.TASKS:
            raise ConfigValidationError(f"unknown task: {task_id}")
        return self._overrides.get(task_id) or self._default(task_id)

    def all(self) -> list[TaskConfig]:
        """Effective config for every task, in catalog order."""
        return [self.resolve(tid) for tid in catalog.task_ids()]

    async def update(self, task_id: str, patch: TaskConfigUpdate) -> TaskConfig:
        """Apply a partial update after validating the picks against the catalog."""
        if task_id not in catalog.TASKS:
            raise ConfigValidationError(f"unknown task: {task_id}")
        task = catalog.TASKS[task_id]

        async with self._lock:
            current = self.resolve(task_id)
            model = patch.model if patch.model is not None else current.model
            effort = patch.effort if patch.effort is not None else current.effort
            cost_mode = patch.cost_mode if patch.cost_mode is not None else current.cost_mode
            max_out = (
                patch.max_output_tokens
                if patch.max_output_tokens is not None
                else current.max_output_tokens
            )

            if model not in catalog.MODELS:
                raise ConfigValidationError(f"unknown model: {model}")
            if model not in task.eligible_models:
                raise ConfigValidationError(
                    f"model {model} is not eligible for task {task_id}"
                )

            info = catalog.MODELS[model]
            if task.supports_effort and info.efforts and effort not in info.efforts:
                raise ConfigValidationError(
                    f"model {model} does not support effort '{effort.value}'"
                )
            if cost_mode not in info.cost_modes:
                raise ConfigValidationError(
                    f"model {model} does not support cost mode '{cost_mode.value}'"
                )
            if max_out is not None and max_out <= 0:
                raise ConfigValidationError("max_output_tokens must be positive")

            resolved = TaskConfig(
                task_id=task_id,
                model=model,
                effort=effort,
                cost_mode=cost_mode,
                max_output_tokens=max_out,
            )
            self._overrides[task_id] = resolved
            return resolved

    async def reset(self, task_id: str) -> TaskConfig:
        """Drop the override for a task, reverting it to the catalog default."""
        if task_id not in catalog.TASKS:
            raise ConfigValidationError(f"unknown task: {task_id}")
        async with self._lock:
            self._overrides.pop(task_id, None)
        return self.resolve(task_id)


@lru_cache
def get_ai_config_store() -> AIConfigStore:
    """Process-wide AI config store singleton."""
    return AIConfigStore()
