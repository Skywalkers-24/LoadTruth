# scripts/ — reusable task entry points

Per the agent protocol (`.kiro/steering/agent-protocol.md` §4): if a task runs more than once, it lives here as a script and is called by name. This avoids re-pasting command sequences into chat (wastes tokens) and keeps behavior consistent across agents and sessions.

Conventions: bash scripts start with `set -euo pipefail`, are idempotent, print what they do, and read config from `.env`. A `Makefile`/`justfile` may wrap them.

| Script | Purpose | Status |
|---|---|---|
| `setup.sh` | One-shot dev setup: Python 3.12 venv + backend deps, frontend `npm install`, env check | **present** |
| `dev.sh` | Start backend (:8000) + frontend (:3000) for local dev (run manually in a terminal) | **present** |
| `lint.sh` | Lint + format check (ruff, eslint, prettier, sqlfluff) | planned |
| `test.sh` | Run backend `pytest --cov` + frontend `vitest` + Playwright | planned |
| `eval.sh` | Full open-source quality gate the "AI judge" check mirrors (see protocol §5) | **present (stub)** |
| `make db-migrate` | Apply backend Alembic migrations (Supabase RLS SQL remains in `infra/rbac/`) | Makefile target |
| `live-check.sh [clip]` | Verify the Meta Model API key and, with a clip, run the full pipeline live (`make live-check CLIP=…`) | **present** |
| `meta-log.sh [N]` | One line per recorded Meta API call from `logs/meta_api.jsonl` (`make meta-log N=50`) | **present** |
| `pipeline.sh <clip>` | Run the full video-to-ticket pipeline on one clip (cached) | planned |
| `benchmark.sh` | Run the known-volume fill-% benchmark over `data_bench/`, write `results.json` | **present** |
| `reprocess-benchmark-batch.sh` | Plan/run/resume local Docker benchmarks, report costs, export and explicitly approve Supabase promotion | **present** |
| `precache-demo.sh` | Ingest the demo clips once so the demo arc replays from the durable cache | **present** |
| `sam-probe.sh <hash> <phrase…> [--measure]` | Try SAM concept phrases on a stored evidence clip (~$0.01 per phrase); `--measure` runs the fill measurement offline (bed=1st phrase, rim=2nd, loads=rest) | **present** |

As each script is implemented, flip its status to **present** and add usage notes below.

## Usage notes

### eval.sh
Runs every quality gate locally. Must pass clean before a task is "done". Currently a stub that runs whatever tools are installed and skips the rest with a notice — fill in as the backend/frontend land.

### live-check.sh
Checks the live Meta setup after you add `MODEL_API_KEY` to `.env`. With no arguments it makes one tiny Muse Spark call (a fraction of a cent) to confirm the key, endpoint, and model. With a clip path it runs the whole pipeline live on that clip, without the database or the durable cache, and prints every stage, the drafted ticket, the anomalies, and the dollar cost.

- `make live-check` / `make live-check CLIP=data_tests/ordinary__random-haul.mp4` runs inside the backend container (ffmpeg available, so the clip is resampled before it is sent).
- `scripts/live-check.sh clip.mp4` runs on the host venv. Without ffmpeg on the host the original clip is sent, which costs more SAM frames.
- `--truck=FL-DT-3391` treats that truck number as certified at 20 CY, so the clip run shows a capacity match.

Exit codes: 0 ok, 1 the API rejected a call (the error class, status, and code are printed), 2 missing key or clip.

### benchmark.sh
Runs the real pipeline over every clip in `data_bench/ground_truth.csv` and writes `data_bench/results.json` with MAE, RMSE, the share within 10 points, and the error broken down by material, angle, and lighting. This is the independent known-volume accuracy number, distinct from agreement with the monitor. Clip files live in `data_bench/clips/` (gitignored); the manifest and results are committed. Override paths with `CLIPS=`, `TRUTH=`, `OUT=`; run `MOCK_AI=1 scripts/benchmark.sh` for a zero-credit dry run against fixtures.

### precache-demo.sh
Ingests every clip in a demo directory once so each clip's SAM + Spark stage results and evidence media are persisted in the durable store (the `AIStageResult` table plus the evidence dir, both on volumes that survive a container rebuild). After it runs, the demo arc replays from cache with no model call. Needs `EVENT_ID` and a signed-in `TOKEN` (the app's localStorage `loadtruth-token`); `BASE` and `DEMO_CLIPS` default to the local backend and `data_bench/clips`.

