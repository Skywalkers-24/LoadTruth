"""HTTP transport for the Meta Model API (``https://api.meta.ai/v1``).

A thin, typed layer over ``httpx`` that the live client uses for every call:

* ``create_response`` — a non-streaming ``POST /responses`` (Muse Spark).
* ``stream_response`` — a streamed ``POST /responses`` read as server-sent
  events (SAM 3.1), returning the final output text plus the usage block.
* ``upload_file`` / ``delete_file`` — the Files API (``purpose=user_data``).

Retries cover 429, 5xx, and network errors with exponential backoff (honoring
``Retry-After``). A 4xx other than 429 is permanent and never retried, as the
docs require. Every failure surfaces as a :class:`ModelAPIError` subclass so the
API layer can map it to a clear status without leaking internals.

The API key is sent only in the ``Authorization`` header and is never logged.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from collections import Counter
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, cast

import httpx

from app.ai import api_log
from app.log import get_logger

log = get_logger("ai.meta_http")

_RETRYABLE_STATUS = frozenset({408, 429, 500, 502, 503, 504})
_MAX_BACKOFF_S = 10.0


class ModelAPIError(RuntimeError):
    """Base error for a failed Meta Model API call."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        code: str | None = None,
        retry_after: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.retry_after = retry_after


class ModelAPIAuthError(ModelAPIError):
    """The key is missing, invalid, or lacks access to the model (401/403/404)."""


class ModelAPIRequestError(ModelAPIError):
    """The API rejected the request as malformed or too large (permanent 4xx)."""


class ModelAPIUnavailableError(ModelAPIError):
    """Rate limited, server error, or network failure after all retries."""


class ModelAPIResponseError(ModelAPIError):
    """The call returned, but the response failed, was cut short, or is unusable."""


@dataclass(frozen=True, slots=True)
class StreamedText:
    """Final output text and usage of a streamed response."""

    text: str
    usage: dict[str, Any] = field(default_factory=dict)
    latency_ms: float = 0.0
    # How many of each event type the stream carried (recorded for learning).
    event_counts: dict[str, int] = field(default_factory=dict)


def output_text(response: Mapping[str, Any]) -> str:
    """Concatenate every ``output_text`` part of a Responses API response."""
    parts: list[str] = []
    for item in response.get("output") or []:
        if not isinstance(item, Mapping) or item.get("type") != "message":
            continue
        for c in item.get("content") or []:
            if isinstance(c, Mapping) and c.get("type") == "output_text":
                parts.append(str(c.get("text") or ""))
    return "".join(parts)


def _error_detail(resp: httpx.Response) -> tuple[str, str | None]:
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:300] or resp.reason_phrase, None
    err = body.get("error") if isinstance(body, Mapping) else None
    if isinstance(err, Mapping):
        return str(err.get("message") or resp.reason_phrase), cast("str | None", err.get("code"))
    return str(body)[:300], None


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.status_code < 400:
        return
    message, code = _error_detail(resp)
    status = resp.status_code
    if status in (401, 403):
        raise ModelAPIAuthError(message, status=status, code=code)
    if status in _RETRYABLE_STATUS:
        raise ModelAPIUnavailableError(
            message, status=status, code=code, retry_after=resp.headers.get("retry-after")
        )
    raise ModelAPIRequestError(message, status=status, code=code)


def _backoff_s(attempt: int, retry_after: str | None) -> float:
    if retry_after:
        try:
            return max(0.0, min(float(retry_after), _MAX_BACKOFF_S))
        except ValueError:
            pass
    return min(2.0**attempt, _MAX_BACKOFF_S)


