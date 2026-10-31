"""Local benchmark orchestration. Standard library only; no inference on plan/report/export."""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import fcntl
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
STOP = threading.Event()


def now():
    return datetime.now(UTC).isoformat()


def save(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, indent=2) + "\n")
    temp.replace(path)


def read(path):
    return json.loads(Path(path).read_text())


def optional_json(path):
    try:
        return read(path)
    except (OSError, ValueError):
        return None


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def command(args, **kwargs):
    return subprocess.check_output(args, cwd=ROOT, text=True, **kwargs).strip()


def container(code, payload=None):
    # Code contains no credentials. Connection credentials travel only over stdin.
    return json.loads(
        command(
            ["docker", "compose", "exec", "-T", "backend", "python", "-c", code],
            input=json.dumps(payload) if payload else None,
        )
    )


RUNTIME = """
import json, shutil
from urllib.parse import urlsplit
from app.config import get_settings
from app.ai.live import _CLASSIFY_PROMPT, _NAME_LOAD_PROMPT
from app.ai.providers import ai_config_fingerprint
from app.ai.sam_measure import SAM_PROMPT_VERSION
from app.ai.config_store import get_ai_config_store
from app.pipeline.benchmark_media import BENCHMARK_MEDIA
import hashlib
s=get_settings()
print(json.dumps(dict(database_host=urlsplit(s.database_url).hostname,
    postgres=not s.is_sqlite, target=s.target_sampled_frames, maximum=s.max_sampled_frames,
    preserve=s.preserve_source_frames, muse_frames=s.spark_frames_per_task,
    ffmpeg=bool(shutil.which('ffmpeg') and shutil.which('ffprobe')), mock=s.mock_ai,
    b2=s.b2_configured, meta=s.model_api_configured,
    models=[c.model_dump(mode='json') for c in get_ai_config_store().all()],
    downscale=s.frame_downscale_longest_edge, load_concepts=s.sam_load_max_concepts,
    fingerprint=ai_config_fingerprint(), sam_version=SAM_PROMPT_VERSION,
    prompts=hashlib.sha256((_CLASSIFY_PROMPT+_NAME_LOAD_PROMPT).encode()).hexdigest(),
    cloudflare_hashes=sorted(BENCHMARK_MEDIA))))
"""


def runtime(base, *, require_b2=False):
    u = urlsplit(base)
    if (
        u.scheme != "http"
        or u.hostname not in {"127.0.0.1", "localhost", "::1"}
        or u.path
        or u.query
        or u.fragment
        or u.username
    ):
        raise ValueError(
            "BASE must be an HTTP loopback origin without a path or credentials"
        )
    ports = command(["docker", "compose", "port", "backend", "8000"]).splitlines()
    if not any(line.endswith(":" + str(u.port or 80)) for line in ports):
        raise ValueError("BASE port does not match the running Compose backend")
    r = container(RUNTIME)
    if not r["postgres"] or r["database_host"] != "db":
        raise ValueError("Backend must use the local Compose Postgres db service")
    if r["target"] != 60 or r["maximum"] != 60 or r["preserve"] or not r["ffmpeg"]:
        raise ValueError(
            "Require target/max=60, preserve_source_frames=false, ffmpeg and ffprobe"
        )
    if r["mock"] or not r["meta"] or (require_b2 and not r["b2"]):
        raise ValueError("Require live AI; B2 is needed only with --keep-footage")
    return r


def api(base, token, path, output, *, method="GET", body=None, clip=None):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    args = [
        "curl",
        "--disable",
        "--retry",
        "0",
        "--silent",
        "--show-error",
        "--connect-timeout",
        "10",
        "--max-time",
        "3600" if clip else "30",
        "--request",
        method,
        "--output",
        str(output),
        "--write-out",
        "%{http_code}",
        "--config",
        "-",
    ]
    # Keep bearer tokens out of process listings and logs; never follow redirects.
    auth = 'header = "Authorization: Bearer ' + token + '"\n'
    if any(c in token for c in '\r\n"\\'):
        raise ValueError("Invalid bearer token characters")
    if clip:
        args += ["--form", f"file=@{clip};type=video/mp4"]
    if body is not None:
        request_file = output.with_suffix(".request.json")
        save(request_file, body)
        args += [
            "--header",
            "Content-Type: application/json",
            "--data-binary",
            "@" + str(request_file),
        ]
    started = time.monotonic()
    with output.with_suffix(".stderr").open("w") as err:
        result = subprocess.run(
            args + [base + path],
            check=False,
            input=auth,
            text=True,
            stdout=subprocess.PIPE,
            stderr=err,
            cwd=ROOT,
        )
    status = result.stdout[-3:] if result.returncode == 0 else "000"
    save(
        output.with_suffix(".http.json"),
        {
            "status": status,
            "curl_exit": result.returncode,
            "seconds": round(time.monotonic() - started, 3),
            "finished_at": now(),
            "method": method,
            "path": path,
        },
    )
    return status


