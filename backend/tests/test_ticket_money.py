"""Tests for the deterministic load-ticket money math (PLAN.md §7a).

Covers the four arithmetic paths the plan calls out — over-call, under-call,
exact agreement, and the zero-rate / missing-capacity edges — plus the worked
demo example and the draft (no monitor call) case. No DB, no API, no credits.
"""

from decimal import Decimal

import pytest

from app.tickets.money import cubic_yards, dollar_value, value_ticket
from app.tickets.schemas import build_valuation


def test_demo_example_overbill() -> None:
    """The exact worked example from PLAN.md §7a: 20 CY, 80% vs 62%, $12/CY."""
    v = value_ticket(
        certified_cubic_yards=20,
        rate_per_cy=12,
        est_fill_pct=62,
        monitor_fill_pct=80,
    )
    assert v.est_cubic_yards == Decimal("12.400")
    assert v.est_dollar_value == Decimal("148.80")
    assert v.monitor_cubic_yards == Decimal("16.000")
    assert v.monitor_dollar_value == Decimal("192.00")
    assert v.delta_cubic_yards == Decimal("3.600")
    assert v.delta_dollar_value == Decimal("43.20")
    assert v.is_overbill is True


def test_under_call_is_negative_delta() -> None:
    """Monitor calls lower than LoadTruth measured → negative delta, not overbill."""
    v = value_ticket(certified_cubic_yards=20, rate_per_cy=12, est_fill_pct=80, monitor_fill_pct=62)
    assert v.delta_dollar_value == Decimal("-43.20")
    assert v.is_overbill is False


def test_exact_agreement_zero_delta() -> None:
    v = value_ticket(certified_cubic_yards=20, rate_per_cy=12, est_fill_pct=70, monitor_fill_pct=70)
    assert v.delta_cubic_yards == Decimal("0.000")
    assert v.delta_dollar_value == Decimal("0.00")
    assert v.is_overbill is False


def test_zero_rate_yields_zero_dollars_but_real_volume() -> None:
    """A missing/zero rate must not crash; dollars are zero, volume still computed."""
    v = value_ticket(certified_cubic_yards=20, rate_per_cy=0, est_fill_pct=80, monitor_fill_pct=90)
    assert v.est_cubic_yards == Decimal("16.000")
    assert v.est_dollar_value == Decimal("0.00")
    assert v.delta_dollar_value == Decimal("0.00")
    assert v.delta_cubic_yards == Decimal("2.000")


def test_zero_capacity_yields_zero_everything() -> None:
    v = value_ticket(certified_cubic_yards=0, rate_per_cy=12, est_fill_pct=80, monitor_fill_pct=90)
    assert v.est_cubic_yards == Decimal("0.000")
    assert v.monitor_cubic_yards == Decimal("0.000")
    assert v.delta_dollar_value == Decimal("0.00")


def test_draft_has_no_monitor_call_or_delta() -> None:
    """A draft ticket has only the machine estimate; monitor/delta are None."""
    v = value_ticket(certified_cubic_yards=20, rate_per_cy=12, est_fill_pct=62)
    assert v.est_dollar_value == Decimal("148.80")
    assert v.monitor_fill_pct is None
    assert v.monitor_dollar_value is None
    assert v.delta_dollar_value is None
    assert v.is_overbill is False


def test_rounding_is_half_up_to_the_cent() -> None:
    # 10 CY * 33.333% = 3.3333 CY -> quantized to 3.333; * $3.015 = 10.0489... -> 10.05
    v = value_ticket(
        certified_cubic_yards=10,
        rate_per_cy="3.015",
        est_fill_pct="33.333",
        monitor_fill_pct="33.333",
    )
    assert v.est_cubic_yards == Decimal("3.333")
    assert v.est_dollar_value == Decimal("10.05")


def test_float_inputs_do_not_leak_binary_noise() -> None:
    v = value_ticket(certified_cubic_yards=20.0, rate_per_cy=12.0, est_fill_pct=62.0)
    assert v.est_dollar_value == Decimal("148.80")


@pytest.mark.parametrize("bad_pct", [-1, 100.01, 150])
def test_fill_pct_out_of_range_rejected(bad_pct: float) -> None:
    with pytest.raises(ValueError, match="fill_pct"):
        cubic_yards(20, bad_pct)


def test_negative_capacity_rejected() -> None:
    with pytest.raises(ValueError, match="certified_cubic_yards"):
        cubic_yards(-1, 50)


def test_negative_rate_rejected() -> None:
    with pytest.raises(ValueError, match="rate_per_cy"):
        dollar_value(10, -1)


def test_schema_bridge_matches_core_math() -> None:
    """The API ValuationOut mirrors the core valuation exactly."""
    out = build_valuation(
        certified_cubic_yards=20,
        rate_per_cy=12,
        est_fill_pct=62,
        monitor_fill_pct=80,
    )
    assert out.delta_dollar_value == Decimal("43.20")
    assert out.is_overbill is True
