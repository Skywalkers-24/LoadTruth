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

### Changed
- _(none)_

### Fixed
- _(none)_

### Removed
- _(none)_