def get(base, token, path, out):
    status = api(base, token, path, out)
    if status != "200":
        raise ValueError(f"GET {path}: HTTP {status}; inspect {out}")
    return read(out)


def manifest(batch, start_video=None, end_video=None):
    if (start_video is None) != (end_video is None):
        raise ValueError("--start-video and --end-video must be supplied together")
    if start_video is None:
        start_video, end_video = (batch - 1) * 5 + 1, batch * 5
    if not 1 <= start_video <= end_video <= 50:
        raise ValueError("Selected video range must be within 001–050")
    clips = []
    for n in range(start_video, end_video + 1):
        paths = [
            p
            for p in (ROOT / "frontend/public/videos").glob(f"benchmark-{n:03d}-*.mp4")
            if not re.search(r"-(low|med|high)\.mp4$", p.name)
        ]
        if len(paths) != 1:
            raise ValueError(
                f"Expected one master clip for video {n:03d}; found {len(paths)}"
            )
        p = paths[0]
        clips.append(
            {
                "video": f"{n:03d}",
                "file": str(p.relative_to(ROOT)),
                "sha256": sha(p),
                "size_bytes": p.stat().st_size,
            }
        )
        if shutil.which("ffprobe"):
            clips[-1]["source_media"] = json.loads(
                command(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-select_streams",
                        "v:0",
                        "-show_entries",
                        "format=duration:stream=r_frame_rate,width,height,nb_frames",
                        "-of",
                        "json",
                        str(p),
                    ]
                )
            )
    if len({c["sha256"] for c in clips}) != len(clips):
        raise ValueError("Duplicate clip content in selected batch")
    return clips


