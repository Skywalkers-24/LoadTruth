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
| `pipeline.sh <clip>` | Run the full video-to-ticket pipeline on one clip (cached) | planned |
| `benchmark.sh` | Run the 50+ clip accuracy benchmark, assert ±10% target | planned |

As each script is implemented, flip its status to **present** and add usage notes below.

## Usage notes

### eval.sh
Runs every quality gate locally. Must pass clean before a task is "done". Currently a stub that runs whatever tools are installed and skips the rest with a notice — fill in as the backend/frontend land.
