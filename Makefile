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
#   make up      rebuild + start the app in Docker (frontend :3000, backend :8000)
#   make down    stop the Docker stack
#   make logs    follow the Docker logs
#   make live-check [CLIP=path]  verify the Meta key, optionally run one clip live
#   make meta-log [N=50]         summarize logs/meta_api.jsonl (every Meta call)
#
# Backend commands assume the venv at backend/.venv (see scripts/setup.sh).

BACKEND := backend
FRONTEND := frontend
PY := $(BACKEND)/.venv/bin

.DEFAULT_GOAL := check
.PHONY: check fmt test ci check-be check-fe test-be test-fe test-root test-all eval bench eval-private up down logs live-check meta-log db-migrate docker-build docker-test docker-up docker-down

# ── Multi-Stage Container Lifecycle ─────────────────────────────────────────
docker-build: ## Build multi-stage Docker images for backend and frontend
	@echo "==> building multi-stage backend container"
	docker build -t loadtruth-backend:latest ./backend
	@echo "==> building multi-stage frontend container"
	docker build -t loadtruth-frontend:latest ./frontend

docker-test: ## Run tests inside containerized multi-stage tester targets
	@echo "==> testing backend in multi-stage container"
	docker build --target tester ./backend
	@echo "==> testing frontend in multi-stage container"
	docker build --target tester ./frontend

docker-up: up
docker-down: down

# ── Run the app (always Docker, standard ports) ─────────────────────────────
up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

# Calls Meta (costs a few cents with a CLIP). Runs in the backend container so
# ffmpeg is available; start the stack first with `make up`.
live-check:
	@./scripts/live-check.sh --docker $(CLIP)

# One line per recorded Meta API call (full exchanges in logs/meta_api.jsonl).
meta-log:
	@./scripts/meta-log.sh $(N)

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
test: test-be test-fe test-root

test-root:
	@echo "==> pytest (root tests)"
	@$(PY)/pytest tests/ -q

test-all: test-be test-fe test-root

test-be:
	@echo "==> pytest (backend, no coverage)"
	@cd $(BACKEND) && .venv/bin/pytest -q

test-fe:
	@echo "==> vitest (frontend, no coverage)"
	@cd $(FRONTEND) && npx --no-install vitest run

# ── Quantitative Evaluation & Benchmarking ──────────────────────────────────
eval:
	@echo "==> running evaluation benchmark suite"
	@$(PY)/python3 -m eval.runner

bench: eval

eval-private:
	@echo "==> running private/offline audit benchmark (Muse Spark Open)"
	@$(PY)/python3 eval/run_private_audit.py

# ── Full gate (what CI runs) — slow, use before pushing ──────────────────────
ci:
	@echo "==> full quality gate (mirrors GitHub CI)"
	@./scripts/eval.sh

# Apply backend Alembic revisions to DATABASE_URL from the repo-root .env.
db-migrate:
	@cd $(BACKEND) && .venv/bin/alembic upgrade head
