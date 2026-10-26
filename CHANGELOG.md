# Changelog

All notable changes to LoadTruth are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Add an entry in the same change that makes the modification.

## [Unreleased]

### Added
- Full multi-tenant platform plan in `PLAN.md` (tenancy + 5-role RBAC via Supabase RLS, lean admin, dashboard/reports with FEMA audit-packet export, read-only Muse Spark analyst chat).
- Agent operating protocol at `.kiro/steering/agent-protocol.md` (auto-included every session): progress tracking, changelog, lessons-learned, reusable scripts, periodic open-source code evaluation, UI/DB/test/logging standards, definition of done.
- Living tracking docs: `docs/PROGRESS.md`, `docs/LESSONS.md`, this changelog.
- `scripts/` scaffold with `scripts/README.md`, a working `scripts/eval.sh` quality gate, and `scripts/setup.sh` / `scripts/dev.sh`.
- **Backend** (`backend/`): FastAPI 0.141 on Python 3.12, async-first. `pyproject.toml` with pinned deps + ruff/mypy-strict/pytest/coverage config; `app/config.py` (pydantic-settings, validated on boot), `app/log.py` (structlog JSON logging), `app/main.py` (`/health` + lifespan). Smoke tests passing.
- **Frontend** (`frontend/`): Next.js 16 App Router, React 19, TypeScript strict (`noUncheckedIndexedAccess`), Tailwind v4 operator-console theme, Supabase + TanStack Query deps. Mobile-first landing page, `HealthBadge` Server Component, typed backend `api` client, vitest tests passing, flat ESLint + Prettier.
- `infra/README.md` describing the planned Supabase schema/RLS/migrations layer.
- `.env.example` documenting all environment variables (no secrets).
- **CI/CD** (`.github/workflows/`): `ci.yml` (backend ruff/mypy/bandit/pytest + frontend eslint/tsc/prettier/vitest/build + cached Docker image builds, concurrency-cancelled), `codeql.yml` (CodeQL for Python + JS/TS, gitleaks secret scan, weekly schedule), `deploy.yml` (manual-dispatch, free-tier Fly/Vercel, no-ops without secrets).
- **Docker**: multi-stage `backend/Dockerfile` (Python 3.12 + ffmpeg, non-root, healthcheck, honors `$PORT`), `frontend/Dockerfile` (Next.js standalone output, non-root), `docker-compose.yml` for local full stack (backend, frontend, Postgres, Redis), and `.dockerignore` files. Frontend set to `output: "standalone"`.
- **Docs**: `docs/DEPLOYMENT.md` (zero-budget free-tier targets + layered caching strategy — model-result cache, HTTP/RSC cache, edge/CDN, Redis, CI build cache), `docs/ARCHITECTURE_MAP.md` (the "where does this change go" mental map every new chat reads first).
- Root `.gitignore` hardened (secrets, venv, node_modules, Next, logs).

### Changed
- Agent protocol (`.kiro/steering/agent-protocol.md`): session-start now reads the architecture map first; added §4a (offload work locally to cut token usage) and §4b (agent- and code-level parallelism/multithreading).
- Made Python 3.12 the default for the user's shell via `~/.zshrc` (Homebrew `python@3.12` on PATH + aliases), without replacing the macOS system `/usr/bin/python3`.

### Fixed
- Renamed `backend/app/logging.py` to `log.py` (shadowed stdlib), fixed hatchling packaging, resolved ruff/mypy findings, and switched the frontend to a flat ESLint config (FlatCompat crashed under ESLint 9).

### Infrastructure
- `git init` on `main`; created **private** GitHub repo `Skywalkers-24/loadtruth` and pushed the initial scaffold.
