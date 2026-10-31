"""Billing / invoicing roll-up (what a county pays the contractor).

A load ticket is paid on the *credited* volume for its debris class. The amount
a county owes the contractor for a ticket is its **payable value**:

- when a monitor has made a call, the payable value is the monitor-called value
  (``monitor_dollar_value``) — that is the number the contractor bills on;
- before a monitor call exists (a draft), the payable value falls back to
  LoadTruth's machine estimate (``est_dollar_value``) so a draft still shows an
  expected amount.

Everything here is a pure, deterministic roll-up over the domain tickets. It
reuses the per-ticket dollars already computed by ``app.tickets.money`` and
never recomputes cubic yards or dollars.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.tickets.domain import Ticket
from app.tickets.schemas import TicketStatus

_ZERO = Decimal(0)

# Statuses whose amount is settled. Review-flagged and disputed amounts remain
# pending until a monitor resolves the issue.
_FINAL_STATUSES = frozenset({TicketStatus.CONFIRMED, TicketStatus.OVERRIDDEN})


def payable_dollars(ticket: Ticket) -> Decimal:
    """The amount the county owes the contractor for this ticket.

    Monitor-called value when a call exists, otherwise the machine estimate.
    """
    if ticket.monitor_dollar_value is not None:
        return ticket.monitor_dollar_value
    return ticket.est_dollar_value


def payable_cubic_yards(ticket: Ticket) -> Decimal:
    """Credited cubic yards for this ticket (monitor call, else estimate)."""
    if ticket.monitor_cubic_yards is not None:
        return ticket.monitor_cubic_yards
    return ticket.est_cubic_yards


@dataclass(frozen=True, slots=True)
class BillingLine:
    """One invoice line: all loads of a debris class, billed at that rate."""

    debris_class: str
    rate_per_cy: Decimal
    ticket_count: int
    cubic_yards: Decimal
    amount: Decimal


@dataclass(frozen=True, slots=True)
class BillingPeriod:
    """One bucket of the billing-history series (a calendar month)."""

    period: str  # "YYYY-MM"
    ticket_count: int
    amount: Decimal


@dataclass(frozen=True, slots=True)
class BillingSummary:
    """A county→contractor invoice roll-up for one or many events."""

    scope: str  # the event name, or "All events" for the combined invoice
    event_id: str | None
    location: str | None
    ticket_count: int
    billed_count: int  # tickets with a settled (confirmed/overridden) amount
    pending_count: int  # drafts/disputed billed at the expected amount
    total_cubic_yards: Decimal
    total_amount: Decimal
    settled_amount: Decimal
    pending_amount: Decimal
    lines: list[BillingLine] = field(default_factory=list)
    history: list[BillingPeriod] = field(default_factory=list)


def _rate_for(tickets: list[Ticket], debris_class: str) -> Decimal:
    """The per-CY rate charged for a debris class (from the tickets themselves)."""
    for t in tickets:
        if t.debris_class.value == debris_class:
            return t.rate_per_cy
    return _ZERO


def build_lines(tickets: list[Ticket]) -> list[BillingLine]:
    """Group tickets into one billing line per debris class, highest amount first."""
    counts: dict[str, int] = defaultdict(int)
    cy_by_class: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    amount_by_class: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    for t in tickets:
        k = t.debris_class.value
        counts[k] += 1
        cy_by_class[k] += payable_cubic_yards(t)
        amount_by_class[k] += payable_dollars(t)

    lines = [
        BillingLine(
            debris_class=k,
            rate_per_cy=_rate_for(tickets, k),
            ticket_count=counts[k],
            cubic_yards=cy_by_class[k],
            amount=amount_by_class[k],
        )
        for k in counts
    ]
    lines.sort(key=lambda line: line.amount, reverse=True)
    return lines


def build_history(tickets: list[Ticket]) -> list[BillingPeriod]:
    """Billed amount bucketed by calendar month, oldest first."""
    counts: dict[str, int] = defaultdict(int)
    amount: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    for t in tickets:
        d: date = t.created_at.date()
        key = f"{d.year:04d}-{d.month:02d}"
        counts[key] += 1
        amount[key] += payable_dollars(t)
    return [
        BillingPeriod(period=key, ticket_count=counts[key], amount=amount[key])
        for key in sorted(amount)
    ]


def build_summary(
    *,
    scope: str,
    event_id: str | None,
    location: str | None,
    tickets: list[Ticket],
) -> BillingSummary:
    """Assemble the full billing roll-up for a set of tickets."""
    total_amount = _ZERO
    settled_amount = _ZERO
    pending_amount = _ZERO
    total_cy = _ZERO
    billed_count = 0
    pending_count = 0
    for t in tickets:
        amount = payable_dollars(t)
        total_amount += amount
        total_cy += payable_cubic_yards(t)
        if t.status in _FINAL_STATUSES:
            settled_amount += amount
            billed_count += 1
        else:
            pending_amount += amount
            pending_count += 1
    return BillingSummary(
        scope=scope,
        event_id=event_id,
        location=location,
        ticket_count=len(tickets),
        billed_count=billed_count,
        pending_count=pending_count,
        total_cubic_yards=total_cy,
        total_amount=total_amount,
        settled_amount=settled_amount,
        pending_amount=pending_amount,
        lines=build_lines(tickets),
        history=build_history(tickets),
    )
