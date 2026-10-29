"""OpenAI-compatible partner requests, normalized to the existing AI seam."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import httpx

from app.ai.base import CallUsage
from app.ai.meta_http import (
    ModelAPIAuthError,
    ModelAPIRequestError,
    ModelAPIResponseError,
    ModelAPIUnavailableError,
)
from app.ai.providers import PROVIDER_MODEL_IDS, PartnerEndpoint
from app.ai.request_params import SparkRequestParams, wire_effort
from app.config import get_settings


async def complete(
    route: PartnerEndpoint,
    params: SparkRequestParams,
    task_id: str,
    content: list[dict[str, Any]],
    schema: dict[str, Any] | None,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[dict[str, Any], CallUsage]:
    if not route.configured:
        raise ModelAPIAuthError(f"{route.provider} endpoint or credentials are not configured.")
    if not route.vision and any(part["type"] == "image_url" for part in content):
        raise ModelAPIRequestError(f"{route.provider} vision support has not been enabled.")
    payload: dict[str, Any] = {
        "model": route.model,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": params.max_output_tokens,
        "stream": False,
    }
    # Baseten's hackathon Spark always reasons; do not send an unsupported knob.
    if route.provider == "modal":
        effort = wire_effort(params.effort)
        payload["reasoning_effort"] = {"minimal": "low", "max": "high"}.get(effort, effort)
    if schema is not None:
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": task_id,
                "strict": True,
                "schema": schema,
            },
        }
    s = get_settings()
    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=s.model_api_timeout_s, transport=transport) as client:
        for attempt in range(s.model_api_max_retries + 1):
            try:
                response = await client.post(
                    route.base_url.rstrip("/") + "/chat/completions",
                    json=payload,
                    headers={"Authorization": f"Bearer {route.key}", **route.headers},
                )
            except httpx.TransportError as exc:
                if attempt < s.model_api_max_retries:
                    await asyncio.sleep(min(2**attempt, 5))
                    continue
                raise ModelAPIUnavailableError(f"{route.provider} connection failed.") from exc
            if response.status_code in (401, 403):
                raise ModelAPIAuthError(
                    f"{route.provider} rejected its credentials.", status=response.status_code
                )
            if response.status_code in (408, 429) or response.status_code >= 500:
                if attempt < s.model_api_max_retries:
                    await asyncio.sleep(min(2**attempt, 5))
                    continue
                raise ModelAPIUnavailableError(
                    f"{route.provider} is unavailable.", status=response.status_code
                )
            if response.is_error:
                raise ModelAPIRequestError(
                    f"{route.provider} rejected the request.", status=response.status_code
                )
            try:
                body = response.json()
                choice = body["choices"][0]
                text = choice["message"].get("content")
                if (
                    choice.get("finish_reason") not in ("stop", None)
                    or not isinstance(text, str)
                    or not text.strip()
                ):
                    raise ValueError("Empty or truncated completion")
                if schema is not None:
                    answer = json.loads(text)
                    if not isinstance(answer, dict) or not set(schema.get("required", [])).issubset(
                        answer
                    ):
                        raise ValueError("Incomplete structured answer")
            except (KeyError, IndexError, TypeError, ValueError) as exc:
                raise ModelAPIResponseError(
                    f"{route.provider} returned an unusable answer."
                ) from exc
            raw = body.get("usage") or {}
            input_details = raw.get("prompt_tokens_details") or {}
            output_details = raw.get("completion_tokens_details") or {}
            tokens_in = int(raw.get("prompt_tokens") or 0)
            tokens_out = int(raw.get("completion_tokens") or 0)
            cached = min(tokens_in, int(input_details.get("cached_tokens") or 0))
            input_price = float(getattr(s, f"{route.provider}_input_price"))
            cached_price = float(getattr(s, f"{route.provider}_cached_input_price"))
            output_price = float(getattr(s, f"{route.provider}_output_price"))
            cost = (
                (tokens_in - cached) * input_price
                + cached * cached_price
                + tokens_out * output_price
            ) / 1_000_000
            usage = CallUsage(
                model=PROVIDER_MODEL_IDS[route.provider],
                provider_model=route.model,
                pricing_known=input_price > 0 and output_price > 0,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                reasoning_tokens=int(output_details.get("reasoning_tokens") or 0),
                latency_ms=round((time.perf_counter() - started) * 1000, 1),
                cost_usd=round(cost, 6),
            )
            return {
                "output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}]
            }, usage
    raise ModelAPIUnavailableError(f"{route.provider} request did not complete.")
