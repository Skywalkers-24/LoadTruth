# Lessons Learned (append-only)

Every mistake, failed command, wrong assumption, or fix that took more than one attempt goes here.
**Rule: never repeat a logged mistake.** Re-read the relevant entry before working in that area.

Entry format:

```
### YYYY-MM-DD — short title
- What happened:
- Root cause:
- Fix:
- Rule going forward:
```

---

### 2026-10-26 — Seed entries from verified facts (prevent predictable mistakes)

- **Muse Spark empty responses.** Muse Spark is a reasoning model; reasoning shares the output budget. Set `max_output_tokens >= 4000` and stream, or responses can come back empty with `finish_reason: length`. Rule: never call Muse Spark for transcription/long structured output without a 4000+ output budget and streaming.
- **SAM 3.1 output is not JSON.** `sam-3.1` returns a special-token grammar on the streamed output-text lane. Parse it with the official `meta_sam_parser` (Python) / `@meta-sam/parser` (TS). Rule: never hand-parse SAM output.
- **One concept per SAM request.** SAM takes a single noun phrase per request; multiple concepts = multiple requests, combined in app code. Rule: loop concepts, don't cram them into one prompt.
- **Cost discipline is a hard constraint.** $150 total credit budget. Sample video at 2–4 fps, cache SAM + Spark by content hash, send Spark only the keyframes it needs, reuse `file_id` across stages. Rule: no uncached model call on a path that runs more than once (e.g. the demo clip).
- **`.env` is gitignored and the key is a placeholder.** `MODEL_API_KEY=TO_BE_UPDATED_LATER`. Rule: before running anything that hits the API, confirm a real key is present; never commit `.env`.

### 2026-10-26 — Monorepo scaffold (backend + frontend)

- **System `python3` is 3.9, not 3.12.** A Python 3.12 interpreter lives at `/opt/homebrew/bin/python3.12`. Root cause: macOS ships an old python3; the backend requires 3.12. Fix: `scripts/setup.sh` auto-detects `python3.12` (or honors `$PYTHON312`) and builds `backend/.venv` with it. Rule: never assume `python3` is 3.12 — always pin the interpreter for the backend venv.
- **hatchling couldn't find the package.** Build failed with "Unable to determine which files to ship" because the project name (`loadtruth-backend`) didn't match a directory and the package dir is `app`. Fix: added `[tool.hatch.build.targets.wheel] packages = ["app"]`. Rule: when the package dir name differs from the project name, declare `tool.hatch.build.targets.wheel.packages`.
- **`app/logging.py` shadowed the stdlib `logging` module** (ruff A005) and broke `import logging` semantics. Fix: renamed to `app/log.py`. Rule: never name a first-party module after a stdlib module (`logging`, `json`, `types`, etc.).
- **`set -e` in setup.sh aborted before `npm install`** when the backend pip step failed, leaving the frontend with no `node_modules` — which then looked like separate frontend errors. Root cause: one script doing two independent setups under `set -e`. Lesson: when diagnosing, verify the real state (`node_modules` was simply absent) before treating downstream errors as real. Keep backend/frontend setup independent so one failure doesn't mask the other's state.

### 2026-10-26 — CI/CD first run failures

- **Local `vitest run` != CI `vitest run --coverage`.** The `test` script uses `--coverage`, which requires `@vitest/coverage-v8`; it wasn't a devDependency, so local `vitest run` (no coverage, as I ran it) passed but CI failed with "MISSING DEPENDENCY @vitest/coverage-v8". Fix: add `@vitest/coverage-v8` to devDependencies. Rule: run the *exact* script CI runs (`npm run test`) locally before pushing, not a simpler variant.
- **`secrets` context is invalid in step-level `if` conditions.** `deploy.yml` used `if: ${{ secrets.FLY_API_TOKEN != '' }}` on steps; GitHub rejects the `secrets` context there ("workflow file issue"), and the run failed instantly on push even though the trigger is `workflow_dispatch`. Fix: read the secret into an `env:` at job level and gate on `env`/a job output, or use `vars`. Rule: never reference `secrets.*` directly in an `if:` expression — assign to `env` first.

### 2026-10-26 — Frontend Docker build: missing public/

