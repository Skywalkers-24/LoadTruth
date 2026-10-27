"""Record every Meta Model API exchange to one JSON Lines file.

One line per call (responses, streamed responses, file upload, file delete) with
the request, the outcome, usage, latency, and the model's output text. It is the
reference for learning how SAM 3.1 and Muse Spark really answer, and it lets a
later session read a past response instead of paying for the call again.

Safety: the API key is never written (it lives only in the Authorization
header). Inline media (base64 data URLs) is replaced with its MIME type and
size. Output text longer than ``model_api_log_max_chars`` is truncated, with the
full length recorded. Writing is best effort and never fails a model call.

Summarize the file with ``python -m app.ai.api_log [N]`` (or
``scripts/meta-log.sh``), which prints one short line per call.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.log import get_logger

log = get_logger("ai.api_log")

_DATA_URL = re.compile(r"^data:([\w.+/-]+);base64,(.*)$", re.DOTALL)
_lock = asyncio.Lock()


def _redact(value: Any) -> Any:
    """Copy a request payload with inline media replaced by a short placeholder."""
    if isinstance(value, Mapping):
        return {k: _redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    if isinstance(value, str) and value.startswith("data:"):
        m = _DATA_URL.match(value)
        if m:
            approx_bytes = len(m.group(2)) * 3 // 4
            return f"<inline {m.group(1)}, {approx_bytes} bytes>"
    return value


def _clip(text: str, limit: int) -> dict[str, Any]:
    if len(text) <= limit:
        return {"output_text": text, "output_chars": len(text)}
    return {"output_text": text[:limit], "output_chars": len(text), "truncated": True}


def log_path() -> Path | None:
    """The configured log file, or None when recording is off."""
    raw = get_settings().model_api_log_path.strip()
    return Path(raw) if raw else None


async def record(
    call: str,
    *,
    request: Mapping[str, Any] | None = None,
    status: int | None = None,
    latency_ms: float | None = None,
    usage: Mapping[str, Any] | None = None,
    output_text: str | None = None,
    response: Mapping[str, Any] | None = None,
    error: BaseException | None = None,
    extra: Mapping[str, Any] | None = None,
) -> None:
    """Append one exchange to the log file (no-op when recording is off)."""
    path = log_path()
    if path is None:
        return
    limit = get_settings().model_api_log_max_chars
    entry: dict[str, Any] = {
        "ts": datetime.now(UTC).isoformat(timespec="milliseconds"),
        "call": call,
    }
    if request is not None:
        entry["model"] = request.get("model")
        entry["request"] = _redact(request)
    if status is not None:
        entry["status"] = status
    if latency_ms is not None:
        entry["latency_ms"] = round(latency_ms, 1)
    if usage:
        entry["usage"] = dict(usage)
    if output_text is not None:
        entry.update(_clip(output_text, limit))
    if response is not None:
        body = json.dumps(response, default=str)
        entry["response"] = response if len(body) <= limit else {"truncated_json": body[:limit]}
    if error is not None:
        entry["error"] = {
            "type": type(error).__name__,
            "message": str(error)[:1000],
            "status": getattr(error, "status", None),
            "code": getattr(error, "code", None),
        }
    if extra:
        entry.update(extra)
    line = json.dumps(entry, default=str, ensure_ascii=False) + "\n"
    try:
        async with _lock:
            await asyncio.to_thread(_append, path, line)
    except OSError:
        log.warning("model_api_log_write_failed", path=str(path), exc_info=True)


def _append(path: Path, line: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(line)


class Timer:
    """Wall-clock milliseconds since construction."""

    def __init__(self) -> None:
        self._t0 = time.perf_counter()

    @property
    def ms(self) -> float:
        return (time.perf_counter() - self._t0) * 1000


def _task(entry: Mapping[str, Any]) -> str:
    req = entry.get("request") or {}
    fmt = ((req.get("text") or {}).get("format") or {}).get("name")
    if fmt:
        return str(fmt)
    inp = req.get("input")
    if isinstance(inp, str):
        return inp[:40]
    first = inp[0] if isinstance(inp, list) and inp else None
    content = first.get("content") if isinstance(first, Mapping) else None
    if isinstance(content, list) and content and isinstance(content[0], Mapping):
        return str(content[0].get("text", ""))[:40]
    return str(entry.get("filename") or entry.get("file_id") or "")


def summarize(lines: list[str], last: int) -> list[str]:
    """One compact line per logged call (for reading the log cheaply)."""
    out: list[str] = []
    for raw in lines[-last:]:
        try:
            e = json.loads(raw)
        except ValueError:
            continue
        err = e.get("error")
        outcome = (
            f"ERROR {err['type']} {err.get('status')}: {err['message'][:120]}"
            if err
            else (f"{e.get('output_chars', 0)} chars: {str(e.get('output_text', ''))[:100]!r}")
        )
        usage = e.get("usage") or {}
        tokens = ",".join(f"{k}={v}" for k, v in usage.items() if isinstance(v, int | float))
        out.append(
            f"{e.get('ts', '')[11:23]} {e.get('call', ''):17} {str(e.get('model') or ''):16} "
            f"{_task(e):18} {e.get('status', '')!s:4} {e.get('latency_ms', '')!s:>8}ms "
            f"[{tokens}] {outcome}"
        )
    return out


def main(argv: list[str]) -> int:
    path = log_path() or Path("logs/meta_api.jsonl")
    if argv and not argv[0].isdigit():
        path, argv = Path(argv[0]), argv[1:]
    last = int(argv[0]) if argv else 30
    if not path.is_file():
        sys.stdout.write(f"No log yet at {path}\n")
        return 1
    lines = path.read_text(encoding="utf-8").splitlines()
    sys.stdout.write(f"{path}: {len(lines)} calls, showing the last {min(last, len(lines))}\n")
    for line in summarize(lines, last):
        sys.stdout.write(line + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
