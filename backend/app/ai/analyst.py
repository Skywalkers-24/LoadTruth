"""Grounded analyst tools (PLAN.md §6).

The AI analyst is read-only and answers only from the tenant's own data. These
tool functions run tenant-scoped queries through the repository and return plain
dict "evidence" that the model (mock or live Muse Spark) turns into prose. The
mock composes a deterministic, data-true answer from the same evidence, so no
figure is ever invented.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID

from app.tickets.domain import Ticket as DomainTicket
from app.tickets.repository import SqlTicketRepository
from app.tickets.schemas import TicketStatus


def _f(d: Decimal | None) -> float:
    return float(d or 0)


@dataclass(slots=True)
class ToolResult:
    """One tool call: the name, the arguments, and the evidence it returned."""

    tool: str
    args: dict[str, object] = field(default_factory=dict)
    evidence: dict[str, object] = field(default_factory=dict)


class AnalystTools:
    """The read-only toolset the analyst can call, bound to one tenant + event."""

    def __init__(self, repo: SqlTicketRepository, tenant_id: UUID, event_id: UUID) -> None:
        self._repo = repo
        self._tenant = tenant_id
        self._event = event_id

    async def event_summary(self) -> ToolResult:
        """Totals for the active event: tickets, reviewed, flagged exposure."""
        s = await self._repo.reports_summary(self._tenant, self._event)
        evidence: dict[str, object] = {
            "ticket_count": s.ticket_count,
            "reviewed_count": s.reviewed_count,
            "pending_count": s.ticket_count - s.reviewed_count,
            "measured_value": round(_f(s.total_est_dollar_value), 2),
            "flagged_exposure": round(_f(s.overbill_dollar_value), 2),
            "overbill_ticket_count": s.overbill_ticket_count,
            "counts_by_status": dict(s.counts_by_status),
            "disputed": s.counts_by_status.get("disputed", 0),
        }
        return ToolResult("event_summary", {}, evidence)

    async def accuracy_stats(self) -> ToolResult:
        """Monitor-agreement rate (within 10 points) and review progress."""
        d = await self._repo.dashboard(self._tenant, self._event)
        evidence: dict[str, object] = {
            "accuracy_within_10pct": d.accuracy_within_10pct,
            "reviewed_count": d.reviewed_count,
            "ticket_count": d.ticket_count,
            "anomaly_count": d.anomaly_count,
        }
        return ToolResult("accuracy_stats", {}, evidence)

    async def query_tickets(
        self,
        *,
        status: str | None = None,
        overbill_only: bool = False,
        limit: int = 5,
    ) -> ToolResult:
        """Top tickets by flagged dollar delta, optionally filtered by status."""
        tickets = await self._repo.list_tickets(self._tenant, self._event)
        rows = tickets
        if status:
            rows = [t for t in rows if t.status.value == status]
        if overbill_only:
            rows = [t for t in rows if t.is_overbill]
        rows = sorted(rows, key=lambda t: _f(t.delta_dollar_value), reverse=True)[:limit]
        items: list[dict[str, object]] = [
            {
                "ticket": f"LT-{str(t.id).replace('-', '')[:6].upper()}",
                "truck_id": t.truck_id,
                "debris_class": t.debris_class.value,
                "status": t.status.value,
                "measured_value": round(_f(t.est_dollar_value), 2),
                "delta": (
                    round(_f(t.delta_dollar_value), 2) if t.delta_dollar_value is not None else None
                ),
            }
            for t in rows
        ]
        return ToolResult(
            "query_tickets",
            {"status": status, "overbill_only": overbill_only, "limit": limit},
            {"matched": len(items), "tickets": items},
        )

    async def query_anomalies(self) -> ToolResult:
        """Anomaly counts by severity for the event."""
        counts = await self._repo._anomaly_severity_counts(self._tenant, self._event)  # noqa: SLF001
        total = sum(counts.values())
        return ToolResult(
            "query_anomalies",
            {},
            {"total": total, "by_severity": counts},
        )

    async def disputes(self) -> ToolResult:
        """Open disputes in the event (status = disputed), by dollar delta."""
        tickets = await self._repo.list_tickets(self._tenant, self._event)
        disputed = sorted(
            (t for t in tickets if t.status == TicketStatus.DISPUTED),
            key=lambda t: _f(t.delta_dollar_value),
            reverse=True,
        )
        items: list[dict[str, object]] = [
            {
                "ticket": f"LT-{str(t.id).replace('-', '')[:6].upper()}",
                "truck_id": t.truck_id,
                "delta": (
                    round(_f(t.delta_dollar_value), 2) if t.delta_dollar_value is not None else None
                ),
            }
            for t in disputed
        ]
        return ToolResult("disputes", {}, {"count": len(items), "disputes": items})

    async def analytics_snapshot(self) -> list[ToolResult]:
        """Build bounded, deterministic evidence for a richer analyst response."""
        tickets = await self._repo.list_tickets(self._tenant, self._event)
        grouped: dict[str, list[DomainTicket]] = {}
        for ticket in tickets:
            grouped.setdefault(ticket.debris_class.value, []).append(ticket)

        by_class: dict[str, dict[str, object]] = {}
        for debris_class, rows in sorted(grouped.items()):
            estimates = [float(t.est_fill_pct or 0) for t in rows]
            monitor_calls = [t for t in rows if t.monitor_call_fill_pct is not None]
            agreements = sum(
                abs(float(t.est_fill_pct or 0) - float(t.monitor_call_fill_pct or 0)) <= 10
                for t in monitor_calls
            )
            overcalls = [t for t in rows if t.is_overbill]
            by_class[debris_class] = {
                "ticket_count": len(rows),
                "pending_count": sum(t.status is TicketStatus.DRAFT for t in rows),
                "reviewed_count": sum(t.status is not TicketStatus.DRAFT for t in rows),
                "average_estimated_fill_pct": round(sum(estimates) / len(estimates), 1),
                "monitor_call_count": len(monitor_calls),
                "average_monitor_fill_pct": (
                    round(
                        sum(float(t.monitor_call_fill_pct or 0) for t in monitor_calls)
                        / len(monitor_calls),
                        1,
                    )
                    if monitor_calls
                    else None
                ),
                "within_10_points_count": agreements,
                "within_10_points_pct": (
                    round(agreements * 100 / len(monitor_calls), 1) if monitor_calls else None
                ),
                "overcalled_ticket_count": len(overcalls),
                "overcall_exposure_usd": round(
                    sum(float(t.delta_dollar_value or 0) for t in overcalls), 2
                ),
            }

        def ticket_row(t: DomainTicket) -> dict[str, object]:
            return {
                "ticket": f"LT-{str(t.id).replace('-', '')[:6].upper()}",
                "truck_id": t.truck_id,
                "debris_class": t.debris_class.value,
                "status": t.status.value,
                "estimated_fill_pct": round(float(t.est_fill_pct or 0), 1),
                "monitor_fill_pct": (
                    round(float(t.monitor_call_fill_pct or 0), 1)
                    if t.monitor_call_fill_pct is not None
                    else None
                ),
                "delta_usd": (
                    round(float(t.delta_dollar_value), 2)
                    if t.delta_dollar_value is not None
                    else None
                ),
            }

        overcalls = sorted(
            (t for t in tickets if t.is_overbill),
            key=lambda t: float(t.delta_dollar_value or 0),
            reverse=True,
        )[:5]
        disputes = sorted(
            (t for t in tickets if t.status is TicketStatus.DISPUTED),
            key=lambda t: abs(float(t.delta_dollar_value or 0)),
            reverse=True,
        )[:5]
        summary = await self.event_summary()
        agreement = await self.accuracy_stats()
        anomalies = await self.query_anomalies()
        return [
            summary,
            agreement,
            ToolResult("debris_class_analytics", {}, {"by_class": by_class}),
            ToolResult(
                "top_overcalls",
                {"limit": 5},
                {"tickets": [ticket_row(t) for t in overcalls]},
            ),
            anomalies,
            ToolResult(
                "disputes",
                {"limit": 5},
                {
                    "total_disputes": sum(t.status is TicketStatus.DISPUTED for t in tickets),
                    "disputes": [ticket_row(t) for t in disputes],
                },
            ),
        ]
