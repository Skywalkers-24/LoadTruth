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
