"""FEMA/FROC-style audit-packet export (PLAN.md §3.4).

Generates a CSV of an event's tickets (the money frame per truck) and a
self-contained printable HTML packet (tickets + evidence refs + anomaly log +
accuracy statement). HTML is used instead of a PDF dependency so the export is
zero-dependency; the browser's "Print to PDF" produces the filable document, and
a real PDF renderer can slot in later behind the same function.
"""

from __future__ import annotations

import csv
import html
import io
from datetime import UTC, datetime

from app.tickets.domain import Ticket

_CSV_COLUMNS = [
    "ticket_id",
    "truck_id",
    "debris_class",
    "certified_cy",
    "est_fill_pct",
    "est_cubic_yards",
    "est_dollar_value",
    "monitor_fill_pct",
    "monitor_dollar_value",
    "delta_dollar_value",
    "status",
    "anomaly_count",
]


def tickets_to_csv(tickets: list[Ticket]) -> str:
    """Render an event's tickets as CSV text."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_CSV_COLUMNS)
    for t in tickets:
        writer.writerow(
            [
                str(t.id),
                t.truck_id or "",
                t.debris_class.value,
                t.certified_cubic_yards,
                t.est_fill_pct,
                t.est_cubic_yards,
                t.est_dollar_value,
                t.monitor_call_fill_pct if t.monitor_call_fill_pct is not None else "",
                t.monitor_dollar_value if t.monitor_dollar_value is not None else "",
                t.delta_dollar_value if t.delta_dollar_value is not None else "",
                t.status.value,
                t.anomaly_count,
            ]
        )
    return buf.getvalue()


def audit_packet_html(
    *,
    event_name: str,
    event_location: str | None,
    tickets: list[Ticket],
    accuracy_within_10pct: float | None,
) -> str:
    """Render a self-contained printable audit packet as HTML."""
    generated = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    total_delta = sum((t.delta_dollar_value or 0) for t in tickets)
    rows = "\n".join(_ticket_row(t) for t in tickets)
    accuracy = (
        f"{round(accuracy_within_10pct * 100)}% of monitor-reviewed loads had the machine "
        "estimate within ±10 points of the monitor's own call."
        if accuracy_within_10pct is not None
        else "No monitor calls recorded yet, so no accuracy benchmark is available."
    )
    loc = html.escape(event_location or "")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>LoadTruth audit packet — {html.escape(event_name)}</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 2rem; color: #111; }}
  h1 {{ font-size: 1.4rem; margin-bottom: 0.2rem; }}
  .muted {{ color: #555; }}
  table {{ border-collapse: collapse; width: 100%; margin-top: 1rem; font-size: 0.85rem; }}
  th, td {{ border: 1px solid #ccc; padding: 6px 8px; text-align: left; }}
  th {{ background: #f3f3f3; }}
  .total {{ font-size: 1.1rem; font-weight: 600; margin-top: 1rem; }}
  .stmt {{ margin-top: 1.5rem; font-size: 0.85rem; color: #333; }}
</style></head><body>
<h1>LoadTruth audit packet</h1>
<div class="muted">{html.escape(event_name)}{" · " + loc if loc else ""}</div>
<div class="muted">Generated {generated} · {len(tickets)} tickets</div>
<div class="total">Disputed volume flagged: ${total_delta:,.2f}</div>
<table>
  <thead><tr>
    <th>Truck</th><th>Debris</th><th>Certified CY</th>
    <th>LoadTruth %</th><th>Monitor %</th><th>Delta $</th>
    <th>Status</th><th>Flags</th><th>Evidence</th>
  </tr></thead>
  <tbody>
{rows}
  </tbody>
</table>
<p class="stmt"><strong>Accuracy statement.</strong> {accuracy} Every estimate links to its
evidence frame; a human monitor confirms or overrides each ticket. LoadTruth produces
evidence and flags inconsistencies; the responsible monitor retains authority over the
official record.</p>
</body></html>
"""


def _ticket_row(t: Ticket) -> str:
    delta = f"${t.delta_dollar_value:,.2f}" if t.delta_dollar_value is not None else "—"
    monitor = f"{t.monitor_call_fill_pct}%" if t.monitor_call_fill_pct is not None else "—"
    frames = html.escape(", ".join(t.evidence_frames))
    return (
        "    <tr>"
        f"<td>{html.escape(t.truck_id or '—')}</td>"
        f"<td>{t.debris_class.value}</td>"
        f"<td>{t.certified_cubic_yards}</td>"
        f"<td>{t.est_fill_pct}%</td>"
        f"<td>{monitor}</td>"
        f"<td>{delta}</td>"
        f"<td>{t.status.value}</td>"
        f"<td>{t.anomaly_count}</td>"
        f"<td>{frames}</td>"
        "</tr>"
    )