### meta-log.sh
Every Meta Model API exchange (Spark responses, streamed SAM responses, file uploads and deletes, and failures) is appended to `logs/meta_api.jsonl` by `backend/app/ai/api_log.py`. Each line holds the redacted request (inline media becomes `<inline video/mp4, N bytes>`; the key is never written), status, latency, usage, stream event counts, and the output text (truncated past `MODEL_API_LOG_MAX_CHARS`, default 200,000). In Docker the file is mounted from `./logs`. Read the summary first; open a full line only when you need the raw output. Set `MODEL_API_LOG_PATH=` (empty) to turn recording off.

### reprocess-benchmark-batch.sh

Reusable local benchmark workflow. The shell entry point delegates orchestration to
`benchmark_batch.py`; `benchmark_db.py` runs inside the existing backend container for
read-only exports and explicitly approved promotion. No extra backend replicas are needed.
Requires Python 3.11+, curl and Docker Compose. Host ffprobe is optional for source metadata;
ffmpeg/ffprobe inside the backend are required for the 60-frame processing configuration.

**Default is a zero-inference plan.** A batch contains five masters: batch 1 selects
001–005, through batch 5 selecting 021–025. Low/medium/high playback variants are excluded.

```bash
scripts/reprocess-benchmark-batch.sh plan --batch 1

# Authenticate in the local app; save its bearer token to a private file outside the repo.
# Fresh is intentional when measuring newly changed prompts or models.
scripts/reprocess-benchmark-batch.sh run --run-id fill-v2-b1 --batch 1 \
  --cache fresh --concurrency 5 --token-file /private/tmp/loadtruth-token

# Resume the SAME run: skips completed clips, retries detail GETs, never retries an ingest POST.
scripts/reprocess-benchmark-batch.sh resume --run-id fill-v2-b1 \
  --token-file /private/tmp/loadtruth-token

# Offline reports, optionally compared against independently measured reference percentages.
scripts/reprocess-benchmark-batch.sh report --run-id fill-v2-b1
scripts/reprocess-benchmark-batch.sh report --run-id fill-v2-b1 --truth data_bench/reference.csv

# Process a larger contiguous range as one checkpointed job. Raise local backend
# worker count separately so CPU-bound response parsing can use multiple cores.
BACKEND_WORKERS=10 docker compose up -d --force-recreate backend
scripts/reprocess-benchmark-batch.sh plan --start-video 26 --end-video 50 --concurrency 25
scripts/reprocess-benchmark-batch.sh run --run-id fill-v2-026-050 \
  --start-video 26 --end-video 50 --cache fresh --concurrency 25 \
  --token-file /private/tmp/loadtruth-token
```

Reference CSV columns are `video,fill_pct`, with video numbers 1–50. Reports contain
per-video fill, status, ticket ID, elapsed ingest time, models, token counts and persisted stage costs, plus MAE
when reference values are supplied. Unknown/failed request charges are **not** counted as
zero spend: `recorded_cost_usd` covers only available successful-stage traces. Inspect raw
model logs for failures/retries and provider billing for the final charge.

For routine replay, omit `--cache fresh` (default `reuse`) so existing stage results can be
reused. Reuse is not an accuracy evaluation of a new prompt: old cached results may remain,
and cache misses/staleness checks or explanation calls can still spend credits. A fresh
experiment needs a new descriptive run ID. A run's cache mode, source hashes, runtime model
configuration and prompt fingerprints are frozen; changed runtime/input refuses resume.
Concurrency is adjustable from 1 to 25 to balance local memory and provider rate limits.
`TOKEN`, `BASE`, `BATCH`, `CONCURRENCY`, `CACHE_MODE`, `EVENT_ID`, `RATE_EVENT_ID`, `RUN_ID`,
and `RUN_ROOT` remain supported as environment variables. Default artifacts live under
`logs/reprocess-batches/<run-id>/` with private file permissions. Old one-shot directories
without `manifest.json` are not resumed or automatically replayed.

