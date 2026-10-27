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

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.ai.agent import STARTER_PROMPTS, answer, stream_answer
from app.ai.analyst import AnalystTools
from app.api.repo import ActiveTenant, Repository

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    event_id: UUID
    message: str
    event_name: str | None = None


class StarterResponse(BaseModel):
    prompts: list[str]


@router.get("/starters", response_model=StarterResponse)
async def starters() -> StarterResponse:
    """Suggested prompts shown in an empty analyst chat."""
    return StarterResponse(prompts=STARTER_PROMPTS)


def _sse(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("")
async def chat(repo: Repository, tenant: ActiveTenant, body: ChatRequest) -> StreamingResponse:
    """Answer one analyst question, streamed as SSE. Read-only and grounded."""
    tools = AnalystTools(repo, tenant, body.event_id)
    event_name = body.event_name or "this event"

    async def gen() -> AsyncIterator[str]:
        reply = await answer(body.message, tools, event_name)
        # Surface which grounded tools ran, so the UI can show the analyst's work.
        for t in reply.tools:
            yield _sse("tool", {"tool": t.tool, "args": t.args})
            await asyncio.sleep(0.05)
        async for chunk in stream_answer(reply):
            yield _sse("token", {"text": chunk})
            await asyncio.sleep(0.015)
        yield _sse("done", {"suggestions": reply.suggestions})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
