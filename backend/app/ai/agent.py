# ruff: noqa: E501 — grounded answer templates read better unwrapped
"""The analyst agent: intent routing, tool calls, and answer composition.

This is the mock Muse Spark analyst (PLAN.md §6). It is read-only and grounded:
it classifies the question, runs the matching tenant-scoped tool(s), and composes
a natural-language answer from the real evidence those tools return. No figure is
invented. When a live Muse Spark key is wired, the same tools feed the real model
and this planner is replaced by the model's own tool-calling; the API and tool
layer stay identical.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.ai.analyst import AnalystTools, ToolResult


def money(n: float) -> str:
    return f"${n:,.2f}"


@dataclass(slots=True)
class AnalystReply:
    """A composed analyst answer plus the tool evidence used to ground it."""

    text: str
    tools: list[ToolResult]
    suggestions: list[str]


# Suggested prompts shown in the empty chat.
STARTER_PROMPTS = [
    "What is the flagged exposure for this event?",
    "Which trucks over-called the most?",
    "How many tickets still need review?",
    "Are there any open disputes?",
    "How accurate are our fill estimates?",
    "Summarize this event for an audit.",
]


def _mentions(q: str, *words: str) -> bool:
    return any(w in q for w in words)


async def answer(question: str, tools: AnalystTools, event_name: str) -> AnalystReply:
    """Route the question to tools and compose a grounded answer."""
    q = question.lower().strip()
    used: list[ToolResult] = []

    # Disputes
    if _mentions(q, "dispute", "disputed", "contested"):
        d = await tools.disputes()
        used.append(d)
        items = d.evidence.get("disputes", [])  # type: ignore[assignment]
        count = int(d.evidence.get("count", 0))  # type: ignore[arg-type]
        if count == 0:
            text = f"There are no open disputes in {event_name}. Every reviewed ticket was confirmed or overridden."
        else:
            lead = f"There {'is' if count == 1 else 'are'} {count} open dispute{'' if count == 1 else 's'} in {event_name}."
            lines = [
                f"- {it['ticket']} ({it['truck_id'] or 'unidentified truck'}): {money(float(it['delta'] or 0))} over-called"
                for it in items[:5]
            ]
            text = lead + "\n\n" + "\n".join(lines)
        return AnalystReply(text, used, STARTER_PROMPTS)

    # Accuracy
    if _mentions(q, "accurate", "accuracy", "benchmark", "confidence"):
        a = await tools.accuracy_stats()
        used.append(a)
        acc = a.evidence.get("accuracy_within_10pct")
        reviewed = a.evidence.get("reviewed_count", 0)
        total = a.evidence.get("ticket_count", 0)
        if acc is None:
            text = f"No accuracy benchmark is recorded for {event_name} yet."
        else:
            pct = round(float(acc) * 100)  # type: ignore[arg-type]
            text = (
                f"In {event_name}, {pct}% of tickets have a measured fill within 10 percentage points "
                f"of the monitor's call. {reviewed} of {total} tickets have been reviewed."
            )
        return AnalystReply(text, used, STARTER_PROMPTS)

    # Top over-callers / trucks
    if _mentions(q, "over-call", "overcall", "over call", "truck", "worst", "highest", "top"):
        t = await tools.query_tickets(overbill_only=True, limit=5)
        used.append(t)
        items = t.evidence.get("tickets", [])  # type: ignore[assignment]
        if not items:
            text = f"No tickets in {event_name} were called higher than the measured load."
        else:
            lines = [
                f"- {it['ticket']} · {it['truck_id'] or 'unidentified'} · {it['debris_class']}: "
                f"{money(float(it['delta'] or 0))} over the measured value"
                for it in items
            ]
            text = f"The highest over-calls in {event_name} are:\n\n" + "\n".join(lines)
        return AnalystReply(text, used, STARTER_PROMPTS)

    # Anomalies / flags
    if _mentions(q, "anomal", "flag", "risk"):
        an = await tools.query_anomalies()
        used.append(an)
        by = an.evidence.get("by_severity", {})  # type: ignore[assignment]
        total = int(an.evidence.get("total", 0))  # type: ignore[arg-type]
        if total == 0:
            text = f"No anomaly flags are raised in {event_name}."
        else:
            parts = ", ".join(f"{v} {k}" for k, v in by.items())
            text = f"{event_name} has {total} anomaly flag{'' if total == 1 else 's'}: {parts}."
        return AnalystReply(text, used, STARTER_PROMPTS)

    # Review progress / pending
    if _mentions(q, "need review", "needs review", "pending", "awaiting", "left to review", "queue"):
        s = await tools.event_summary()
        used.append(s)
        pending = int(s.evidence.get("pending_count", 0))  # type: ignore[arg-type]
        total = int(s.evidence.get("ticket_count", 0))  # type: ignore[arg-type]
        flagged = float(s.evidence.get("flagged_exposure", 0))  # type: ignore[arg-type]
        text = (
            f"{pending} of {total} tickets in {event_name} still need review, "
            f"carrying {money(flagged)} in flagged exposure."
            if pending
            else f"Every ticket in {event_name} has a decision. Nothing is awaiting review."
        )
        return AnalystReply(text, used, STARTER_PROMPTS)

    # Audit summary
    if _mentions(q, "summar", "audit", "overview", "report", "brief"):
        s = await tools.event_summary()
        a = await tools.accuracy_stats()
        used += [s, a]
        e = s.evidence
        pct = a.evidence.get("accuracy_within_10pct")
        acc_line = (
            f" Fill accuracy is {round(float(pct) * 100)}% within 10 points of the monitor."  # type: ignore[arg-type]
            if pct is not None
            else ""
        )
        text = (
            f"{event_name} summary: {e['ticket_count']} tickets, {money(float(e['measured_value']))} measured. "  # type: ignore[arg-type]
            f"{e['overbill_ticket_count']} were over-called, flagging {money(float(e['flagged_exposure']))} in exposure. "  # type: ignore[arg-type]
            f"{e['reviewed_count']} reviewed, {e['pending_count']} pending, {e['disputed']} disputed."  # type: ignore[index]
            + acc_line
        )
        return AnalystReply(text, used, STARTER_PROMPTS)

    # Exposure / money (and default)
    s = await tools.event_summary()
    used.append(s)
    e = s.evidence
    text = (
        f"In {event_name}, {money(float(e['flagged_exposure']))} is flagged across "  # type: ignore[arg-type]
        f"{e['overbill_ticket_count']} over-called ticket{'' if e['overbill_ticket_count'] == 1 else 's'}, "  # type: ignore[index]
        f"out of {money(float(e['measured_value']))} measured over {e['ticket_count']} tickets. "  # type: ignore[arg-type]
        f"{e['pending_count']} still need review."  # type: ignore[index]
    )
    if not _mentions(q, "exposure", "money", "flag", "dollar", "cost", "bill"):
        text = (
            "I can answer questions about this event's exposure, over-calls, disputes, anomalies, "
            "accuracy, and review progress. Here is where things stand:\n\n" + text
        )
    return AnalystReply(text, used, STARTER_PROMPTS)


async def stream_answer(reply: AnalystReply) -> AsyncIterator[str]:
    """Yield the answer in word chunks to simulate token streaming."""
    words = reply.text.split(" ")
    for i, w in enumerate(words):
        yield (" " if i else "") + w