class _SSECollector:
    """Fold Responses API stream events into one final text + usage."""

    def __init__(self) -> None:
        self.deltas: list[str] = []
        self.final: str | None = None
        self.usage: dict[str, Any] = {}
        self.completed = False
        self.events: Counter[str] = Counter()

    def accept(self, event: Mapping[str, Any]) -> None:
        kind = str(event.get("type") or "")
        self.events[kind] += 1
        if kind == "response.output_text.delta":
            self.deltas.append(str(event.get("delta") or ""))
        elif kind == "response.output_text.done":
            self.final = str(event.get("text") or "")
        elif kind == "response.content_part.done":
            part = event.get("part")
            if isinstance(part, Mapping) and part.get("type") == "output_text":
                self.final = str(part.get("text") or "")
        elif kind == "response.completed":
            self._complete(event.get("response"))
        elif kind in ("response.failed", "response.incomplete", "error"):
            raise ModelAPIResponseError(_stream_failure(event), code=kind)
        elif kind.startswith("response.refusal"):
            raise ModelAPIResponseError("The model declined the request.", code="refusal")

    def _complete(self, response: object) -> None:
        self.completed = True
        if isinstance(response, Mapping):
            usage = response.get("usage")
            self.usage = dict(usage) if isinstance(usage, Mapping) else {}
            if self.final is None:
                text = output_text(response)
                if text:
                    self.final = text

    def text(self) -> str:
        if self.final is not None:
            return self.final
        # Fallback when no finalizer event arrived: SAM emits one line per frame
        # and each line opens with a frame marker right after a closing `|>`.
        return re.sub(r"\|>(<\d+f>)", r"|>\n\1", "".join(self.deltas))


def _stream_failure(event: Mapping[str, Any]) -> str:
    response = event.get("response")
    if isinstance(response, Mapping):
        err = response.get("error")
        if isinstance(err, Mapping) and err.get("message"):
            return str(err["message"])
        details = response.get("incomplete_details")
        if isinstance(details, Mapping) and details.get("reason"):
            return f"The response was cut short ({details['reason']})."
    if event.get("message"):
        return str(event["message"])
    return "The response failed."


async def _sse_events(resp: httpx.Response) -> AsyncIterator[dict[str, Any]]:
    """Yield each JSON event of a server-sent-events body."""
    buf: list[str] = []
    async for raw in resp.aiter_lines():
        line = raw.rstrip("\r")
        if not line:
            if buf:
                payload = "\n".join(buf)
                buf = []
                if payload != "[DONE]":
                    yield _json_event(payload)
            continue
        if line.startswith("data:"):
            buf.append(line[5:].lstrip())
    if buf and "\n".join(buf) != "[DONE]":
        yield _json_event("\n".join(buf))


def _json_event(payload: str) -> dict[str, Any]:
    try:
        event = json.loads(payload)
    except ValueError as exc:
        raise ModelAPIResponseError("The response stream was malformed.") from exc
    if not isinstance(event, dict):
        raise ModelAPIResponseError("The response stream was malformed.")
    return event


