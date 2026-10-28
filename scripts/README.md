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
| `db-migrate.sh` | Apply Alembic migrations + verify RLS on tenant tables | planned |
| `live-check.sh [clip]` | Verify the Meta Model API key and, with a clip, run the full pipeline live (`make live-check CLIP=…`) | **present** |
| `meta-log.sh [N]` | One line per recorded Meta API call from `logs/meta_api.jsonl` (`make meta-log N=50`) | **present** |
| `pipeline.sh <clip>` | Run the full video-to-ticket pipeline on one clip (cached) | planned |
| `benchmark.sh` | Run the known-volume fill-% benchmark over `data_bench/`, write `results.json` | **present** |
| `precache-demo.sh` | Ingest the demo clips once so the demo arc replays from the durable cache | **present** |

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
