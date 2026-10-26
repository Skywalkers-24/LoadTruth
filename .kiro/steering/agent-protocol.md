# Agent Operating Protocol (read every session)

This file is auto-included in every agent interaction on the LoadTruth repo. **Every LLM/agent — regardless of model — must follow it.** It exists so work compounds across sessions instead of resetting, and so the code passes an automated "AI judge" code check cleanly. Read it, then read the three living docs it points at before doing non-trivial work.

Project context: see [PLAN.md](../../PLAN.md), [Readme.md](../../Readme.md), [Hackathon.md](../../Hackathon.md).

---

## 0. The first thing you do each session

1. Read `docs/ARCHITECTURE_MAP.md` → the mental map of where every kind of change goes. Use it to locate the target of your change **before** searching or reading broadly.
2. Read `docs/PROGRESS.md` → what is done, what is in progress, what is next.
3. Read `docs/LESSONS.md` → mistakes already made. **Never repeat a logged mistake.**
4. Skim `CHANGELOG.md` → recent changes.
5. Check `scripts/` → reuse an existing script before writing new code or re-running a manual sequence.

Only after those five do you plan the task. The map + progress + lessons together are the "shared memory" that lets a fresh chat act without re-deriving context.

Keep the map current: when you add a module, move responsibility, or create a new kind of surface, update the matching row in `docs/ARCHITECTURE_MAP.md` in the same change.

---

## 1. Progress tracking (always keep current)

`docs/PROGRESS.md` is the single source of truth for state. Update it **at the start and end of every unit of work** — not just at the end.

- Keep three sections current: **Done**, **In progress**, **Next**.
- Each item: one line, dated, with the files touched and the exit check that proves it works.
- When you start a task, move it to **In progress** with a timestamp. When it passes its exit check, move it to **Done**.
- Never let PROGRESS.md drift from reality. If you discover it's wrong, fix it first.

## 2. Changelog (every meaningful change)

Maintain `CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com/) style under an `## [Unreleased]` heading with `Added / Changed / Fixed / Removed` groups. Add an entry for every meaningful change in the same commit as the change. Reference the PR or commit.

## 3. Lessons learned — never repeat a mistake

`docs/LESSONS.md` is append-only. Whenever something breaks, a command fails, an assumption was wrong, or a fix took more than one attempt, **log it**: what happened, the root cause, the fix, and the rule to prevent recurrence. Before implementing anything in an area with a past lesson, re-read that lesson. Repeating a logged mistake is the one unacceptable failure here.

## 4. Build reusable scripts — do not burn tokens on repeated tasks

If a task is done more than once (setup, migrations, running the pipeline on a clip, benchmarking, lint/type/test, eval, deploy), **turn it into a script in `scripts/`** and call the script thereafter. Do not paste long command sequences into chat on each run — that wastes tokens and invites drift.

- Scripts are idempotent, have `set -euo pipefail` (bash) or equivalent, print what they do, and are documented in `scripts/README.md`.
- Prefer one entry point per task: `scripts/setup.sh`, `scripts/dev.sh`, `scripts/test.sh`, `scripts/lint.sh`, `scripts/eval.sh`, `scripts/pipeline.sh <clip>`, `scripts/benchmark.sh`, `scripts/db-migrate.sh`.
- A Makefile (or `justfile`) may wrap them for ergonomics.

## 4a. Offload work locally — minimize token usage

Tokens are a budget. Do work on the machine instead of in the model whenever possible.

- **Prefer tools over narration.** Run commands, scripts, linters, formatters, tests, and searches locally; read the result, don't reason it out in prose. Let `scripts/*.sh` do multi-step work and report a short status.
- **Don't paste large outputs into context.** Pipe long output to a log file and read only the tail / the lines you need. Summarize; never echo a whole build log or file dump back.
- **Let formatters/codegen fix mechanical things.** Run `ruff format` / `prettier --write` and codegen rather than hand-editing style. Don't spend tokens on what a tool does deterministically.
- **Cache and reuse.** If an answer (versions, schema, file list) was already computed this session or lives in a doc, reuse it — don't re-run or re-read.
- **Batch file edits.** Make several independent edits/tool calls in one step rather than a chatty back-and-forth.
- **Read narrowly.** Use grep/symbol search and line ranges instead of reading whole large files.

## 4b. Parallelism & multithreading — do multiple works at once

Both at the agent level and in the product code.

