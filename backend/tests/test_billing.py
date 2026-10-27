"""Unit tests for the billing roll-up (what a county owes the contractor)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from app.tickets.billing import (
    build_history,
    build_lines,
    build_summary,
    payable_cubic_yards,
    payable_dollars,
)
from app.tickets.domain import Ticket, new_ticket
from app.tickets.schemas import DebrisClass, TicketStatus

_TENANT = uuid4()
_EVENT = uuid4()


def _ticket(
    *,
    debris: DebrisClass = DebrisClass.CONSTRUCTION_DEMOLITION,
    cap: str = "30",
    rate: str = "12",
    est: str = "80",
    monitor: str | None = None,
    status: TicketStatus = TicketStatus.DRAFT,
    created: datetime | None = None,
) -> Ticket:
    t = new_ticket(
        tenant_id=_TENANT,
        event_id=_EVENT,
        debris_class=debris,
        certified_cubic_yards=cap,
        rate_per_cy=rate,
        est_fill_pct=est,
        monitor_call_fill_pct=monitor,
        truck_id="FL-DT-0001",
    )
    t.status = status
    if created is not None:
        t.created_at = created
    return t


def test_payable_prefers_monitor_call() -> None:
    # 30 CY cap * 90% * $12 = $324.00 (monitor), estimate would be 80% → $288.
    t = _ticket(est="80", monitor="90")
    assert payable_dollars(t) == Decimal("324.00")
    assert payable_cubic_yards(t) == Decimal("27.000")


def test_payable_falls_back_to_estimate_for_draft() -> None:
    # No monitor call: 30 * 80% * $12 = $288.00.
    t = _ticket(est="80", monitor=None)
    assert payable_dollars(t) == Decimal("288.00")
    assert payable_cubic_yards(t) == Decimal("24.000")


def test_lines_group_by_debris_class_sorted_by_amount() -> None:
    tickets = [
        _ticket(debris=DebrisClass.VEGETATIVE, cap="40", rate="8", est="50"),  # 160
        _ticket(debris=DebrisClass.CONSTRUCTION_DEMOLITION, cap="30", rate="12", est="100"),  # 360
        _ticket(debris=DebrisClass.VEGETATIVE, cap="40", rate="8", est="50"),  # 160
    ]
    lines = build_lines(tickets)
    assert [line.debris_class for line in lines] == [
        "construction_demolition",
        "vegetative",
    ]
    cd = lines[0]
    assert cd.ticket_count == 1
    assert cd.amount == Decimal("360.00")
    veg = lines[1]
    assert veg.ticket_count == 2
    assert veg.amount == Decimal("320.00")
    assert veg.rate_per_cy == Decimal("8")


def test_history_buckets_by_month_oldest_first() -> None:
    tickets = [
        _ticket(est="50", cap="20", rate="10", created=datetime(2026, 1, 15, tzinfo=UTC)),  # 100
        _ticket(est="50", cap="20", rate="10", created=datetime(2026, 3, 2, tzinfo=UTC)),  # 100
        _ticket(est="25", cap="20", rate="10", created=datetime(2026, 3, 20, tzinfo=UTC)),  # 50
    ]
    history = build_history(tickets)
    assert [p.period for p in history] == ["2026-01", "2026-03"]
    assert history[0].amount == Decimal("100.00")
    assert history[1].ticket_count == 2
    assert history[1].amount == Decimal("150.00")


def test_summary_splits_settled_and_pending() -> None:
    tickets = [
        _ticket(est="80", monitor="90", status=TicketStatus.CONFIRMED),  # settled 324
        _ticket(est="80", monitor="80", status=TicketStatus.OVERRIDDEN),  # settled 288
        _ticket(est="50", status=TicketStatus.DRAFT),  # pending 180
    ]
    s = build_summary(scope="Hurricane Demo", event_id=str(_EVENT), location="FL", tickets=tickets)
    assert s.ticket_count == 3
    assert s.billed_count == 2
    assert s.pending_count == 1
    assert s.settled_amount == Decimal("612.00")
    assert s.pending_amount == Decimal("180.00")
    assert s.total_amount == Decimal("792.00")
    assert s.scope == "Hurricane Demo"
    assert s.location == "FL"


def test_empty_summary_is_zero() -> None:
    s = build_summary(scope="All events", event_id=None, location=None, tickets=[])
    assert s.total_amount == Decimal(0)
    assert s.lines == []
    assert s.history == []
    assert s.ticket_count == 0