def report(folder, truth=None):
    m = read(folder / "manifest.json")
    rows = []
    for clip in m["clips"]:
        state = folder / clip["video"] / "state.json"
        s = read(state) if state.exists() else {"status": "pending"}
        row = {
            "video": clip["video"],
            "status": s["status"],
            "ticket_id": s.get("ticket_id"),
            "fill_pct": None,
            "cost_usd": None,
            "seconds": s.get("seconds"),
            "models": "",
            "tokens_in": None,
            "tokens_out": None,
        }
        response = folder / clip["video"] / "ingest.json"
        if s.get("ticket_id") and response.exists():
            row["fill_pct"] = (
                (optional_json(response) or {}).get("valuation", {}).get("est_fill_pct")
            )
        pipeline = folder / clip["video"] / "pipeline.json"
        if pipeline.exists():
            stages = optional_json(pipeline)
            if isinstance(stages, list):
                row["models"] = ", ".join(
                    sorted({stage.get("model", "") for stage in stages} - {""})
                )
                tokens = [
                    re.search(
                        r"([\d,]+) in,\s*([\d,]+) out",
                        dict(stage.get("details") or []).get("Tokens", ""),
                    )
                    for stage in stages
                ]
                observed = [t for t in tokens if t]
                if observed:
                    row["tokens_in"] = sum(int(t[1].replace(",", "")) for t in observed)
                    row["tokens_out"] = sum(
                        int(t[2].replace(",", "")) for t in observed
                    )
                costs = [
                    dict(stage.get("details") or []).get("Cost") for stage in stages
                ]
                values = [
                    float(c.lstrip("$").replace(",", ""))
                    for c in costs
                    if isinstance(c, str) and re.fullmatch(r"\$?[\d,.]+", c)
                ]
                row["cost_usd"] = round(sum(values), 6) if values else None
        rows.append(row)
    summary = {
        "run_id": m["run_id"],
        "event_id": m.get("event_id"),
        "cache": m["cache"],
        "clips": rows,
        "recorded_cost_usd": round(sum(r["cost_usd"] or 0 for r in rows), 6),
        "cost_note": "Persisted successful stages only; failed requests may incur extra charges.",
    }
    if truth:
        with open(truth) as stream:
            expected = {
                str(int(r["video"])).zfill(3): float(r["fill_pct"])
                for r in csv.DictReader(stream)
            }
        errors = [
            abs(float(r["fill_pct"]) - expected[r["video"]])
            for r in rows
            if r["fill_pct"] is not None and r["video"] in expected
        ]
        summary["ground_truth"] = {
            "matched": len(errors),
            "mae": sum(errors) / len(errors) if errors else None,
        }
    save(folder / "summary.json", summary)
    with (folder / "summary.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps(summary, indent=2))
    return rows


def process_clip(folder, m, clip, token):
    dest = folder / clip["video"]
    statefile = dest / "state.json"
    s = read(statefile) if statefile.exists() else {"status": "pending"}
    if s["status"] == "complete" or STOP.is_set():
        return
    # An interrupted POST is NEVER replayed. A saved 201 response can be recovered.
    if s["status"] != "pending" and not s.get("ticket_id"):
        meta, response = dest / "ingest.http.json", dest / "ingest.json"
        saved_response = optional_json(response) or {}
        saved_http = optional_json(meta) or {}
        if saved_http.get("status") == "503" and saved_response.get("detail") == (
            "B2 storage is unavailable. The saved input can be retried later."
        ):
            # evidence_store.save raises this response while media is prepared,
            # before SAM/Muse receive the clip. Retrying is safe after disabling B2.
            s.update(status="pending", retry_reason="B2 unavailable before model calls")
            save(statefile, s)
            print(
                f"[{clip['video']}] confirmed pre-inference B2 failure; retrying in local-memory mode"
            )
        elif saved_http.get("status") == "201" and response.exists():
            s["ticket_id"] = str(UUID(read(response)["id"]))
        else:
            print(
                f"[{clip['video']}] ambiguous prior request: inspect local event; no resubmit"
            )
            return
    if s["status"] == "pending":
        if sha(ROOT / clip["file"]) != clip["sha256"]:
            raise ValueError("Source bytes changed since the run manifest was created")
        s = {"status": "submitting", "started_at": now(), "sha256": clip["sha256"]}
        save(statefile, s)  # Persist BEFORE sending any bytes.
        status = api(
            m["base"],
            token,
            f"/events/{m['event_id']}/ingest?bypass_cache="
            f"{str(m['cache'] == 'fresh').lower()}&keep_footage={str(m.get('keep_footage', False)).lower()}",
            dest / "ingest.json",
            method="POST",
            clip=ROOT / clip["file"],
        )
        s["seconds"] = read(dest / "ingest.http.json")["seconds"]
        s["status"] = "unknown"
        save(statefile, s)
        if status != "201":
            print(
                f"[{clip['video']}] HTTP {status}; held for review, no automatic POST retry"
            )
            return
        s["ticket_id"] = str(UUID(read(dest / "ingest.json")["id"]))
    s["status"] = "details_pending"
    save(statefile, s)
    for resource in ("ticket", "pipeline", "evidence"):
        suffix = "" if resource == "ticket" else "/" + resource
        get(
            m["base"],
            token,
            f"/tickets/{s['ticket_id']}{suffix}",
            dest / f"{resource}.json",
        )
    s.update(status="complete", finished_at=now())
    save(statefile, s)
    print(f"[{clip['video']}] complete: {s['ticket_id']}", flush=True)


def run(args, folder):
    token = os.environ.get("TOKEN", "")
    if args.token_file:
        token = Path(args.token_file).read_text().strip()
    if not token:
        raise ValueError("Set TOKEN or --token-file (never stored in run artifacts)")
    r = runtime(args.base, require_b2=args.keep_footage)
    clips = manifest(args.batch, args.start_video, args.end_video)
    if not args.keep_footage:
        cloudflare_hashes = set(r["cloudflare_hashes"])
        missing = [
            clip["video"] for clip in clips if clip["sha256"] not in cloudflare_hashes
        ]
        if missing:
            raise ValueError(
                "Videos lack Cloudflare playback mappings: " + ", ".join(missing)
            )
    if args.command == "run":
        folder.mkdir(parents=True, exist_ok=False)
        m = {
            "run_id": folder.name,
            "created_at": now(),
            "base": args.base,
            "batch": args.batch if args.start_video is None else None,
            "start_video": int(clips[0]["video"]),
            "end_video": int(clips[-1]["video"]),
            "cache": args.cache,
            "concurrency": args.concurrency,
            "clips": clips,
            "runtime": r,
            "keep_footage": args.keep_footage,
            "git": command(["git", "rev-parse", "HEAD"]),
            "event_id": args.event_id,
        }
        save(folder / "manifest.json", m)
    else:
        m = read(folder / "manifest.json")
        previous_keep = m.get("keep_footage", True)
        if args.command == "resume" and previous_keep and not args.keep_footage:
            known_b2_failures = True
            for clip in m["clips"]:
                prior = read(folder / clip["video"] / "state.json")
                response = optional_json(folder / clip["video"] / "ingest.json") or {}
                known_b2_failures &= (
                    prior.get("status") == "unknown"
                    and not prior.get("ticket_id")
                    and response.get("detail")
                    == "B2 storage is unavailable. The saved input can be retried later."
                )
            if not known_b2_failures:
                raise ValueError(
                    "Changing storage mode on resume requires only confirmed pre-inference B2 failures"
                )
            m["keep_footage"] = False
            m["storage_mode_migrated_at"] = now()
        r = runtime(args.base, require_b2=args.keep_footage)
        previous_runtime = dict(m["runtime"])
        comparable_runtime = dict(r)
        previous_runtime.pop("cloudflare_hashes", None)
        comparable_runtime.pop("cloudflare_hashes", None)
        if (
            previous_runtime != comparable_runtime
            or m["clips"] != clips
            or m["base"] != args.base
        ):
            raise ValueError(
                "Runtime, endpoint or input changed; resume refused. Create a new run."
            )
        m["runtime"] = r
        save(folder / "manifest.json", m)
    member = get(args.base, token, "/auth/me", folder / "member.json")
    if member.get("role") != "super_admin":
        raise ValueError("Fresh benchmarking requires a local SuperAdmin")
    events = get(args.base, token, "/events", folder / "events.json")
    if not m.get("event_id"):
        response = folder / "event-create.json"
        if (folder / "event-create-started.json").exists():
            if response.exists() and read(response).get("id"):
                m["event_id"] = str(UUID(read(response)["id"]))
            else:
                raise ValueError(
                    "Event creation is ambiguous; inspect local DB, do not create again"
                )
        else:
            source = next((e for e in events if e["id"] == args.rate_event_id), None)
            if not source or not source.get("rate_table"):
                raise ValueError("RATE_EVENT_ID must supply a rate table")
            save(folder / "event-create-started.json", {"started_at": now()})
            status = api(
                args.base,
                token,
                "/events",
                response,
                method="POST",
                body={
                    "name": "Benchmark " + m["run_id"],
                    "location": "Local benchmark",
                    "status": "active",
                    "tags": [],
                    "rate_table": source["rate_table"],
                },
            )
            if status != "201":
                raise ValueError(
                    "Event creation failed or ambiguous; inspect saved response"
                )
            m["event_id"] = str(UUID(read(response)["id"]))
        save(folder / "manifest.json", m)
        events = get(args.base, token, "/events", folder / "events.json")
    event = next((e for e in events if e["id"] == m["event_id"]), None)
    if not event or {"playground", "read-only"} & set(event.get("tags", [])):
        raise ValueError("Benchmark event is missing or read-only")
    m["tenant_id"] = event["tenant_id"]
    save(folder / "manifest.json", m)
    started = now()
    meta = ROOT / "logs/meta_api.jsonl"
    offset = meta.stat().st_size if meta.exists() else 0
    stamp = str(time.time_ns())
    attempt = {
        "started_at": started,
        "model_log_byte_offset": offset,
        "concurrency": args.concurrency,
    }
    save(folder / "logs" / f"attempt-{stamp}.json", attempt)
    try:
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=args.concurrency
        ) as pool:
            jobs = [pool.submit(process_clip, folder, m, clip, token) for clip in clips]
            for job in concurrent.futures.as_completed(jobs):
                try:
                    job.result()
                except (
                    ValueError,
                    OSError,
                    subprocess.CalledProcessError,
                    KeyError,
                ) as exc:
                    print(f"Clip needs review: {exc}", file=sys.stderr)
    finally:
        logs = folder / "logs"
        logs.mkdir(exist_ok=True)
        with (logs / f"backend-{stamp}.log").open("w") as stream:
            subprocess.run(
                [
                    "docker",
                    "compose",
                    "logs",
                    "--no-color",
                    "--since",
                    started,
                    "backend",
                ],
                check=False,
                cwd=ROOT,
                stdout=stream,
                stderr=subprocess.STDOUT,
            )
        if meta.exists():
            with (
                meta.open("rb") as stream,
                (logs / f"model-calls-{stamp}.jsonl").open("wb") as out,
            ):
                stream.seek(offset if meta.stat().st_size >= offset else 0)
                while block := stream.read(1024 * 1024):
                    out.write(block)
        rows = report(folder, args.truth)
        attempt["finished_at"] = now()
        save(folder / "logs" / f"attempt-{stamp}.json", attempt)
    return 0 if all(row["status"] == "complete" for row in rows) else 2


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "command",
        choices=[
            "plan",
            "run",
            "resume",
            "recover",
            "report",
            "export",
            "sync-plan",
            "sync",
        ],
        nargs="?",
        default="plan",
    )
    p.add_argument("--run-id", default=os.environ.get("RUN_ID"))
    p.add_argument(
        "--batch", type=int, choices=range(1, 6), default=int(os.getenv("BATCH", "1"))
    )
    p.add_argument(
        "--concurrency",
        type=int,
        choices=range(1, 26),
        default=int(os.getenv("CONCURRENCY", "5")),
    )
    p.add_argument("--start-video", type=int, help="First video number, 1–50")
    p.add_argument("--end-video", type=int, help="Last video number, 1–50")
    p.add_argument(
        "--cache", choices=["reuse", "fresh"], default=os.getenv("CACHE_MODE", "reuse")
    )
    p.add_argument("--base", default=os.getenv("BASE", "http://127.0.0.1:8000"))
    p.add_argument("--event-id", default=os.getenv("EVENT_ID"))
    p.add_argument(
        "--keep-footage",
        action="store_true",
        help="Store clips in B2. Benchmark clips use their existing Cloudflare playback by default.",
    )
    p.add_argument(
        "--rate-event-id",
        default=os.getenv("RATE_EVENT_ID", "22222222-2222-2222-2222-222222222222"),
    )
    p.add_argument(
        "--run-root",
        type=Path,
        default=Path(os.getenv("RUN_ROOT", "logs/reprocess-batches")),
    )
    p.add_argument("--token-file")
    p.add_argument(
        "--truth", help="CSV columns video,fill_pct for independent reference values"
    )
    p.add_argument(
        "--video", help="Video number for recovering an ambiguous submission"
    )
    p.add_argument(
        "--ticket-id", help="Existing local ticket to recover; never re-ingests"
    )
    p.add_argument(
        "--target-file", help="Private file containing only the Supabase Postgres URL"
    )
    p.add_argument(
        "--target-bucket", help="Confirm the deployed backend uses this B2 bucket"
    )
    p.add_argument(
        "--approve", help="Exact bundle SHA256 reviewed and approved by the user"
    )
    a = p.parse_args()
    os.chdir(ROOT)
    os.umask(0o077)
    if a.command == "plan":
        print(
            json.dumps(
                {
                    "batch": a.batch,
                    "cache": a.cache,
                    "concurrency": a.concurrency,
                    "start_video": a.start_video,
                    "end_video": a.end_video,
                    "clips": manifest(a.batch, a.start_video, a.end_video),
                    "writes": False,
                    "model_calls": 0,
                },
                indent=2,
            )
        )
        return 0
    if not a.run_id or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", a.run_id):
        p.error("--run-id is required (letters/digits/dots/dashes/underscores, max 80)")
    folder = a.run_root.resolve() / a.run_id
    lockfile = ROOT / "logs/.benchmark-batch.lock"
    lockfile.parent.mkdir(exist_ok=True)
    with lockfile.open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError(
                "Another benchmark command is active in this checkout"
            ) from None
        if a.command == "report":
            report(folder, a.truth)
            return 0
        if a.command in {"export", "sync-plan", "sync"}:
            return promotion(a, folder)
        if a.command == "recover":
            return recover(a, folder)
        if a.command == "resume":
            m = read(folder / "manifest.json")
            a.batch = m.get("batch") or 1
            a.start_video = m.get("start_video")
            a.end_video = m.get("end_video")
            a.cache, a.base = m["cache"], m["base"]

        def stop(signum, frame):
            STOP.set()
            print(
                "Stopping queued work; waiting for in-flight requests to finish safely.",
                flush=True,
            )

        signal.signal(signal.SIGINT, stop)
        signal.signal(signal.SIGTERM, stop)
        return run(a, folder)


