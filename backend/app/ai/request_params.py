"""Economical request parameters for each Meta model call.

Every LLM query to Meta is shaped here so cost is controlled in one place rather
than scattered across call sites. It combines three levers the Meta API exposes
(dev.meta.ai/docs): the **model**, the **reasoning effort** (`reasoning.effort`
— more effort = more reasoning tokens = more cost), and a **max output token**
cap (output is billed at the highest rate, $4.25/1M, so capping it is the
cheapest win). The per-task model/effort/cost-mode come from the admin-tunable
`AIConfigStore`; the output cap falls back to a task-appropriate default from
settings so a perception call never emits a paragraph and the analyst never
emits a page.

Pure and synchronous — builds a dict of request kwargs; it does not call Meta.
The live client spreads these into its `/responses` request; the mock ignores
them (it keys off the content hash).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.ai.catalog import CostMode, ReasoningEffort
from app.ai.config_store import get_ai_config_store
from app.config import get_settings

# Per-task fallback output caps (used when the admin hasn't set an explicit one).
# Perception tasks return a word or two; narration one line; the analyst a short
# paragraph. None of them should ever use the 4000-token global default.
_PERCEPTION_TASKS = frozenset({"spark_ocr", "spark_classify", "name_load"})


@dataclass(frozen=True, slots=True)
class SparkRequestParams:
    """The economical knobs for one Spark (`/responses`) call."""

    model: str
    effort: ReasoningEffort
    cost_mode: CostMode
    max_output_tokens: int

    def as_request_kwargs(self) -> dict[str, object]:
        """Shape the knobs into Meta `/responses` request fields."""
        return {
            "model": self.model,
            "reasoning": {"effort": wire_effort(self.effort)},
            "max_output_tokens": self.max_output_tokens,
        }


# The admin UI calls the middle level "balanced"; the API names it "medium"
# (dev.meta.ai/docs/reasoning accepts minimal, low, medium, high, xhigh, max).
_WIRE_EFFORT = {ReasoningEffort.BALANCED: "medium"}


def wire_effort(effort: ReasoningEffort) -> str:
    """The `reasoning.effort` value Meta accepts for an admin effort level."""
    return _WIRE_EFFORT.get(effort, effort.value)


def _default_output_cap(task_id: str) -> int:
    s = get_settings()
    if task_id in _PERCEPTION_TASKS:
        return s.spark_perception_max_output_tokens
    if task_id == "narrate_anomaly":
        return s.spark_narrate_max_output_tokens
    if task_id == "analyst_chat":
        return s.analyst_max_output_tokens
    if task_id == "explain_pipeline":
        return s.spark_explain_max_output_tokens
    return s.spark_max_output_tokens


def params_for(task_id: str) -> SparkRequestParams:
    """Resolve the economical request parameters for a Spark task.

    Reads the admin's per-task config (model/effort/cost-mode/output cap) and
    fills a task-appropriate output cap when the admin left it unset.
    """
    cfg = get_ai_config_store().resolve(task_id)
    max_out = (
        cfg.max_output_tokens if cfg.max_output_tokens is not None else _default_output_cap(task_id)
    )
    return SparkRequestParams(
        model=cfg.model,
        effort=cfg.effort,
        cost_mode=cfg.cost_mode,
        max_output_tokens=max_out,
    )