- **Agent level:** issue independent tool calls in parallel (multiple reads/searches/edits in one turn); dispatch independent sub-tasks to sub-agents concurrently; start a long background job and keep working while it runs (poll its log), per the fast-background-commands skill.
- **Product code — backend:** the API and pipeline are async-first. Run independent I/O concurrently with `asyncio.gather` (e.g. uploading frames while issuing the SAM request). For the pipeline, process independent clips in parallel workers (ARQ concurrency); within a clip, run independent stages concurrently where they don't depend on each other (e.g. debris classification while geometry computes). Use a process/thread pool (`run_in_executor`) for CPU-bound frame decoding so it doesn't block the event loop.
- **Product code — frontend:** parallelize data fetching (concurrent RSC fetches, `Promise.all`), stream where possible, and never serialize independent requests.
- **Safety:** keep shared state tenant-scoped and immutable where possible; guard the cost ledger and any shared cache with the right concurrency primitive. Parallelism must not break tenant isolation or double-spend API credits (dedupe by content-hash before spawning work).

## 5. Periodic code evaluation (so the AI judge passes the code check)

Run `scripts/eval.sh` before finishing any substantial task and at every milestone. It must pass with no new findings before work is considered done. It runs open-source quality gates:

- **Python:** `ruff check` + `ruff format --check`, `mypy --strict`, `bandit` (security), `pip-audit` (deps), `pytest --cov` (coverage gate), `radon`/`xenon` (complexity).
- **TypeScript/Next.js:** `eslint`, `tsc --noEmit`, `prettier --check`, `vitest run --coverage`, `npm audit`, build check.
- **SQL/migrations:** `sqlfluff` lint; verify RLS policies exist on every tenant table.
- **Cross-cutting:** no secrets in code (`gitleaks`/`detect-secrets`), no `TODO`/`FIXME` left in merged code without a tracked item.

If a tool isn't installed yet, install and pin it, add it to `scripts/eval.sh`, and record it in `scripts/README.md`. Fix findings; don't suppress them without a logged reason in `docs/LESSONS.md`.

## 6. UI standards — best on desktop and mobile

- **Responsive, mobile-first.** Every screen works from 360px to wide desktop. Test both breakpoints before marking UI work done.
- Tailwind v4 + shadcn/ui, dark-mode operator-console aesthetic (see PLAN.md §9).
- **Accessibility:** keyboard-navigable, visible focus states, WCAG AA contrast, semantic HTML, `aria` where needed.
- The heavy media canvas (review console) must degrade gracefully on small screens: stack the right-rail fields below the video, keep overlays legible.
- No layout shift; loading and empty states for every data view.

## 7. Database standards — optimized queries

- Async SQLAlchemy 2.0 + asyncpg. **No N+1 queries** — eager-load relations, batch reads.
- Index every foreign key and every column used in a `WHERE`/`ORDER BY` on a hot path; add the index in the same migration that introduces the access pattern.
- Keep queries tenant-scoped; let RLS enforce isolation but still filter in the query.
- Paginate all list endpoints (keyset pagination on hot lists). Return only needed columns.
- Review new queries with `EXPLAIN ANALYZE` on realistic data before merging a hot-path query. Record anything surprising in LESSONS.

## 8. Tests — full coverage, not optional

- Backend: `pytest` async for every pipeline stage, anomaly rule, API route, and **RLS tenant-isolation tests** (a user in tenant A must never read tenant B's rows).
- Frontend: Vitest unit + Playwright E2E for the core flows (upload → review → confirm/override → export, and the analyst chat).
- Fill-% estimator has fixture clips with known answers and asserts the ±10% target.
- Coverage gate enforced in `scripts/eval.sh`. New code ships with tests in the same change.

## 9. Logging & observability

- Structured JSON logs everywhere, with a request ID and `tenant_id` on every line. Never log secrets or raw PII.
- Every Meta Model API call logs model, tokens in/out, latency, cost, and cache hit to `pipeline_runs` (the $150 budget ledger).
- `/health` endpoint; errors logged with context and surfaced, never swallowed.

---

## Definition of done (every task)

- [ ] PROGRESS.md updated (moved to Done with its exit check).
- [ ] CHANGELOG.md entry added.
- [ ] Any mistake/surprise logged in LESSONS.md.
- [ ] Repeated steps captured as a script in `scripts/`.
- [ ] Tests written and passing.
- [ ] `scripts/eval.sh` passes clean.
- [ ] UI (if touched) verified on mobile + desktop.
- [ ] Hot-path queries checked for N+1 and indexes.