def recover(args, folder):
    m = read(folder / "manifest.json")
    runtime(m["base"], require_b2=m.get("keep_footage", True))
    video = str(int(args.video or "0")).zfill(3)
    clip = next((c for c in m["clips"] if c["video"] == video), None)
    if not clip or not args.ticket_id:
        raise ValueError("Recover requires --video from this run and --ticket-id")
    statefile = folder / video / "state.json"
    s = read(statefile)
    if s["status"] == "complete":
        raise ValueError("Clip is already complete")
    helper = (ROOT / "scripts/benchmark_db.py").read_text()
    data = container(
        helper,
        {
            "action": "export",
            "event_id": m["event_id"],
            "tenant_id": m["tenant_id"],
            "tickets": [str(UUID(args.ticket_id))],
        },
    )
    if data["tables"]["ticket_evidence"][0]["content_hash"] != clip["sha256"]:
        raise ValueError("Ticket evidence does not match this input clip hash")
    token = (
        Path(args.token_file).read_text().strip()
        if args.token_file
        else os.getenv("TOKEN", "")
    )
    if not token:
        raise ValueError("TOKEN or --token-file is required for detail recovery")
    get(m["base"], token, "/tickets/" + args.ticket_id, folder / video / "ingest.json")
    s.update(ticket_id=args.ticket_id, status="details_pending", recovered_at=now())
    save(statefile, s)
    process_clip(folder, m, clip, token)
    report(folder, args.truth)
    return 0


