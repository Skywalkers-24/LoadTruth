#!/usr/bin/env bash
# One-shot dev setup for both folders. Idempotent. See agent-protocol.md §4.
#   - backend/.venv on Python 3.12 (system python3 here is 3.9; we pin 3.12)
#   - frontend npm install
set -euo pipefail
cd "$(dirname "$0")/.."

# Pick a Python 3.12 interpreter.
PY312="${PYTHON312:-}"
if [ -z "$PY312" ]; then
  if command -v python3.12 >/dev/null 2>&1; then
    PY312="$(command -v python3.12)"
  elif [ -x /opt/homebrew/bin/python3.12 ]; then
    PY312=/opt/homebrew/bin/python3.12
  else
    echo "ERROR: Python 3.12 not found. Install it (brew install python@3.12) or set PYTHON312." >&2
    exit 1
  fi
fi
echo "==> Using Python: $("$PY312" --version) ($PY312)"

echo "==> Backend: venv + deps"
cd backend
if [ ! -d .venv ]; then
  "$PY312" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --quiet --upgrade pip
pip install --quiet -e ".[dev]"
deactivate
cd ..

echo "==> Frontend: npm install"
cd frontend
npm install
cd ..

echo "==> Env file"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    created .env from .env.example — set MODEL_API_KEY and Supabase vars."
else
  echo "    .env already present (left untouched)."
fi

echo "==> Done. Start dev with: ./scripts/dev.sh"