- **`COPY /app/public ./public` failed: "/app/public": not found.** The frontend Dockerfile copies Next's `public/` dir, but the scaffold never created one, so the Docker build (only exercised in CI, not locally — no Docker here) failed while backend+frontend lint/test/build jobs passed. Fix: add `frontend/public/.gitkeep`. Rule: when a Dockerfile `COPY`s a path, ensure that path exists in the repo; and remember Docker builds are only validated in CI on this machine (no local Docker) — read the CI docker job log, don't assume.

### 2026-10-26 — CodeQL is not free on private repos

- **CodeQL code scanning is free only on public repos.** On Free/Pro plans it fails for private repos (needs GitHub Advanced Security, paid). In our run the analysis completed but the SARIF upload step failed with a permission error. Fix: removed the CodeQL jobs; the Security workflow now runs only `gitleaks` (free on private). Local `scripts/eval.sh` covers the rest (bandit, pip-audit, npm audit). Rule: don't add CodeQL to a free private repo's CI — it will always fail at upload. Re-add only if the repo goes public or gets Advanced Security.

### 2026-10-26 — Vendoring third-party SQL: cloning/large gh calls hang; adopt the data layer, not a whole boilerplate

- **What happened:** While adopting an open-source multi-tenant RBAC repo, `gh repo clone` and large `gh api .../git/trees?recursive=1` calls hung to the 120s inline-shell timeout. Smaller calls (`gh repo view --json`) worked.
- **Root cause:** The inline shell blocks on long/interactive network ops; the big clone/tree calls stalled (likely auth prompt or large transfer) with no output.
- **Fix:** Fetched exactly the files needed over HTTP (`curl` / web_fetch of `raw.githubusercontent.com`), and ran the upstream migration **generator** as a background job writing a log (fast-background-commands skill), reading the log instead of waiting. The installer also needs its `--output-dir` to exist first (it `cp`s into it; a missing dir fails with "No such file or directory").
- **Rule going forward:** Never clone/scan a repo via the inline shell — fetch the specific raw files you need, or run the generator as a logged background job. Create output dirs before running tools that copy into them.

### 2026-10-26 — Reconcile concurrent re-plans before deleting work