def promotion(args, folder):
    helper = (ROOT / "scripts/benchmark_db.py").read_text()
    bundle = folder / "promotion.json"
    if args.command == "export":
        m = read(folder / "manifest.json")
        runtime(m["base"], require_b2=m.get("keep_footage", True))
        rows = report(folder)
        if any(r["status"] != "complete" for r in rows):
            raise ValueError("Export requires every selected clip to be complete")
        data = container(
            helper,
            {
                "action": "export",
                "event_id": m["event_id"],
                "tenant_id": m["tenant_id"],
                "tickets": [r["ticket_id"] for r in rows],
            },
        )
        save(bundle, data)
        print(f"Review bundle: {bundle}\nSHA256: {sha(bundle)}")
        return 0
    if not args.target_file:
        raise ValueError(
            "--target-file is required; credentials are never saved in the run"
        )
    bundle_bytes = bundle.read_bytes()
    digest = hashlib.sha256(bundle_bytes).hexdigest()
    if args.command == "sync" and args.approve != digest:
        raise ValueError(
            "Sync requires explicit user approval: --approve <reviewed bundle SHA256>"
        )
    target = Path(args.target_file).read_text().strip()
    result = container(
        helper,
        {
            "action": args.command,
            "bundle": json.loads(bundle_bytes),
            "target": target,
            "target_bucket": args.target_bucket,
        },
    )
    save(
        folder / f"{args.command}-{time.time_ns()}.json",
        dict(bundle_sha256=digest, **result),
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.CalledProcessError, KeyError) as exc:
        message = (
            "Subprocess failed; see diagnostic output above"
            if isinstance(exc, subprocess.CalledProcessError)
            else str(exc)
        )
        print(f"ERROR: {message}", file=sys.stderr)
        sys.exit(1)
