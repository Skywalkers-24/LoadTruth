"""Check the live Meta Model API setup from the command line.

    python -m app.ai.live_check            # key + endpoint check (one tiny Spark call)
    python -m app.ai.live_check clip.mp4   # plus the full pipeline on one clip

The clip run uses the live client directly (no database, no durable cache), so
it always calls Meta. It prints each stage, the drafted ticket, every anomaly,
and the cost-ledger total. Wrapped by ``scripts/live-check.sh`` and
``make live-check``. The API key is never printed.
"""

from __future__ import annotations

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

from app.ai.live import LiveAIClient
from app.ai.meta_http import ModelAPIError
from app.config import get_settings
from app.pipeline.ingest import ingest_upload
from app.pipeline.ledger import CostLedger
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.registry import CertifiedTruck, TruckRegistry
from app.tickets.seed import DEMO_EVENT_ID, DEMO_TENANT_ID

# Demo rates ($/CY) so the clip run prints a dollar value.
_RATES = {
    "vegetative": 9.5,
    "construction_demolition": 12.0,
    "white_goods": 15.0,
    "hazardous": 40.0,
    "other": 10.0,
}


def _say(line: str = "") -> None:
    sys.stdout.write(line + "\n")


async def _run_clip(client: LiveAIClient, path: Path, data: bytes, truck: str | None) -> None:
    artifact = ingest_upload(path.name, data, allow_scenario_override=False)
    registry = TruckRegistry([CertifiedTruck(truck, Decimal(20), "tandem")] if truck else [])
    ledger = CostLedger()
    _say(f"\nRunning the pipeline on {path.name} ({len(data):,} bytes, {artifact.media_kind})")
    async with client.clip_session(artifact.content_hash):
        result = await run_pipeline(
            artifact=artifact,
            tenant_id=DEMO_TENANT_ID,
            event_id=DEMO_EVENT_ID,
            registry=registry,
            rate_table=_RATES,
            ai=client,
            ledger=ledger,
            data=data,
        )
    if result.trace is not None:
        for st in result.trace.stages:
            conf = f" (confidence {st.confidence:.2f})" if st.confidence is not None else ""
            _say(f"  [{st.status:7}] {st.label}: {st.summary}{conf}")
    if result.no_truck:
        _say("Result: no truck bed was segmented, so no ticket would be drafted.")
    else:
        t = result.ticket
        _say(
            f"Result: truck {t.truck_id or 'unread'}, {t.debris_class.value}, "
            f"fill {t.est_fill_pct}%, {t.est_cubic_yards} CY, ${t.est_dollar_value}"
        )
        for a in result.anomalies:
            _say(f"  flag {a.type.value}: {a.explanation}")
    summary = ledger.summarize()
    _say(
        f"Cost: ${summary.total_cost_usd:.4f} across {summary.total_runs} stage rows "
        f"({summary.total_tokens_in} tokens in, {summary.total_tokens_out} out)"
    )


async def _main(clip: tuple[Path, bytes] | None, truck: str | None) -> int:
    s = get_settings()
    _say("Meta Model API live check")
    _say(f"  endpoint   {s.model_api_base_url}")
    _say(f"  models     {s.sam_model} · {s.spark_model}")
    _say(f"  key        {'set' if s.model_api_configured else 'NOT SET'}")
    _say(f"  MOCK_AI    {'on (the app will use fixtures)' if s.mock_ai else 'off'}")
    if not s.model_api_configured:
        _say("\nAdd MODEL_API_KEY to the repo-root .env, then run this again.")
        return 2

    client = LiveAIClient()
    try:
        word, usage = await client.ping()
        _say(f"\nSpark ping: {word!r} ({usage.latency_ms:.0f} ms, ${usage.cost_usd:.5f})")
        if clip is not None:
            await _run_clip(client, clip[0], clip[1], truck)
    except ModelAPIError as exc:
        _say(f"\nFAILED: {type(exc).__name__} status={exc.status} code={exc.code}")
        _say(f"  {exc}")
        return 1
    finally:
        await client.aclose()
    _say("\nOK")
    return 0


def main(argv: list[str]) -> int:
    """Parse ``[clip] [--truck=ID]`` and run the check."""
    truck = next((a.split("=", 1)[1] for a in argv if a.startswith("--truck=")), None)
    paths = [a for a in argv if not a.startswith("--")]
    clip: tuple[Path, bytes] | None = None
    if paths:
        path = Path(paths[0]).expanduser()
        if not path.is_file():
            _say(f"Clip not found: {path}")
            return 2
        clip = (path, path.read_bytes())
    return asyncio.run(_main(clip, truck))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