class MetaHTTP:
    """Async client for the Meta Model API with retries and typed errors."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout_s: float = 300.0,
        max_retries: int = 2,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_s, connect=20.0)
        self._max_retries = max(0, max_retries)
        self._transport = transport
        self._sleep = sleep
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                headers={"Authorization": f"Bearer {self._api_key}"},
                timeout=self._timeout,
                transport=self._transport,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _retrying[T](self, what: str, call: Callable[[], Awaitable[T]]) -> T:
        attempt = 0
        while True:
            try:
                return await call()
            except httpx.TransportError as exc:
                error = ModelAPIUnavailableError(
                    f"Could not reach the Model API ({type(exc).__name__})."
                )
                error.__cause__ = exc
            except ModelAPIUnavailableError as exc:
                error = exc
            if attempt >= self._max_retries:
                raise error
            delay = _backoff_s(attempt, error.retry_after)
            log.warning(
                "model_api_retry",
                call=what,
                attempt=attempt + 1,
                status=error.status,
                delay_s=delay,
            )
            await self._sleep(delay)
            attempt += 1

    async def create_response(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        """Non-streaming ``POST /responses``. Raises unless the status is completed."""
        timer = api_log.Timer()
        try:
            body = await self._create_response(payload)
        except ModelAPIError as exc:
            await api_log.record(
                "responses", request=payload, status=exc.status, latency_ms=timer.ms, error=exc
            )
            raise
        await api_log.record(
            "responses",
            request=payload,
            status=200,
            latency_ms=timer.ms,
            usage=body.get("usage") if isinstance(body.get("usage"), Mapping) else None,
            output_text=output_text(body),
            response=body,
        )
        return body

    async def stream_response(self, payload: Mapping[str, Any]) -> StreamedText:
        """Streamed ``POST /responses``; returns the final text and usage."""
        timer = api_log.Timer()
        try:
            out = await self._stream_response(payload)
        except ModelAPIError as exc:
            await api_log.record(
                "responses.stream",
                request=payload,
                status=exc.status,
                latency_ms=timer.ms,
                error=exc,
            )
            raise
        await api_log.record(
            "responses.stream",
            request=payload,
            status=200,
            latency_ms=timer.ms,
            usage=out.usage,
            output_text=out.text,
            extra={"stream_events": out.event_counts},
        )
        return out

    async def upload_file(self, data: bytes, *, filename: str, mime: str, ttl_s: int) -> str:
        """Upload bytes to the Files API and return the ``file-…`` id."""
        timer = api_log.Timer()
        meta = {"filename": filename, "mime": mime, "bytes": len(data), "ttl_s": ttl_s}
        try:
            file_id = await self._upload_file(data, filename=filename, mime=mime, ttl_s=ttl_s)
        except ModelAPIError as exc:
            await api_log.record(
                "files.upload", status=exc.status, latency_ms=timer.ms, error=exc, extra=meta
            )
            raise
        await api_log.record(
            "files.upload", status=200, latency_ms=timer.ms, extra={**meta, "file_id": file_id}
        )
        return file_id

    async def _create_response(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        async def call() -> dict[str, Any]:
            resp = await self._http().post("/responses", json=dict(payload))
            _raise_for_status(resp)
            body = resp.json()
            if not isinstance(body, dict):
                raise ModelAPIResponseError("The response was not a JSON object.")
            return body

        body = await self._retrying("responses", call)
        status = body.get("status")
        if status not in (None, "completed"):
            raise ModelAPIResponseError(_stream_failure({"response": body}), code=str(status))
        return body

    async def _stream_response(self, payload: Mapping[str, Any]) -> StreamedText:
        body = {**payload, "stream": True}

        async def call() -> StreamedText:
            started = time.perf_counter()
            async with self._http().stream(
                "POST", "/responses", json=body, headers={"Accept": "text/event-stream"}
            ) as resp:
                if resp.status_code >= 400:
                    await resp.aread()
                    _raise_for_status(resp)
                collector = _SSECollector()
                async for event in _sse_events(resp):
                    collector.accept(event)
            if not collector.completed:
                raise ModelAPIResponseError("The response stream ended before it completed.")
            latency = (time.perf_counter() - started) * 1000
            return StreamedText(
                collector.text(), collector.usage, round(latency, 1), dict(collector.events)
            )

        return await self._retrying("responses.stream", call)

    async def _upload_file(self, data: bytes, *, filename: str, mime: str, ttl_s: int) -> str:
        async def call(with_expiry: bool) -> str:
            form: dict[str, str] = {"purpose": "user_data"}
            if with_expiry:
                form["expires_after[anchor]"] = "created_at"
                form["expires_after[seconds]"] = str(ttl_s)
            resp = await self._http().post(
                "/files", data=form, files={"file": (filename, data, mime)}
            )
            _raise_for_status(resp)
            file_id = resp.json().get("id")
            if not isinstance(file_id, str) or not file_id:
                raise ModelAPIResponseError("The upload response had no file id.")
            return file_id

        try:
            return await self._retrying("files.upload", lambda: call(True))
        except ModelAPIRequestError:
            # Expiry is a safety net, not a requirement; retry once without it.
            log.warning("model_api_upload_expiry_rejected")
            return await self._retrying("files.upload", lambda: call(False))

    async def delete_file(self, file_id: str) -> None:
        """Best-effort ``DELETE /files/{id}``; failures are logged, not raised."""
        timer = api_log.Timer()
        try:
            resp = await self._http().delete(f"/files/{file_id}")
            if resp.status_code >= 400 and resp.status_code != 404:
                log.warning("model_api_file_delete_failed", status=resp.status_code)
            await api_log.record(
                "files.delete",
                status=resp.status_code,
                latency_ms=timer.ms,
                extra={"file_id": file_id},
            )
        except httpx.HTTPError as exc:
            log.warning("model_api_file_delete_failed", exc_info=True)
            await api_log.record(
                "files.delete", latency_ms=timer.ms, error=exc, extra={"file_id": file_id}
            )
