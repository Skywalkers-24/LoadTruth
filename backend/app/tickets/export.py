"""FEMA/FROC-style audit-packet export (PLAN.md §3.4).

Generates a CSV of an event's tickets (the money frame per truck) and a
self-contained printable HTML packet (tickets + evidence refs + anomaly log +
a monitor-agreement statement). HTML is used instead of a PDF dependency so the export is
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
        "estimate within 10 points of the monitor's own call. This figure is agreement with "
        "the human monitor, not a benchmark against an independently known volume."
        if accuracy_within_10pct is not None
        else "No monitor calls recorded yet, so monitor agreement cannot be reported."
    )
    loc = html.escape(event_location or "")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>LoadTruth audit packet: {html.escape(event_name)}</title>
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
<p class="stmt"><strong>Agreement with monitor.</strong> {accuracy} Every estimate links to its
evidence frame, and a human monitor confirms or overrides each ticket. LoadTruth produces
evidence and flags inconsistencies; the responsible monitor retains authority over the
official record. This packet is formatted for a Federal Emergency Management Agency (FEMA)
reimbursement review.</p>
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


_INVOICE_DEBRIS_LABELS = {
    "vegetative": "Vegetative",
    "construction_demolition": "Construction &amp; demolition",
    "white_goods": "White goods",
    "hazardous": "Hazardous",
    "other": "Other",
}


def _invoice_debris_label(debris_class: str) -> str:
    return _INVOICE_DEBRIS_LABELS.get(debris_class, html.escape(debris_class))


def invoice_html(
    *,
    scope: str,
    location: str | None,
    event_id: str | None,
    ticket_count: int,
    billed_count: int,
    pending_count: int,
    total_cubic_yards: object,
    total_amount: object,
    settled_amount: object,
    pending_amount: object,
    lines: list[object],
) -> str:
    """Render a self-contained printable invoice (county owes contractor).

    HTML, not a PDF dependency, so the export is zero-dependency; the browser's
    "Print to PDF" produces the filable invoice. A real PDF renderer can slot in
    later behind this function.
    """
    generated = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    invoice_no = f"LT-{event_id[:8].upper()}" if event_id else f"LT-ALL-{datetime.now(UTC):%Y%m}"
    loc = html.escape(location or "")

    line_rows = "\n".join(
        "    <tr>"
        f"<td>{_invoice_debris_label(str(line.debris_class))}</td>"  # type: ignore[attr-defined]
        f"<td class='num'>{line.ticket_count}</td>"  # type: ignore[attr-defined]
        f"<td class='num'>{line.cubic_yards:,.2f}</td>"  # type: ignore[attr-defined]
        f"<td class='num'>${line.rate_per_cy:,.2f}</td>"  # type: ignore[attr-defined]
        f"<td class='num'>${line.amount:,.2f}</td>"  # type: ignore[attr-defined]
        "</tr>"
        for line in lines
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>LoadTruth invoice, {html.escape(scope)}</title>
<style>
  :root {{ color-scheme: light; }}
  body {{ font-family: system-ui, -apple-system, sans-serif; margin: 2.5rem; color: #0f172a; }}
  .head {{ display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem;
    border-bottom: 2px solid #0f172a; padding-bottom: 1rem; }}
  .brand {{ font-size: 1.35rem; font-weight: 700; letter-spacing: -0.01em; }}
  .brand small {{ display: block; font-size: 0.72rem; font-weight: 500;
    color: #64748b; letter-spacing: 0.04em; }}
  .meta {{ text-align: right; font-size: 0.82rem; color: #475569; line-height: 1.6; }}
  .meta b {{ color: #0f172a; }}
  h2 {{ font-size: 0.95rem; margin: 1.6rem 0 0.4rem; }}
  .bill-to {{ font-size: 0.9rem; color: #334155; }}
  .bill-to b {{ color: #0f172a; }}
  table {{ border-collapse: collapse; width: 100%; margin-top: 0.8rem; font-size: 0.85rem; }}
  th, td {{ border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }}
  th {{ background: #f8fafc; text-transform: uppercase; font-size: 0.68rem;
    letter-spacing: 0.06em; color: #64748b; }}
  td.num, th.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  tfoot td {{ font-weight: 600; border-top: 2px solid #0f172a; border-bottom: none; }}
  .totals {{ margin-top: 1.4rem; margin-left: auto; width: 320px; font-size: 0.9rem; }}
  .totals .row {{ display: flex; justify-content: space-between; padding: 4px 0; color: #475569; }}
  .totals .grand {{ border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 10px;
    font-size: 1.25rem; font-weight: 700; color: #0f172a; }}
  .note {{ margin-top: 2rem; font-size: 0.78rem; color: #64748b; line-height: 1.6;
    border-top: 1px solid #e2e8f0; padding-top: 1rem; }}
  @media print {{ body {{ margin: 0.6in; }} }}
</style></head><body>
<div class="head">
  <div>
    <div class="brand">LoadTruth<small>Video-verified load tickets</small></div>
  </div>
  <div class="meta">
    <div><b>Invoice</b> {html.escape(invoice_no)}</div>
    <div>Issued {generated}</div>
    <div>{ticket_count} loads · {billed_count} settled · {pending_count} pending</div>
  </div>
</div>

<h2>Bill to</h2>
<div class="bill-to"><b>{html.escape(scope)}</b>{"<br>" + loc if loc else ""}</div>

<h2>Line items</h2>
<table>
  <thead><tr>
    <th>Debris class</th>
    <th class="num">Loads</th>
    <th class="num">Cubic yards</th>
    <th class="num">Rate / CY</th>
    <th class="num">Amount</th>
  </tr></thead>
  <tbody>
{line_rows}
  </tbody>
  <tfoot><tr>
    <td>Total</td>
    <td class="num">{ticket_count}</td>
    <td class="num">{total_cubic_yards:,.2f}</td>
    <td class="num"></td>
    <td class="num">${total_amount:,.2f}</td>
  </tr></tfoot>
</table>

<div class="totals">
  <div class="row"><span>Settled loads</span><span>${settled_amount:,.2f}</span></div>
  <div class="row"><span>Pending review</span><span>${pending_amount:,.2f}</span></div>
  <div class="row grand"><span>Amount due</span><span>${total_amount:,.2f}</span></div>
</div>

<p class="note">Each load is billed on its credited volume (certified capacity times the
reviewed fill percentage) at the contracted rate for its debris class. Settled amounts
reflect a monitor's confirmed call; pending amounts reflect the current estimate and
finalize once a monitor reviews the load. Every amount traces to a ticket with its
evidence frame.</p>
</body></html>
"""
