from __future__ import annotations

from typing import Any, cast

import pytest

from app.ai import agent
from app.ai.analyst import AnalystTools, ToolResult
from app.ai.base import AIClient


class FakeTools:
    def __init__(self, evidence: dict[str, Any] | None = None) -> None:
        self.evidence: dict[str, Any] = evidence or {}

    async def disputes(self) -> ToolResult:
        return ToolResult("disputes", {}, self.evidence)

    async def accuracy_stats(self) -> ToolResult:
        return ToolResult("accuracy_stats", {}, self.evidence)

    async def query_tickets(self, **kwargs: Any) -> ToolResult:
        return ToolResult("query_tickets", kwargs, self.evidence)

    async def query_anomalies(self) -> ToolResult:
        return ToolResult("query_anomalies", {}, self.evidence)

    async def event_summary(self) -> ToolResult:
        return ToolResult("event_summary", {}, self.evidence)


async def test_routes_grounded_answers_and_streams() -> None:
    cases: list[tuple[str, dict[str, Any], str]] = [
        ("open disputes", {"count": 0}, "no open disputes"),
        ("accuracy", {"accuracy_within_10pct": None}, "No monitor calls"),
        ("top trucks", {"tickets": []}, "No tickets"),
        ("anomalies", {"total": 0}, "No anomaly flags"),
        ("pending queue", {"pending_count": 0, "ticket_count": 3}, "Every ticket"),
        ("audit summary", {"ticket_count": 3}, "summary"),
        (
            "exposure",
            {
                "flagged_exposure": 12.5,
                "overbill_ticket_count": 1,
                "measured_value": 100,
                "ticket_count": 3,
                "pending_count": 1,
            },
            "$12.50",
        ),
        (
            "what is happening",
            {
                "flagged_exposure": 0,
                "overbill_ticket_count": 0,
                "measured_value": 0,
                "ticket_count": 0,
                "pending_count": 0,
            },
            "I can answer questions",
        ),
    ]
    for question, evidence, expected in cases:
        reply = await agent._compose(question, cast(AnalystTools, FakeTools(evidence)), "Storm")
        assert expected in reply.text
        assert reply.tools
        assert reply.suggestions
        assert "".join([part async for part in agent.stream_answer(reply)]) == reply.text


def test_intents_followups_and_prompt_are_bounded() -> None:
    assert agent._intent("dispute this") == "disputes"
    assert agent._intent("are we accurate") == "agreement"
    assert agent._intent("highest truck") == "overcalls"
    assert agent._intent("risk flags") == "anomalies"
    assert agent._intent("queue pending") == "pending"
    assert agent._intent("audit summary") == "summary"
    assert agent._intent("hello") == "exposure"
    assert len(agent._follow_ups("unknown", "hello", limit=2)) == 2
    prompt = agent._build_prompt(
        "summary", "Storm", [ToolResult("x", {}, {"ok": True})], ["older"] * 8
    )
    assert "older" in prompt and '"ok": true' in prompt


async def test_answer_falls_back_when_model_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    class BrokenAI:
        async def answer_question(self, prompt: str) -> str:
            raise RuntimeError("model unavailable")

    monkeypatch.setattr(
        agent, "get_settings", lambda: type("Settings", (), {"live_ai_enabled": True})()
    )
    tools = FakeTools(
        {
            "flagged_exposure": 0,
            "overbill_ticket_count": 0,
            "measured_value": 0,
            "ticket_count": 0,
            "pending_count": 0,
        }
    )
    reply = await agent.answer(
        "exposure", cast(AnalystTools, tools), "Storm", cast(AIClient, BrokenAI())
    )
    assert "flagged" in reply.text
    assert reply.analysis_mode == "grounded"
