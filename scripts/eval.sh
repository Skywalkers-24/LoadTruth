#!/usr/bin/env bash
# Open-source code quality gate. Mirrors what an automated "AI judge" code check
# would run, so passing this locally means passing there. See
# .kiro/steering/agent-protocol.md §5. Run before finishing any substantial task.
#
# This is intentionally tolerant while the repo is scaffolding: each tool runs
# only if it's installed and the relevant project exists, otherwise it's skipped
# with a notice. As the backend/frontend land, the skips disappear.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
run() {  # run <label> <cmd...>
  local label="$1"; shift
  if command -v "$1" >/dev/null 2>&1; then
    echo "==> $label"
    if "$@"; then echo "    ok"; else echo "    FAILED"; fail=1; fi
  else
    echo "==> $label (skipped: '$1' not installed)"
  fi
}

echo "LoadTruth code evaluation"
echo "========================="

# --- Python backend ---
if [ -d backend ]; then
  pushd backend >/dev/null
  if [ -d .venv/bin ]; then
    export PATH="$PWD/.venv/bin:$PATH"
  fi
  run "ruff lint"         ruff check .
  run "ruff format"       ruff format --check .
  run "mypy (strict)"     mypy --strict .
  run "bandit (security)" bandit -q -r app
  run "pip-audit (deps)"  pip-audit
  run "pytest"            pytest -q
  popd >/dev/null
else
  echo "==> backend/ (skipped: not scaffolded yet)"
fi

# --- TypeScript / Next.js frontend ---
if [ -d frontend ]; then
  pushd frontend >/dev/null
  run "eslint"           npx --no-install eslint .
  run "tsc (noEmit)"     npx --no-install tsc --noEmit
  run "prettier"         npx --no-install prettier --check .
  run "vitest"           npx --no-install vitest run
  popd >/dev/null
else
  echo "==> frontend/ (skipped: not scaffolded yet)"
fi

# --- SQL / migrations ---
if [ -d infra ]; then
  run "sqlfluff lint" sqlfluff lint infra
fi

# --- Secrets scan (always) ---
run "gitleaks (secrets)" gitleaks detect --no-banner

echo "========================="
if [ "$fail" -ne 0 ]; then
  echo "RESULT: FINDINGS — fix before marking the task done."
  exit 1
fi
echo "RESULT: clean"
