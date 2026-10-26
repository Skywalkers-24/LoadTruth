# LoadTruth Backend

FastAPI (Python 3.12, async-first) backend for the video-to-ticket pipeline and the multi-tenant API. See [../PLAN.md](../PLAN.md) for the full design and [../.kiro/steering/agent-protocol.md](../.kiro/steering/agent-protocol.md) for the operating rules.

## Requirements

- **Python 3.12** specifically. The system `python3` on this machine is 3.9; use `/opt/homebrew/bin/python3.12` (or any 3.12). `scripts/setup.sh` handles this for you.
- PostgreSQL (via Supabase) and Redis for the background worker.

## Setup

From the repo root:

```bash
./scripts/setup.sh      # creates backend/.venv on Python 3.12 and installs deps
```

Or manually:

```bash
cd backend
/opt/homebrew/bin/python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Run

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
# http://localhost:8000/health   ·   http://localhost:8000/docs
```

## Quality gates

```bash
./scripts/eval.sh       # ruff, mypy --strict, bandit, pip-audit, pytest --cov
```

## Layout

```
backend/
  app/
    __init__.py
    config.py      # pydantic-settings, validated on boot (reads repo-root .env)
    logging.py     # structured JSON logging (structlog)
    main.py        # FastAPI app + /health
    # next: api/ (routers), db/ (SQLAlchemy models + session), pipeline/ (SAM+Spark stages),
    #       anomalies/, chat/ (analyst), worker.py (ARQ)
  tests/
  pyproject.toml   # deps + ruff/mypy/pytest/coverage config
```
