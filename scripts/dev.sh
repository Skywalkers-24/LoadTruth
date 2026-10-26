#!/usr/bin/env bash
# Start backend + frontend for local dev. Run this manually in a terminal
# (it runs long-lived servers). Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "==> Backend on :8000"
( cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000 ) &

echo "==> Frontend on :3000"
( cd frontend && npm run dev ) &

wait
