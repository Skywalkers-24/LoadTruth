"""Tests for the cost ledger + budget status (app.pipeline.ledger)."""

import pytest

from app.config import get_settings
from app.pipeline.ledger import CostLedger, budget_status


@pytest.mark.asyncio
async def test_record_and_summarize() -> None:
    ledger = CostLedger()
    await ledger.record_run(stage="sam_track", model="sam-3.1", cost_usd=0.0, cached=False)
    await ledger.record_run(stage="geometry", model="deterministic", cost_usd=0.0, cached=False)
    await ledger.record_run(
        stage="spark_ocr", model="muse-spark-1.3", tokens_in=100, tokens_out=50, cost_usd=0.0
    )

    summary = ledger.summarize()
    assert summary.total_runs == 3
    assert summary.total_cost_usd == 0.0
    assert summary.total_tokens_in == 100
    assert summary.total_tokens_out == 50
    assert summary.per_stage == {"sam_track": 1, "geometry": 1, "spark_ocr": 1}


@pytest.mark.asyncio
async def test_cache_hit_rate() -> None:
    ledger = CostLedger()
    await ledger.record_run(stage="sam_track", model="sam-3.1", cached=True)
    await ledger.record_run(stage="spark_ocr", model="muse-spark-1.3", cached=True)
    await ledger.record_run(stage="geometry", model="deterministic", cached=False)

    summary = ledger.summarize()
    assert summary.cache_hits == 2
    assert summary.cache_hit_rate == pytest.approx(0.6667, abs=1e-4)


def test_empty_summary_has_zero_hit_rate() -> None:
    assert CostLedger().summarize().cache_hit_rate == 0.0


def test_budget_status_under_caps() -> None:
    settings = get_settings()
    status = budget_status(0.0)
    assert status.hard_cap_usd == settings.build_spend_cap_usd
    assert status.warn_cap_usd == settings.spend_warn_usd
    assert status.remaining_usd == settings.build_spend_cap_usd
    assert not status.soft_cap_hit
    assert not status.hard_cap_hit


def test_budget_status_soft_cap_hit() -> None:
    status = budget_status(get_settings().spend_warn_usd + 0.01)
    assert status.soft_cap_hit
    assert not status.hard_cap_hit


def test_budget_status_hard_cap_hit() -> None:
    status = budget_status(get_settings().build_spend_cap_usd + 1.0)
    assert status.soft_cap_hit
    assert status.hard_cap_hit
    assert status.remaining_usd < 0


@pytest.mark.asyncio
async def test_ledger_budget_status_reads_total() -> None:
    ledger = CostLedger()
    await ledger.record_run(stage="sam_track", model="sam-3.1", cost_usd=5.0)
    assert ledger.budget_status().spent_usd == 5.0