- **What happened:** A "9.5+ playbook" re-plan landed concurrently that cut scope to a single seeded tenant / upload-only and listed "multi-tenant RLS/RBAC screens" as deferred — at the same time the multi-tenant RBAC *data layer* was built. Risk: a later agent reads "deferred" and deletes or rebuilds the working layer.
- **Root cause:** Two work streams touched PLAN/PROGRESS in the same window with different framings of the same words ("RBAC" = screens vs. data layer).
- **Fix:** Kept the data layer (already built + green; our operational tables live in the same schema file, so it's needed regardless), seeded a single tenant for the demo, and built **no** auth/role screens or source adapters. Clarified PROGRESS "Next" item 3 and the deferral list to say the *data layer exists* and only the *screens/adapters* are deferred.
- **Rule going forward:** When a cut list names a feature, distinguish data layer vs. UI/screens vs. adapters. Don't delete green, already-paid-for work to satisfy a scope cut aimed at *future* effort. Update the shared docs so the deferral can't be misread as "remove what exists."

### 2026-10-26 — Inline shell hangs on ruff; run checks as background jobs

- What happened: `ruff check app tests` and even `ruff check --no-cache <files>` repeatedly hit the 60–120s inline-shell timeout, while `pytest` in the same shell returned instantly. Running the identical ruff command via `control_bash_process` → log file finished in well under a second and passed clean.
- Root cause: the *inline* shell tool stalls on certain commands in this environment (not a ruff or code problem); it is unreliable for anything non-trivial. macOS also has no `timeout` binary, so `timeout 15 ...` fails with `command not found`.
- Fix: run lint/type/test via a tiny script started with `control_bash_process`, write stdout+stderr to a log with a trailing `DONE <code>`, and read the log with `read_file`. Use a unique command string per run (the process is reused per command+cwd).
- Rule going forward: never run `ruff`/`mypy`/`pytest`/builds through the inline shell — use the fast-background-commands pattern (script + log + `read_file`). Don't rely on `timeout` on macOS.

### 2026-10-26 — supabase-tenant-rbac: create_role validates grantable roles exist (ordering)

- **What happened:** First draft of `10_loadtruth_roles.sql` created `county_admin` (with `grantable_roles => ['monitor','supervisor','auditor']`) before `auditor` existed. The vendored `rbac.create_role` runs `_validate_grantable_roles`, which raises "Undefined roles in grantable_roles" if any referenced role (other than `'*'`) is not yet in `rbac.roles`. Would have failed on first apply.
- **Root cause:** Assumed roles could be declared in any order; the extension enforces referential order at creation time.
- **Fix:** Reordered to create leaf roles first (`monitor`, `auditor`), then `supervisor` (grants monitor), then `county_admin` (grants monitor/supervisor/auditor), then `super_admin`. Same applies to permissions: every permission must be `create_permission`-d before a role references it (already ordered correctly).
- **Rule going forward:** When seeding RBAC, create permissions first, then roles in dependency order (grantable targets before the granter). Verify RPC bodies for validation side-effects before assuming declaration order is free.

### 2026-10-26 — Portable ORM for SQLite-now, Postgres-later

- What happened: the ORM/schema were Postgres-specific (`UUID(as_uuid=True)`, `JSONB`, RLS, pgvector). Running on the interim SQLite DB needed portable types, and `aiosqlite` wasn't installed.
- Root cause: SQLite has no native UUID/JSONB and ignores asyncpg pool args.
- Fix: a `GUID` TypeDecorator (native UUID on PG, CHAR(36) on SQLite) in `app/db/types.py`; `JSON` instead of `JSONB`; engine branches on dialect (no `pool_size` on SQLite); `init_db()` creates tables from metadata on SQLite only (Postgres uses infra/rbac SQL). Added `aiosqlite` to deps. Postgres-only concerns (RLS, pgvector) stay in the SQL file, not the ORM.
- Rule going forward: keep the ORM dialect-portable (GUID/JSON, no dialect-specific column types in models); put Postgres-only features in infra SQL. Switching DBs is a `DATABASE_URL` change, nothing more.

### 2026-10-26 — The AI client factory picks Live when a real key is present

- What happened: an ingest test 500'd because `.env` now has a real `MODEL_API_KEY`, so `get_ai_client()` returned `LiveAIClient` (a not-wired stub that raises) instead of the fixture mock.
- Root cause: the factory selects live whenever `model_api_configured` and `not mock_ai`; the live SAM/Spark bodies aren't wired yet.
- Fix: tests/demo set `MOCK_AI=1` and clear the `get_ai_client`/`get_settings` lru_caches in the fixture. `LiveAIClient` raises `LiveAINotWiredError` loudly (never silent wrong data).
- Rule going forward: until `app/ai/live.py` is wired, run the pipeline with `MOCK_AI=1`. When wiring live, remember `get_ai_client` is `lru_cache`d — clear it if config changes at runtime.

### 2026-10-26 — Optional native dep (PyAV): guard the import, don't `type: ignore` it

- **What happened:** `frames.py` guards `import av` for when PyAV isn't installed. A `# type: ignore[import-untyped]` on the lazy `import av` failed `mypy --strict` with `unused-ignore` — because `av` isn't installed at all, so the real error is `import-not-found`, not `import-untyped`, and `warn_unused_ignores=true` flagged the wrong code. The first gate run *also* showed 7 phantom `Value of type object is not indexable` errors in `test_tickets_api.py` (a file I never touched) that vanished on a clean re-run.
- **Root cause:** (1) An inline per-line ignore has to name the *exact* code mypy would emit, and that code depends on whether the package is present — brittle for an optional dep. (2) A stale `.mypy_cache` surfaced errors from an unrelated file on the first incremental run.
- **Fix:** Removed the inline ignore and added a scoped override in `pyproject.toml` — `[[tool.mypy.overrides]] module = ["av", "av.*"]; ignore_missing_imports = true`. This is installed-or-not agnostic. For the phantom errors, re-running the gate (cache warmed) returned `Success: no issues found in 51 source files`.
- **Rule going forward:** For an optional/native dependency that ships no stubs and may be absent, silence it with a module-scoped `ignore_missing_imports` override, never an inline `# type: ignore[...]` (the code is environment-dependent and `warn_unused_ignores` will bite). And when mypy reports errors in a file you didn't touch, re-run once (stale incremental cache) before chasing them.
