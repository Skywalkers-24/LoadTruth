"""AI Analyst chat API (PLAN.md §3.5, §6).

A read-only, tenant-grounded analyst. `POST /chat` streams the answer back as
Server-Sent Events: tool-use events (which grounded queries ran) followed by the
answer text in chunks, then a final done event carrying the suggestions. The
analyst never mutates data; it only reads through the tenant-scoped repository.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from app.ai.agent import STARTER_PROMPTS, answer, stream_answer
from app.ai.analyst import AnalystTools
from app.ai.factory import get_ai_client
from app.api.deps import CurrentMember
from app.api.repo import ActiveTenant, Repository
from app.auth.roles import is_super_admin

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    event_id: UUID
    message: str
    event_name: str | None = None
    prior_questions: list[str] = Field(default_factory=list, max_length=6)

    @field_validator("prior_questions")
    @classmethod
    def normalize_prior_questions(cls, values: list[str]) -> list[str]:
        return [question.strip()[:500] for question in values if question.strip()]


class StarterResponse(BaseModel):
    prompts: list[str]


@router.get("/starters", response_model=StarterResponse)
async def starters() -> StarterResponse:
    """Suggested prompts shown in an empty analyst chat."""
    return StarterResponse(prompts=STARTER_PROMPTS)


def _sse(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("")
async def chat(
    repo: Repository, tenant: ActiveTenant, body: ChatRequest, member: CurrentMember
) -> StreamingResponse:
    """Answer one analyst question, streamed as SSE. Read-only and grounded."""
    tools = AnalystTools(repo, tenant, body.event_id)
    event = await repo.get_event(tenant, body.event_id)
    if event is None:
        raise HTTPException(404, "event not found")
    event_name = event.name
    # Everyone can use the read-only analyst. Standard roles use the local,
    # deterministic composer over saved records; only Administrator mode may
    # send the bounded event summary to a configured AI provider.
    ai = get_ai_client() if is_super_admin(member.role) and "playground" not in event.tags else None

    async def gen() -> AsyncIterator[str]:
        reply = await answer(
            body.message, tools, event_name, ai, prior_questions=body.prior_questions
        )
        # Surface which grounded tools ran, so the UI can show the analyst's work.
        for t in reply.tools:
            yield _sse("tool", {"tool": t.tool, "args": t.args})
            await asyncio.sleep(0.05)
        async for chunk in stream_answer(reply):
            yield _sse("token", {"text": chunk})
            await asyncio.sleep(0.015)
        yield _sse(
            "done",
            {"suggestions": reply.suggestions, "analysis_mode": reply.analysis_mode},
        )

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
