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

### 2026-10-27 — Leaked shells exhausted the process table; dev server never reaches networkidle

- **What happened:** Mid-session every command failed with `fork failed: resource temporarily unavailable`, and the backend on :8000 died. Separately, the puppeteer layout script timed out on `page.goto(..., { waitUntil: "networkidle0" })` against `next dev`.
- **Root cause:** (1) Dozens of background terminals (one per helper script) were left open; each zsh also spawns a powerlevel10k `gitstatusd`, so they piled up until fork failed. (2) The Next dev server keeps an HMR websocket open, so the network never goes idle.
- **Fix:** Stopped every finished background terminal, restarted the backend from `scratch/dev-be.sh`. The script now loads with `domcontentloaded` and waits for `[aria-label="Review queue"] li` before measuring.
- **Rule going forward:** Stop a background terminal as soon as its log shows `DONE`. Never wait on `networkidle0` against the dev server; wait for a concrete selector. If the backend stops answering, check `lsof -iTCP:8000` before debugging the frontend.

### 2026-10-27 — Use container queries for panes whose width depends on a sibling column

- **What happened:** The money frame switched to its two-column layout at the `lg` viewport breakpoint, but at 1280px the review pane is only ~630px wide (the queue column takes the rest), so the hero clipped the Difference column.
- **Root cause:** Viewport breakpoints describe the window, not the pane a component actually renders in.
- **Fix:** `ReviewWorkspace` is an `@container`; the money frame and the evidence/flags split use `@2xl` / `@[40rem]` variants. Verified with measured element boxes at 1024, 1280, 1440, and 1512 widths.
- **Rule going forward:** Inside the console panes, lay out with container-query variants (`@sm`, `@2xl`, `@[40rem]`), not `lg`/`xl`. Measure with `scratch/shots/console-measure.mjs` at 1280x800 before calling a layout done.


### 2026-10-28 — `scripts/eval.sh` has a pre-existing baseline of findings; scope checks to your files

- **What happened:** Running the full `scripts/eval.sh` after the billing feature reported 13 ruff-format files "would be reformatted" and ~30 `mypy --strict` errors across 8 files. Almost all were pre-existing drift (`app/ai/agent.py`, `app/ai/analyst.py`, `app/api/deps.py`, `app/tickets/seed.py`, several `tests/*.py`, plus bandit noise scanning `.venv`). Only one finding was mine: a new test helper in `tests/test_billing.py` missing a `-> Ticket` return annotation (`mypy --strict` checks the `tests/` dir too).
- **Root cause:** The repo carries a known format/type baseline the eval flags wholesale; `ruff format --check .` and `mypy --strict .` run over everything, so the real signal (did *my* change add a finding?) is buried. Also: the eval log is huge because bandit dumps every `.venv` file, so an inline `grep`/`awk` over it times out.
- **Fix:** Verify your change by scoping the tools to the files you touched: `ruff check <files>`, `ruff format --check <files>`, `mypy --strict <files incl. your new tests>`. `mypy --strict` flags test helpers, so annotate their return types. Don't reformat the 13 pre-existing files to make the whole-repo gate pass — that's out of scope and churns unrelated code. Read the big eval log with the grep tool (include pattern), never an inline shell pipe.
- **Rule going forward:** A task is "clean" when the files it adds/edits pass ruff + mypy --strict with no new findings; the whole-repo eval's pre-existing baseline is not yours to fix in a feature change. Annotate new test helpers (`-> None`/`-> Ticket`) because strict mode covers `tests/`.


### 2026-10-28 — Authed file exports can't be plain `<a href>` links (they redirect to sign-in)

