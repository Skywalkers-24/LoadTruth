"""Small opt-in live checks: python -m app.integrations_check --b2 --providers.

Creates only a uniquely named B2 test object and attempts to remove that exact
version. Provider checks send a generated red square, not user evidence.
Credentials and authorization responses are never printed.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import struct
import uuid
import zlib
from contextlib import closing

from app.ai.config_store import TaskConfigUpdate, get_ai_config_store
from app.ai.live import LiveAIClient, PreparedMedia
from app.ai.meta_http import ModelAPIError, output_text
from app.ai.providers import PROVIDER_MODEL_IDS, endpoint
from app.config import get_settings
from app.pipeline import b2_store, evidence_store


def _red_png() -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    raw = (b"\x00" + b"\xff\x00\x00" * 256) * 256
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 256, 256, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


async def check_b2() -> dict[str, object]:
    s = get_settings()
    if not s.b2_configured:
        return {"status": "not_configured"}
    key = hashlib.sha256(uuid.uuid4().bytes).hexdigest()
    version: str | None = None
    report: dict[str, object] = {}
    try:
        data = _red_png()
        await evidence_store.save(key, data, mime="image/png")
        head = await asyncio.to_thread(b2_store.head_key, b2_store.object_key(key))
        if head is None:
            raise RuntimeError("B2 did not retain the test object.")
        version = head.get("VersionId")
        downloaded = await asyncio.to_thread(b2_store.get, key)
        report = {
            "status": "passed",
            "remote_round_trip": downloaded is not None and downloaded[0] == data,
        }
        original_put = b2_store.put
        try:

            def outage(content_hash: str, data: bytes, mime: str, fps: float | None) -> None:
                raise OSError("simulated outage")

            b2_store.put = outage
            try:
                await evidence_store.save(
                    hashlib.sha256(uuid.uuid4().bytes).hexdigest(), data, mime="image/png"
                )
            except b2_store.StorageUnavailableError:
                report["no_local_fallback"] = True
            else:
                report["status"] = "failed"
        finally:
            b2_store.put = original_put
    except Exception as exc:
        report = {"status": "failed", "error_type": type(exc).__name__}
    finally:
        if version:
            with closing(b2_store.client()) as client:
                await asyncio.to_thread(
                    client.delete_object,
                    Bucket=s.b2_bucket_name,
                    Key=b2_store.object_key(key),
                    VersionId=version,
                )
    return report


async def check_provider(provider: str) -> dict[str, object]:
    route = endpoint(provider)
    if not route.configured:
        return {"status": "not_configured"}
    task = "spark_ocr" if route.vision else "analyst_chat"
    await get_ai_config_store().update(
        task, TaskConfigUpdate(model=PROVIDER_MODEL_IDS[provider], max_output_tokens=2048)
    )
    client = LiveAIClient()
    try:
        schema = {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["ready"]},
                "color": {"type": "string", "enum": ["red", "green", "blue", "other"]},
            },
            "required": ["status", "color"],
            "additionalProperties": False,
        }
        image = _red_png()
        media = (
            PreparedMedia("image", "image/png", len(image), {"type": "input_image"}, data=image)
            if route.vision
            else None
        )
        prompt = (
            "Reply as JSON. Set status to ready and color to the dominant color of the image."
            if route.vision
            else "Reply as JSON with status ready and color red."
        )
        response, usage = await client._spark(
            task, [{"type": "input_text", "text": prompt}], schema, media=media
        )
        answer = json.loads(output_text(response))
        ok = (
            answer.get("status", "").lower() == "ready" and answer.get("color", "").lower() == "red"
        )
        return {
            "status": "passed" if ok else "failed",
            "structured_output": True,
            "synthetic_answer": {
                "status": str(answer.get("status", ""))[:80],
                "color": str(answer.get("color", ""))[:80],
            },
            "vision": route.vision,
            "tokens_in": usage.tokens_in,
            "tokens_out": usage.tokens_out,
            "pricing_configured": usage.pricing_known,
        }
    except ModelAPIError as exc:
        return {"status": "failed", "error_type": type(exc).__name__, "http_status": exc.status}
    except Exception as exc:  # noqa: BLE001 — sanitized diagnostics only
        return {"status": "failed", "error_type": type(exc).__name__}
    finally:
        await client.aclose()
        await get_ai_config_store().reset(task)


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--b2", action="store_true")
    parser.add_argument("--providers", action="store_true")
    args = parser.parse_args()
    report: dict[str, object] = {}
    if args.b2:
        report["backblaze"] = await check_b2()
        print(json.dumps({"backblaze": report["backblaze"]}), flush=True)
    if args.providers:
        for provider in PROVIDER_MODEL_IDS:
            report[provider] = await check_provider(provider)
            print(json.dumps({provider: report[provider]}), flush=True)
    return int(
        any(
            isinstance(result, dict) and result.get("status") == "failed"
            for result in report.values()
        )
    )


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
