"""Opt-in direct-B2 library smoke test with isolated SQLite and mock AI.

python -m app.demo_check --live
Creates a tiny generated video, verifies CORS/PUT/library/playback/job completion,
and removes only its own B2 object versions. Never touches production Postgres.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from collections.abc import AsyncIterator
from contextlib import closing
from pathlib import Path
from urllib.parse import unquote, urlsplit

import httpx
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.ai import get_ai_client
from app.config import get_settings
from app.pipeline import b2_store


def check() -> dict[str, object]:
    os.environ["MOCK_AI"] = "1"
    os.environ["LOADTRUTH_SKIP_STARTUP_DB"] = "1"
    get_settings.cache_clear()
    get_ai_client.cache_clear()
    from unittest.mock import AsyncMock, patch

    from app.api.deps import current_member
    from app.api.ingest_jobs import stop_ingest_jobs
    from app.api.repo import get_repository
    from app.auth.session import Session
    from app.db.base import Base
    from app.main import app
    from app.tickets import seed as seed_module
    from app.tickets.repository import SqlTicketRepository
    from app.tickets.seed import DEMO_EVENT_ID, DEMO_TENANT_ID, seed_demo

    logging.getLogger("httpx").setLevel(logging.WARNING)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required for this check")
    b2_store.require_configured()
    s = get_settings()
    report: dict[str, object] = {}
    cleanup: list[str] = []
    try:
        with tempfile.TemporaryDirectory(prefix="loadtruth-demo-check-") as folder:
            root = Path(folder)
            clip = root / "clip.mp4"
            subprocess.run(  # noqa: S603 — fixed ffmpeg arguments and generated local test media
                [
                    ffmpeg,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=red:s=256x256:d=1",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    str(clip),
                ],
                check=True,
                capture_output=True,
            )
            data = clip.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            evidence_key = b2_store.object_key(digest)
            if b2_store.head_key(evidence_key) is None:
                cleanup.append(evidence_key)
            engine = create_async_engine(f"sqlite+aiosqlite:///{root / 'test.db'}")
            maker = async_sessionmaker(engine, expire_on_commit=False)

            async def prepare() -> None:
                async with engine.begin() as connection:
                    await connection.run_sync(Base.metadata.create_all)
                async with maker() as session:
                    with patch.object(seed_module, "_seed_showcase", AsyncMock()):
                        await seed_demo(session)

            async def repository() -> AsyncIterator[SqlTicketRepository]:
                async with maker() as session:
                    try:
                        yield SqlTicketRepository(session)
                        await session.commit()
                    except Exception:
                        await session.rollback()
                        raise

            from app.api import ingest_jobs

            original_maker = ingest_jobs.get_sessionmaker
            ingest_jobs.get_sessionmaker = lambda: maker  # type: ignore[assignment]
            app.dependency_overrides[get_repository] = repository
            app.dependency_overrides[current_member] = lambda: Session(
                user_id="00000000-0000-0000-0000-0000000000aa",
                tenant_id=str(DEMO_TENANT_ID),
                email="test@loadtruth.io",
                role="super_admin",
                full_name="Integration check",
            )
            try:
                with TestClient(app) as api:
                    if api.portal is None:
                        raise RuntimeError("Test portal unavailable")
                    api.portal.call(prepare)
                    init = api.post(
                        "/demo-videos/uploads",
                        json={
                            "title": "Generated integration test",
                            "filename": "live-library.mp4",
                            "mime": "video/mp4",
                            "size_bytes": len(data),
                        },
                    )
                    if init.status_code != 201:
                        raise RuntimeError("Upload initiation failed")
                    body = init.json()
                    video_id = body["video"]["id"]
                    cleanup.append(
                        unquote(urlsplit(body["upload_url"]).path).removeprefix(
                            "/" + s.b2_bucket_name + "/"
                        )
                    )
                    with httpx.Client(timeout=30) as cloud:
                        preflight = cloud.options(
                            body["upload_url"],
                            headers={
                                "Origin": "https://loadtruth.tiwabhay800.workers.dev",
                                "Access-Control-Request-Method": "PUT",
                                "Access-Control-Request-Headers": "content-type",
                            },
                        )
                        report["browser_preflight"] = (
                            preflight.is_success
                            and preflight.headers.get("access-control-allow-origin")
                            == "https://loadtruth.tiwabhay800.workers.dev"
                        )
                        uploaded = cloud.put(
                            body["upload_url"], content=data, headers=body["headers"]
                        )
                        if not uploaded.is_success:
                            raise RuntimeError("Direct upload failed")
                        report["direct_upload"] = True
                        confirmed = api.post(f"/demo-videos/{video_id}/complete")
                        if confirmed.status_code != 200:
                            raise RuntimeError("B2 object verification failed")
                        report["verified_library_entry"] = any(
                            row["id"] == video_id and row["status"] == "ready"
                            for row in api.get("/demo-videos").json()["items"]
                        )
                        playback = api.get(f"/demo-videos/{video_id}/playback").json()["url"]
                        played = cloud.get(playback, headers={"Range": "bytes=0-15"})
                        report["private_range_playback"] = (
                            played.status_code == 206 and played.content == data[:16]
                        )
                    submitted = api.post(f"/events/{DEMO_EVENT_ID}/demo-videos/{video_id}/analyze")
                    if submitted.status_code != 202:
                        raise RuntimeError("Job creation failed")
                    for _ in range(300):
                        job = api.get(f"/events/{DEMO_EVENT_ID}/ingest-jobs").json()
                        if job["status"] in ("completed", "failed"):
                            break
                        time.sleep(0.1)
                    report["mock_analysis_ticket"] = (
                        job["status"] == "completed" and job["ticket"] is not None
                    )
                    api.portal.call(stop_ingest_jobs)
                    api.portal.call(engine.dispose)
            finally:
                app.dependency_overrides.clear()
                ingest_jobs.get_sessionmaker = original_maker
        report["status"] = "passed" if all(report.values()) else "failed"
    finally:
        cleaned = True
        for key in cleanup:
            try:
                head = b2_store.head_key(key)
                if head and head.get("VersionId"):
                    with closing(b2_store.client()) as client:
                        client.delete_object(
                            Bucket=s.b2_bucket_name, Key=key, VersionId=head["VersionId"]
                        )
            except Exception:
                cleaned = False
        report["test_objects_cleaned"] = cleaned
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", required=True)
    parser.parse_args()
    try:
        report = check()
    except Exception as exc:
        report = {"status": "failed", "error_type": type(exc).__name__}
    print(json.dumps(report))
    return int(report.get("status") != "passed")


if __name__ == "__main__":
    raise SystemExit(main())