- **What happened:** Clicking "Print / PDF" on the Billing page opened a new tab that landed on the sign-in screen instead of the invoice. Same latent bug existed on every export (CSV, audit packet) across Reports, the console event actions, and the command palette.
- **Root cause:** Auth in this build is a bearer token kept in `localStorage` and sent as an `Authorization` header by the `fetch` client. A plain `<a href="/api/events/.../invoice.html">` is a top-level browser navigation that carries cookies, not the in-memory/localStorage bearer, so the backend's `current_member` dep returns 401 and the SPA routes to login.
- **Fix:** `openAuthedExport(path, { download? })` in `frontend/src/lib/api.ts` — `fetch` the export with the bearer header, `URL.createObjectURL(blob)`, then open that blob URL in a new tab (or set `a.download` for a CSV). Open the blank tab *synchronously* on the click (before the `await`) so it counts as a user-gesture popup and isn't blocked; close it and throw on a non-OK response. Revoke the object URL after a delay.
- **Rule going forward:** Never link to an authenticated backend export with a bare `<a href>`/`window.location` when auth is a bearer token (not a cookie). Route every export through `openAuthedExport` so the token travels with the request. If auth ever moves to an httpOnly cookie, plain links would work, but until then this helper is the only correct path.
### 2026-10-27 — Console overflow on a Mac was a layout problem, not a text-size problem
- **What happened:** The one-screen Review console looked right on a 1920x1080 monitor but overflowed on a 1440x900 MacBook. Shrinking text made it look cramped and did not fix it. The real causes were a decision bar that forced one row of buttons, a money hero that could not wrap its status chip, a queue subtitle that wrapped to two lines, and a fixed 17rem evidence canvas that pushed the truck record under the sticky decision bar.
- **Root cause:** Sizing was keyed to the window width only. Laptop screens are both narrower and much shorter, and the center column's height budget was never checked against a 900px viewport.
- **Fix:** Container queries on the pane (`@[46rem]`) for column layout and for the bar's one-row versus two-row button grid; `min-w-0` on grid children; the evidence canvas cap on wide panes is `clamp(11rem, 100dvh - 44rem, 17rem)` so it shrinks on short screens; the queue count moved into a badge so the subtitle stays one line. Text sizes stay on the density scale.
- **Rule going forward:** Before changing type sizes to fix overflow, measure with `scratch/shots/console-measure.mjs` at 1280x800, 1440x900, 1512x982, and 1920x1080 and find the element that overflows. Budget height as well as width for any one-screen layout.
### 2026-10-27 — Clip uploads over 10 MB failed with a bare 500 (Next.js proxy body limit)
- **What happened:** A real clip uploaded on New Ticket showed "upload to /events/…/ingest failed (500)". The backend logged nothing and no Meta call was made.
- **Root cause:** The `/api/*` rewrite proxies through Next.js, which buffers request bodies and stops at 10 MB by default (`experimental.proxyClientMaxBodySize`). The truncated multipart body made the backend drop the socket (`ECONNRESET` in the frontend logs), and the proxy returned 500.
- **Fix:** `frontend/next.config.ts` sets `proxyClientMaxBodySize: "500mb"` and `proxyTimeout: 600000` (a live run can take minutes). The upload client no longer turns a missing backend detail into a raw path-and-status string.
- **Rule going forward:** When an upload fails with no backend log line, check `docker compose logs frontend` for proxy errors first. Test uploads above 10 MB through :3000, not only against :8000 directly.

### 2026-10-28 — Fixed caps that fit a laptop leave a monitor half empty
- **What happened:** The one-screen console was tuned for a 1440x900 laptop with fixed caps (evidence `max-h` 17rem, queue page of 6, 1600px content column). On a 1920x970 browser window each column ended 120 to 175px above the bottom, and on 2560x1300 about 450 to 500px.
- **Root cause:** Caps sized for the smallest target screen never grow. The page size was a constant, so the queue could not use extra height either.
- **Fix:** Let one element per column absorb leftover height (evidence `flex-1` with a 13rem floor; the rail's last card `flex-1`), compute the queue page size from the measured column height (`useFitCount`), and opt the console out of the 1600px cap (`AppShell fluid`).
- **Rule going forward:** In a one-screen layout, give each column a single flexible element instead of a `max-h`/`clamp()` cap, and measure blank space (the `blank` field in `scratch/shots/console-measure.mjs`) on a monitor size as well as laptop sizes. Measure at browser-window heights (for example 1440x790), not the display's full height.

### 2026-10-28 — Changing a ticket's inputs means re-running the whole §7a value path
- **What happened:** Adding truck-ID and debris-class edits, it was tempting to just set `row.truck_id` / `row.debris_class` and return. That would have left `certified_cubic_yards`, `rate_per_cy`, `est_cubic_yards`, `est_dollar_value`, and the monitor delta all stale, so the money frame would contradict the new inputs.
- **Root cause:** The ticket snapshots capacity and rate at ingest; they are not looked up live. The dollar fields are derived, not stored independently. domain.py says plainly the delta is "never recomputed ad hoc elsewhere."
- **Fix:** `repo.update_ticket` re-derives capacity from the registry (fuzzy `TruckRegistry`) on a truck change and the rate from `event.rate_table` on a debris change, then re-runs `value_ticket()` and persists every est/monitor/delta field, mirroring `set_monitor_call`'s copy-back.
- **Rule going forward:** Any mutation that touches a valuation input must route through `value_ticket()` and write all derived fields. Never hand-patch a single dollar/CY column.

### 2026-10-28 — `mypy --strict` on `dict[str, object]` evidence needs typed accessors, not `# type: ignore`
- **What happened:** The analyst agent had 21 `mypy --strict` errors from reading `ToolResult.evidence` (typed `dict[str, object]`) and calling `int(...)` / indexing the `object` values, papered over with `# type: ignore` that then went stale.
- **Fix:** Small typed accessors (`_int`, `_num`, `_items`, `_mapping`, `_row_str`) narrow `object` to the needed type at the read site, and the evidence dicts that mix ints and floats are annotated `dict[str, object]` so a narrow inference can't fight a later assignment. Also typed `require()` as returning `Callable[[Session], Awaitable[Session]]` since its guard is async.
- **Rule going forward:** Read `object`-typed values through a narrowing helper instead of `# type: ignore`; annotate heterogeneous evidence dicts as `dict[str, object]` at creation.