Preflight verifies the loopback API port belongs to the Compose backend, whose database
host must be the Compose Postgres `db` service. SQLite and remote database hosts are refused.
The backend must use target/max 60 frames, source-frame preservation disabled, ffmpeg/ffprobe
and live AI. Selected hashes must exist in the backend's Cloudflare benchmark map. By default
`keep_footage=false`: tickets, pipeline details, anomalies and SAM masks are saved in Docker
Postgres; the known Cloudflare video supplies playback. This avoids B2 storage calls. Use
`--keep-footage` to store clip media in B2 for non-Cloudflare footage. This validates
configuration; it does not guarantee a corrupt or very short source can produce 60 frames.
Muse retains its configured keyframe budget; the script does not increase it.

A new local event is created per run unless `--event-id`/`EVENT_ID` selects a writable one.
Rates are copied from `RATE_EVENT_ID` (default seed event). Requests go through the backend
HTTP ingest endpoint. One checkout-wide advisory lock prevents concurrent benchmark scripts,
including runs using different artifact roots. It does not lock unrelated UI ingests, other
checkouts, or other clients: avoid running those against the same clips during benchmarking.

Every POST has a durable pre-send checkpoint. HTTP errors/timeouts are held for review,
because the backend may have processed a request whose response was lost. Resume never
replays ambiguous requests; it allows retry after the backend's explicit B2-unavailable
response, which occurs before model calls. A saved 201 response can be recovered by `resume`.
If the ticket exists locally but the response was lost, inspect the event and explicitly attach it:

```bash
scripts/reprocess-benchmark-batch.sh recover --run-id fill-v2-b1 --video 001 \
  --ticket-id EXISTING_LOCAL_TICKET_UUID --token-file /private/tmp/loadtruth-token
```

Recovery verifies the ticket's tenant, event, and original content hash before fetching its
details; it makes no ingest call. If no ticket exists, review server logs before deciding
whether to start a new run. Ctrl-C stops queued work and waits for in-flight requests to
finish; killing the process leaves pre-send markers that block accidental replay.

Artifacts include source hashes/ffprobe metadata, runtime and Git fingerprints, the event
request/response, each ingest response and HTTP status/timing, ticket/pipeline/evidence JSON,
checkpoint state, CSV/JSON summary, and backend/redacted model log slices for each attempt.
Logs may include unrelated traffic within that time window. A saved byte offset/start time
allows manual log recovery after a hard kill. Tokens and database URLs are not written to
artifacts or passed as command-line arguments.

#### Review locally, then promote the approved results

Export after all five tickets are complete; this reads local Postgres and makes no AI calls:

```bash
scripts/reprocess-benchmark-batch.sh export --run-id fill-v2-b1
```

This creates `promotion.json` and prints its SHA256. It contains only the selected event,
tickets, anomalies, pipeline traces and SAM evidence. It excludes users, credentials, global
AI caches, and unrelated tickets. Media stays in B2, so the deployed backend must use the
same bucket; the bundle does not copy or freeze media objects. The Supabase target must have
compatible application migrations and the same existing tenant ID. No tenant remapping or
schema migration is performed by this workflow.

After local review, place the Supabase Postgres URL in a private file outside the repository.
The following command is **read-only** and checks row conflicts and existing tenant/schema:

```bash
scripts/reprocess-benchmark-batch.sh sync-plan --run-id fill-v2-b1 \
  --target-file /private/tmp/loadtruth-supabase-url
```

**Only after the user explicitly approves that reviewed bundle**, run:

```bash
scripts/reprocess-benchmark-batch.sh sync --run-id fill-v2-b1 \
  --target-file /private/tmp/loadtruth-supabase-url \
  --approve EXACT_REVIEWED_BUNDLE_SHA256
```

Promotion uses TLS and a single insert-only transaction. Identical rows are skipped on
repeat sync; conflicting IDs abort the entire transaction. Existing production records,
truck registry, caches and users are never overwritten. This adds a reviewable benchmark
event; it does not replace existing production benchmark tickets or frontend JSON fixtures.
No run/resume/export command calls Supabase. Agents must not infer user approval or
self-approve by calculating the hash; the flag records the user's explicit approval.

Checks without paid inference:
`backend/.venv/bin/python -m unittest discover -s scripts/tests -v`.
