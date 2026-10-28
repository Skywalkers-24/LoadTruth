"""Catalog of Meta Model API models, reasoning-effort levels, and AI tasks.

This is the single source of truth the admin "AI & Models" settings UI reads
from. It describes:

* which models exist, what they cost, and what they're good for,
* the reasoning-effort levels a model can run at (minimal → max), and the
  "cost mode" a task can run in (standard vs. contributor), and
* the distinct AI *tasks* the pipeline performs, each with a recommended model
  + effort so an admin can tune capability vs. spend per task.

Pricing and capabilities are pasted from the Meta Model API docs (models +
pricing-and-rate-limits pages) and mirror ``models_cost.yaml`` at the repo root.
Keeping it in code (not just YAML) lets the API return a typed, versioned
catalog the frontend can render without re-parsing YAML.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class ReasoningEffort(StrEnum):
    """How hard a reasoning model thinks before answering.

    Higher effort spends more tokens (and money) for better quality on hard
    tasks; lower effort is cheaper and faster for simple, high-volume calls.
    Mirrors the Meta Model API ``reasoning_effort`` request parameter.
    """

    MINIMAL = "minimal"
    LOW = "low"
    BALANCED = "balanced"
    HIGH = "high"
    MAX = "max"


class CostMode(StrEnum):
    """Billing/data mode for a model call.

    ``standard`` — standard price, your content is never used for training.
    ``contributor`` — heavily discounted price in exchange for letting Meta use
    your prompts/outputs to train future models. Only some models offer it, and
    it's rate-limited; not for sensitive data.
    """

    STANDARD = "standard"
    CONTRIBUTOR = "contributor"


class ModelPricing(BaseModel):
    """Per-1M-token prices (USD). ``None`` for non-token-billed/self-hosted."""

    input: float | None = None
    cached_input: float | None = None
    output: float | None = None
    # Human unit label for anything not billed per 1M tokens (image/audio/etc).
    unit: str = "per_1m_tokens"


class ModelInfo(BaseModel):
    """One selectable model and its capabilities/price."""

    id: str
    name: str
    kind: str  # chat | segmentation | image_generation | audio
    context_tokens: int | None = None
    modalities: list[str]
    description: str
    # Reasoning-effort levels this model supports, cheapest-first. Empty for
    # non-reasoning models (segmentation/image/audio).
    efforts: list[ReasoningEffort] = []
    cost_modes: list[CostMode] = [CostMode.STANDARD]
    pricing: ModelPricing | None = None
    # True for frontier/most-capable models; UI can flag the spend.
    premium: bool = False
    available: bool = True  # False for self-hosted/subscription-only on the API


class TaskInfo(BaseModel):
    """A distinct AI call the pipeline makes, with tunable model + effort.

    ``id`` matches the pipeline stage / ``AIClient`` method so the resolved
    config can be looked up at the call site.
    """

    id: str
    name: str
    description: str
    kind: str  # chat | segmentation — constrains which models are eligible
    # Models the admin may pick for this task (ids into MODELS).
    eligible_models: list[str]
    # Sensible defaults balancing capability vs. cost.
    default_model: str
    default_effort: ReasoningEffort
    default_cost_mode: CostMode = CostMode.STANDARD
    supports_effort: bool = True


# ── Models ────────────────────────────────────────────────────────────────

_ALL_EFFORTS = [
    ReasoningEffort.MINIMAL,
    ReasoningEffort.LOW,
    ReasoningEffort.BALANCED,
    ReasoningEffort.HIGH,
    ReasoningEffort.MAX,
]

MODELS: dict[str, ModelInfo] = {
    "muse-wonder-1.0": ModelInfo(
        id="muse-wonder-1.0",
        name="Muse Wonder",
        kind="chat",
        context_tokens=1_048_576,
        modalities=["text", "image", "video", "audio", "pdf"],
        description=(
            "Meta's most capable model. Long-horizon agentic work and complex, "
            "multi-file coding. Best when capability matters more than cost."
        ),
        efforts=_ALL_EFFORTS,
        cost_modes=[CostMode.STANDARD],
        pricing=ModelPricing(input=4.00, cached_input=0.20, output=20.00),
        premium=True,
    ),
    "muse-spark-1.3": ModelInfo(
        id="muse-spark-1.3",
        name="Muse Spark 1.3",
        kind="chat",
        context_tokens=1_048_576,
        modalities=["text", "image", "video", "audio", "pdf"],
        description=(
            "Latest Spark. Tuned for agentic workflows and coding, with the "
            "'max' effort level. Recommended default for cost-sensitive work."
        ),
        efforts=_ALL_EFFORTS,
        cost_modes=[CostMode.STANDARD, CostMode.CONTRIBUTOR],
        pricing=ModelPricing(input=1.25, cached_input=0.15, output=4.25),
    ),
    "muse-spark-1.3-contributor": ModelInfo(
        id="muse-spark-1.3-contributor",
        name="Muse Spark 1.3 (Contributor)",
        kind="chat",
        context_tokens=1_048_576,
        modalities=["text", "image", "video", "audio", "pdf"],
        description=(
            "Same model as Spark 1.3 at ~90% lower token prices. Meta may use "
            "your content to train future models. Rate-limited. No 'max' effort."
        ),
        # Contributor variant doesn't offer the 'max' extended-reasoning level.
        efforts=[
            ReasoningEffort.MINIMAL,
            ReasoningEffort.LOW,
            ReasoningEffort.BALANCED,
            ReasoningEffort.HIGH,
        ],
        cost_modes=[CostMode.CONTRIBUTOR],
        pricing=ModelPricing(input=0.10, cached_input=0.002, output=0.20),
    ),
    "muse-spark-1.2": ModelInfo(
        id="muse-spark-1.2",
        name="Muse Spark 1.2",
        kind="chat",
        context_tokens=1_048_576,
        modalities=["text", "image", "video", "audio", "pdf"],
        description="Previous Spark version. Coding-optimized, 1M context.",
        efforts=_ALL_EFFORTS,
        cost_modes=[CostMode.STANDARD, CostMode.CONTRIBUTOR],
        pricing=ModelPricing(input=1.25, cached_input=0.15, output=4.25),
    ),
    "muse-spark-1.1": ModelInfo(
        id="muse-spark-1.1",
        name="Muse Spark 1.1",
        kind="chat",
        context_tokens=1_048_576,
        modalities=["text", "image", "video", "pdf"],
        description="Original Spark. Multimodal perception, coding, computer use.",
        efforts=_ALL_EFFORTS,
        cost_modes=[CostMode.STANDARD],
        pricing=ModelPricing(input=1.25, cached_input=0.15, output=4.25),
    ),
    "sam-3.1": ModelInfo(
        id="sam-3.1",
        name="SAM 3.1",
        kind="segmentation",
        modalities=["text", "image", "video"],
        description=(
            "Segment Anything 3.1. Detect, segment, and track objects from a "
            "text prompt across image frames. Powers the vision/counting stage."
        ),
        efforts=[],
        cost_modes=[CostMode.STANDARD],
        pricing=ModelPricing(output=2.50, unit="per_1k_images"),
    ),
}


# ── Tasks ───────────────────────────────────────────────────────────────────

# Each task id matches the pipeline stage / AIClient method it configures.
TASKS: dict[str, TaskInfo] = {
    "sam_track": TaskInfo(
        id="sam_track",
        name="Vision: track & count",
        description=(
            "SAM segments and tracks the truck, bed, debris pile, and placard "
            "across frames. The core measurement step."
        ),
        kind="segmentation",
        eligible_models=["sam-3.1"],
        default_model="sam-3.1",
        default_effort=ReasoningEffort.BALANCED,
        supports_effort=False,
    ),
    "spark_ocr": TaskInfo(
        id="spark_ocr",
        name="Placard OCR",
        description="Read the truck's placard / ID from the clearest frame.",
        kind="chat",
        eligible_models=[
            "muse-spark-1.3",
            "muse-spark-1.3-contributor",
            "muse-spark-1.2",
            "muse-spark-1.1",
            "muse-wonder-1.0",
        ],
        default_model="muse-spark-1.3",
        # OCR is a narrow perception task — minimal reasoning is plenty.
        default_effort=ReasoningEffort.LOW,
    ),
    "spark_classify": TaskInfo(
        id="spark_classify",
        name="Debris classification",
        description=(
            "Classify the load (vegetative / C&D / white goods / hazardous / "
            "other). Drives the $/CY rate applied to the ticket."
        ),
        kind="chat",
        eligible_models=[
            "muse-spark-1.3",
            "muse-spark-1.3-contributor",
            "muse-spark-1.2",
            "muse-spark-1.1",
            "muse-wonder-1.0",
        ],
        default_model="muse-spark-1.3",
        default_effort=ReasoningEffort.BALANCED,
    ),
    "narrate_anomaly": TaskInfo(
        id="narrate_anomaly",
        name="Anomaly narration",
        description=(
            "One-line human explanation for a flag the deterministic rules "
            "raised. Short output, low stakes — keep it cheap."
        ),
        kind="chat",
        eligible_models=[
            "muse-spark-1.3",
            "muse-spark-1.3-contributor",
            "muse-spark-1.2",
        ],
        default_model="muse-spark-1.3",
        default_effort=ReasoningEffort.MINIMAL,
    ),
    "explain_pipeline": TaskInfo(
        id="explain_pipeline",
        name="Pipeline stage analysis",
        description=(
            "One batched call that authors the plain-language 'AI analysis' "
            "paragraph shown beside each pipeline stage on the console, grounded "
            "in the run's measured facts. Text only, so it stays cheap."
        ),
        kind="chat",
        eligible_models=[
            "muse-spark-1.3",
            "muse-spark-1.3-contributor",
            "muse-spark-1.2",
        ],
        default_model="muse-spark-1.3",
        default_effort=ReasoningEffort.LOW,
    ),
    "analyst_chat": TaskInfo(
        id="analyst_chat",
        name="AI analyst chat",
        description=(
            "Answers operator questions over the event's evidence with "
            "tool-calling. Benefits from stronger reasoning on hard questions."
        ),
        kind="chat",
        eligible_models=[
            "muse-wonder-1.0",
            "muse-spark-1.3",
            "muse-spark-1.3-contributor",
            "muse-spark-1.2",
        ],
        default_model="muse-spark-1.3",
        default_effort=ReasoningEffort.BALANCED,
    ),
}


def task_ids() -> list[str]:
    return list(TASKS.keys())
