"""Tests for the in-process ticket/event domain records (app.tickets.domain).

Pure, DB-free: these verify the dollar-delta math (PLAN.md §7a) flows correctly
through ticket creation and the review-time monitor call — the number the demo
puts on screen. Exact-decimal assertions guard against float drift.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from app.tickets.domain import Event, Ticket, new_ticket
from app.tickets.schemas import DebrisClass, TicketStatus


def test_event_rate_for_known_and_unknown_class() -> None:
    event = Event(
        tenant_id=uuid4(),
        name="Hurricane 2026 — Pinellas",
        rate_table={"vegetative": 8, "construction_demolition": 12.5},
    )
    assert event.rate_for(DebrisClass.VEGETATIVE) == Decimal("8")
    assert event.rate_for(DebrisClass.CONSTRUCTION_DEMOLITION) == Decimal("12.5")
    # Unknown class falls back to 0 (no silent guesswork).
    assert event.rate_for(DebrisClass.WHITE_GOODS) == Decimal("0")
    # String key works the same as the enum.
    assert event.rate_for("vegetative") == Decimal("8")


def test_new_ticket_computes_estimate_only_by_default() -> None:
    t = new_ticket(
        tenant_id=uuid4(),
        event_id=uuid4(),
        debris_class=DebrisClass.VEGETATIVE,
        certified_cubic_yards="20",
        rate_per_cy="8",
        est_fill_pct="75",
    )
    # 20 CY * 75% = 15 CY; 15 * $8 = $120.
    assert t.est_cubic_yards == Decimal("15.000")
    assert t.est_dollar_value == Decimal("120.00")
    # No monitor call yet → delta fields unset, status draft, not an overbill.
    assert t.monitor_call_fill_pct is None
    assert t.delta_dollar_value is None
    assert t.status is TicketStatus.DRAFT
    assert t.is_overbill is False


def test_new_ticket_with_monitor_call_computes_overbill_delta() -> None:
    t = new_ticket(
        tenant_id=uuid4(),
        event_id=uuid4(),
        debris_class=DebrisClass.CONSTRUCTION_DEMOLITION,
        certified_cubic_yards="20",
        rate_per_cy="10",
        est_fill_pct="50",  # LoadTruth: 10 CY = $100
        monitor_call_fill_pct="90",  # monitor:   18 CY = $180
    )
    assert t.est_dollar_value == Decimal("100.00")
    assert t.monitor_dollar_value == Decimal("180.00")
    # delta = monitor - LoadTruth = +$80 → overbilling (the money story).
    assert t.delta_dollar_value == Decimal("80.00")
    assert t.is_overbill is True


def test_apply_monitor_call_updates_delta_in_place() -> None:
    t = new_ticket(
        tenant_id=uuid4(),
        event_id=uuid4(),
        debris_class=DebrisClass.VEGETATIVE,
        certified_cubic_yards="30",
        rate_per_cy="8",
        est_fill_pct="40",  # LoadTruth: 12 CY = $96
    )
    assert t.delta_dollar_value is None
    t.apply_monitor_call(Decimal("30"))  # monitor: 9 CY = $72
    # delta = 72 - 96 = -$24 → monitor under-called, not an overbill.
    assert t.monitor_dollar_value == Decimal("72.00")
    assert t.delta_dollar_value == Decimal("-24.00")
    assert t.is_overbill is False


def test_ticket_defaults() -> None:
    t = Ticket(
        tenant_id=uuid4(),
        event_id=uuid4(),
        debris_class=DebrisClass.OTHER,
        certified_cubic_yards=Decimal("10"),
        rate_per_cy=Decimal("5"),
        est_fill_pct=Decimal("10"),
        est_cubic_yards=Decimal("1.000"),
        est_dollar_value=Decimal("5.00"),
    )
    assert t.evidence_frames == []
    assert t.anomaly_count == 0
    assert t.status is TicketStatus.DRAFT
