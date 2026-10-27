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
| `pipeline.sh <clip>` | Run the full video-to-ticket pipeline on one clip (cached) | planned |
| `benchmark.sh` | Run the 50+ clip accuracy benchmark, assert ±10% target | planned |

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
