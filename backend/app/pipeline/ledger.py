"""Cost ledger — the $150-budget accounting for every pipeline run (protocol §9).

Every stage records a row: which model it used, tokens in/out, latency, dollar
cost, and whether it was a cache hit. Deterministic stages and mock-AI replays
cost $0, so the ledger is still useful off the credit path (it proves the cache
hit rate and per-stage counts a dashboard will later show).

The in-memory ledger is async-safe (a lock guards the row list) so parallel
workers never lose a row. :func:`summarize` rolls the rows up, and
:func:`budget_status` reads the spend caps from config so a caller can refuse a
run once the hard cap is hit. A future dashboard endpoint reads these summaries;
nothing here persists to the DB yet (that is `pipeline_runs`, deferred).
"""

from __future__ import annotations

import asyncio
from collections import Counter
from dataclasses import dataclass

from app.config import get_settings


@dataclass(frozen=True, slots=True)
class LedgerRow:
    """One accounted unit of work (one stage of one clip run)."""

    stage: str
    model: str
    tokens_in: int
    tokens_out: int
    latency_ms: float
    cost_usd: float
    cached: bool


@dataclass(frozen=True, slots=True)
class LedgerSummary:
    """Aggregate view of the ledger for a dashboard / budget check."""

    total_runs: int
    total_cost_usd: float
    total_tokens_in: int
    total_tokens_out: int
    cache_hits: int
    cache_hit_rate: float
    per_stage: dict[str, int]


@dataclass(frozen=True, slots=True)
class BudgetStatus:
    """Where spend sits against the configured soft/hard caps (PLAN.md §5a)."""

    spent_usd: float
    warn_cap_usd: float
    hard_cap_usd: float
    remaining_usd: float
    soft_cap_hit: bool
    hard_cap_hit: bool


class CostLedger:
    """Async-safe, in-memory ledger of pipeline runs."""

    def __init__(self) -> None:
        self._rows: list[LedgerRow] = []
        self._lock = asyncio.Lock()

    async def record_run(
        self,
        *,
        stage: str,
        model: str,
        tokens_in: int = 0,
        tokens_out: int = 0,
        latency_ms: float = 0.0,
        cost_usd: float = 0.0,
        cached: bool = False,
    ) -> LedgerRow:
        """Record one stage's cost. Deterministic/mock stages pass ``cost_usd=0``."""
        row = LedgerRow(
            stage=stage,
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            latency_ms=latency_ms,
            cost_usd=cost_usd,
            cached=cached,
        )
        async with self._lock:
            self._rows.append(row)
        return row

    async def rows(self) -> list[LedgerRow]:
        async with self._lock:
            return list(self._rows)

    def summarize(self) -> LedgerSummary:
        """Roll the rows up (total spend, cache hit rate, per-stage counts)."""
        rows = self._rows
        total = len(rows)
        cache_hits = sum(1 for r in rows if r.cached)
        per_stage: Counter[str] = Counter(r.stage for r in rows)
        return LedgerSummary(
            total_runs=total,
            total_cost_usd=round(sum(r.cost_usd for r in rows), 6),
            total_tokens_in=sum(r.tokens_in for r in rows),
            total_tokens_out=sum(r.tokens_out for r in rows),
            cache_hits=cache_hits,
            cache_hit_rate=round(cache_hits / total, 4) if total else 0.0,
            per_stage=dict(per_stage),
        )

    def budget_status(self) -> BudgetStatus:
        """Report remaining budget and whether the soft/hard cap is hit."""
        return budget_status(self.summarize().total_cost_usd)


def budget_status(spent_usd: float) -> BudgetStatus:
    """Compute budget headroom from spend against the configured caps.

    ``spend_warn_usd`` is the soft cap (warn, keep going); ``build_spend_cap_usd``
    is the hard cap (stop spending). Exposed standalone so a caller with a running
    total that is not in this ledger can still check the budget.
    """
    settings = get_settings()
    warn = settings.spend_warn_usd
    hard = settings.build_spend_cap_usd
    return BudgetStatus(
        spent_usd=round(spent_usd, 6),
        warn_cap_usd=warn,
        hard_cap_usd=hard,
        remaining_usd=round(hard - spent_usd, 6),
        soft_cap_hit=spent_usd >= warn,
        hard_cap_hit=spent_usd >= hard,
    )
