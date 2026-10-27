# LoadTruth — local task entry points.
#
# Philosophy: keep local friction LOW. The heavy, exhaustive gate (mypy,
# bandit, pip-audit, coverage, secrets scan) lives in GitHub CI
# (.github/workflows/ci.yml) and in `scripts/eval.sh`. Day-to-day you only need
# the fast targets below; reach for `make ci` only when you want to reproduce
# the full CI gate before pushing.
#
#   make check   fast lint (ruff + eslint) — the quick "is it sane?" pass
#   make fmt     auto-format backend + frontend
#   make test    quick tests (no coverage) — fast feedback
#   make ci      the FULL gate CI runs (slow; mirrors scripts/eval.sh)
#
# Backend commands assume the venv at backend/.venv (see scripts/setup.sh).

BACKEND := backend
FRONTEND := frontend
PY := $(BACKEND)/.venv/bin

.DEFAULT_GOAL := check
.PHONY: check fmt test ci check-be check-fe test-be test-fe

# ── Fast local checks (low friction) ────────────────────────────────────────
check: check-be check-fe ## Fast lint only — no type-check, no coverage.

check-be:
	@echo "==> ruff lint (backend)"
	@cd $(BACKEND) && .venv/bin/ruff check .

check-fe:
	@echo "==> eslint (frontend)"
	@cd $(FRONTEND) && npx --no-install eslint .

# ── Auto-format ──────────────────────────────────────────────────────────────
fmt:
	@echo "==> ruff format (backend)"
	@cd $(BACKEND) && .venv/bin/ruff format . && .venv/bin/ruff check --fix .
	@echo "==> prettier (frontend)"
	@cd $(FRONTEND) && npm run format

# ── Quick tests (no coverage, fast) ──────────────────────────────────────────
test: test-be test-fe

test-be:
	@echo "==> pytest (backend, no coverage)"
	@cd $(BACKEND) && .venv/bin/pytest -q

test-fe:
	@echo "==> vitest (frontend, no coverage)"
	@cd $(FRONTEND) && npx --no-install vitest run

# ── Full gate (what CI runs) — slow, use before pushing ──────────────────────
ci:
	@echo "==> full quality gate (mirrors GitHub CI)"
	@./scripts/eval.sh
