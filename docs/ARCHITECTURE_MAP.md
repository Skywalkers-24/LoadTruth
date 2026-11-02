# Architecture Map — "where does this change go?"

The mental map every agent reads at the start of a new chat so it knows exactly
where a change belongs **without re-exploring the repo**. Keep this current: when
you add a module or move responsibility, update the relevant row in the same change.

## Top-level layout

```
loadtruth/
├─ run_docker.sh         Smooth single-command local full-stack startup (Docker + Postgres + Redis)
├─ Poster.jpg            High-resolution 2MB system poster and architectural showcase
├─ demo/                 Video demonstration walkthrough (LoadTruth_Demo.mp4, audio, chapter guide)
├─ backend/              FastAPI, Python 3.12 — API + pipeline + worker
├─ frontend/             Next.js 16 App Router — operator console
├─ infra/                Supabase RLS policies and platform SQL
├─ backend/migrations/   Application schema migrations (Alembic)
├─ scripts/              Reusable task entry points (setup_docker/dev/test/eval/pipeline/...)
├─ docs/                 PROGRESS · CHANGELOG(root) · LESSONS · DEPLOYMENT · this map
├─ .github/workflows/    CI (ci.yml), security (codeql.yml), deploy (deploy.yml)
└─ .kiro/steering/       Always-on agent protocol
```

## "I need to change X → go here"

| Change | Location | Notes |
|---|---|---|
| System demonstration & video assets | `demo/LoadTruth_Demo.mp4` + `demo/README.md` | Full 2:26 HD video walkthrough with chapter breakdown and monitor audio track |
| System poster & visual assets | `Poster.jpg` (root) + `docs/Poster.jpg` | 4096x2237 high-res architectural infographic referenced in Readme.md |
| App config / new env var | `backend/app/config.py` + `.env.example` | pydantic-settings; validated on boot |
| Local benchmark batch tooling | `dump/scripts/` on the local `dump` branch | Archived from the working `main` branch; the product benchmark gallery and known-volume harness remain in the app. |
| Logging / observability | `backend/app/log.py` | structlog JSON; add request/tenant context here |
| New API route | `backend/app/api/<resource>.py` (router) → include in `app/main.py` | one router per resource |
| DB model / table | `backend/app/db/models.py` (base/mixins `app/db/base.py`, portable types `app/db/types.py`) + schema SQL in `infra/rbac/20_loadtruth_schema.sql` | SQLite is the local-host default; Compose and production use Postgres; `DATABASE_URL` selects the engine |
| DB engine / init / seed | `app/db/engine.py` (`init_db` creates tables), `app/tickets/seed.py` (demo tenant) | schema migrations and RLS SQL are in `backend/migrations/` and `infra/rbac/` |
| Ticket storage (repo) | `backend/app/tickets/repository.py` (`SqlTicketRepository`) + provider in `backend/app/api/repo.py` | async, tenant-scoped; session-per-request. `list_tickets` = all rows (dashboard/CSV/audit-packet aggregate the whole event); `list_tickets_page` = one page + total (ticket-list UI); `dashboard`/`reports_summary` build the roll-ups |
| Local one-command Docker runner | `run_docker.sh` (root) → `scripts/setup_docker.sh` | Validates Docker daemon, auto-generates `.env` from `.env.example`, brings up Postgres 16, Redis 7, Backend, Frontend, and verifies `/health` |
| B2 private evidence storage & resilient fallback | `backend/app/pipeline/evidence_store.py` + `backend/app/pipeline/b2_store.py` + `backend/app/api/ingest_jobs.py` | signed direct-to-B2 browser PUT/GET URLs; pins B2 version IDs for audit integrity; seamlessly falls back to process-memory cache when B2 is unconfigured or cloud quota/rate limits are hit |
| Client-side video ingest & compression guard | `frontend/src/lib/video-compress.ts` + `frontend/src/app/add/page.tsx` | Enforces 50MB max upload cap, duration inspection, and non-blocking in-browser canvas+MediaRecorder bitrate compression (>10MB compressed down to ~5MB) |
| Frame decoding / keyframe sampling (Stage 1) | `backend/app/pipeline/frames.py` + `backend/app/pipeline/evidence_store.py` | PyAV sample frames offloaded via `asyncio.to_thread` with `-preset ultrafast` to eliminate event loop blocking on shared CPUs |
| Durable analysis jobs & worker | `backend/app/api/ingest_jobs.py` + `backend/app/db/models.py` (`AnalysisJob`) | durable Postgres job queue, single-worker sequential analysis with startup recovery, live progress streaming |
| Whole-pipeline result cache | `backend/app/pipeline/cache.py` + `backend/app/api/ingest.py` | in-process content-hash cache; not Redis-backed today |
| AI-stage cache | `backend/app/ai/cached_client.py` + `backend/app/db/models.py` | persists per-stage results in SQL so cached model work survives backend restarts |
| Cached API responses | `backend/app/api/cache.py` | response cache used by report/billing reads; invalidated by tenant/event tags |
| Cost ledger ($150 budget) | `backend/app/pipeline/ledger.py` | `CostLedger.record_run` per stage + `summarize()` (spend, cache-hit rate, per-stage) + `budget_status()` vs config caps |
| Pipeline orchestrator | `backend/app/pipeline/orchestrator.py` | runs Stages 0-7, returns a draft ticket + anomalies; optional cache (free re-run) + ledger (row per stage) injected |
| Shared pipeline cache + ledger singletons | `backend/app/api/ingest.py` (`get_pipeline_cache`, `get_cost_ledger`) | process-local; the future cost-dashboard endpoint reads the ledger summary |
| AI calls (SAM/Muse) | `backend/app/ai/` — `base.py` (protocol), `mock.py` (fixtures), `live.py` (Meta Model API), `factory.py` | the AI client is the Meta-call boundary; `get_ai_client` selects fixture or live behavior |
| Per-stage "AI analysis" (model-authored) | OCR/classify return `analysis` in their JSON schema (`ai/live.py`); the rest come from one batched text-only `AIClient.explain_pipeline(facts)` → `StageExplanations` (`ai/base.py`), wired in `pipeline/orchestrator.py` via `_explain`/`_explain_facts` + `PipelineTrace.set_analysis` | the paragraph shown under each stage on the Pipeline screen. New AI task `explain_pipeline` lives in `ai/catalog.py` (TaskInfo) + `ai/request_params.py` (output cap) + `config.py` (`spark_explain_max_output_tokens`). Persisted on `pipeline_stages.analysis`, round-tripped for OCR/classify in `ai/serde.py`, served on both trace routes, rendered by `frontend/.../ai/pipeline-trace.tsx` (`analysisText` prefers `stage.analysis`, `composedAnalysis` is the fallback) |
| AI fixtures (§5b) | `backend/app/ai/fixtures/scenarios.json` | keyed by content hash; `record-fixtures.sh` adds real ones |
| Ingest / export routes | `backend/app/api/ingest.py`, `backend/app/api/reports.py` | synchronous pipeline run; CSV + audit-packet HTML |
| Report export logic | `backend/app/tickets/export.py` | CSV + printable FEMA/FROC audit packet + printable invoice (`invoice_html`) |
| Billing roll-up (county→contractor) | `backend/app/tickets/billing.py` | pure; payable = monitor call else estimate; `build_summary` → totals + line items + month history; reuses `money.py`, no new math |
| Billing / invoice routes | `backend/app/api/billing.py` (registered in `app/main.py`) | `GET /events/{id}/billing`, `GET /billing` (combined), `GET /events/{id}/invoice.html`, `GET /billing/invoice.html`; read-only, tenant-scoped |
| Member/user management | `backend/app/api/users.py`, `backend/app/api/auth_session.py`, `backend/app/auth/` | email-based session login, tenant-scoped member CRUD, role/capability enforcement; this build has no password store |
| Ticket money math (CY, $, delta) | `backend/app/tickets/money.py` | pure/deterministic (PLAN.md §7a); never the model; `Decimal`-exact |
| Ticket API schemas / enums | `backend/app/tickets/schemas.py` | `TicketOut`/`ValuationOut`/`MonitorCallIn`/`EventOut`/`EventIn`/`EventPatch`/`DashboardOut`/`PaginatedTickets`/`ReportsSummary`/`TruckOut`/`TruckIn`/`TruckPatch`/`SourceOut`/`SourceIn`/`SourcePatch`/`SourceTestResult`, `DebrisClass`/`TicketStatus`/`SourceKind`/`SourceStatus`, serializers |
| Ticket/event domain records | `backend/app/tickets/domain.py` | `Event`/`Ticket` dataclasses; `apply_monitor_call` recomputes delta |
| Ticket storage (repo) | `backend/app/tickets/repository.py` (protocol + `InMemoryRepository`) + provider in `backend/app/api/repo.py` | tenant-scoped; swap provider for Postgres later |
| Demo seed data (§5b scenarios) | `backend/app/tickets/seed.py` | one tenant/event + labeled tickets; `DEMO_TENANT_ID`/`DEMO_EVENT_ID` |
| Ticket/dashboard API routes | `backend/app/api/tickets.py` | events (incl. `POST /events` + `PATCH /events/{id}` admin), tickets (paginated: `limit`/`offset` + `status`/`debris_class` filters + `sort`/`order` ledger sorting → `PaginatedTickets`; sort enums `TicketSort`/`SortOrder` in schemas, SQL ordering in `repository._order_by`), monitor-call (delta), status, dashboard, reports summary (`/events/{id}/reports/summary` → `ReportsSummary`) |
| Live pipeline progress (polled) | `backend/app/pipeline/trace.py` (`ProgressStore`, `ProgressSnapshot`, `PipelineTrace.on_stage`) ← mutated by `api/ingest.py` as each stage lands → `GET /system/events/{id}/pipeline-progress` (JSON snapshot) in `api/system.py`; FE `lib/api.ts::getPipelineProgress` + `lib/hooks.ts::usePipelineProgress` (polls 3s while running) + `components/ai/live-pipeline-flow.tsx` on `app/add/page.tsx` and `app/pipeline/page.tsx` | server holds the latest run per event, so a refresh mid-run still shows it. Additive telemetry; the durable trace on the ticket is unchanged |
| AI pipeline jobs API | `backend/app/api/system.py` (`GET /system/jobs` → `PaginatedJobs` `{items,total,limit,offset}`; `limit`/`offset`) | merges the in-memory `JobStore` (ring, `capacity()` in `pipeline/trace.py`) with every ticket's persisted trace, de-dupes by ticket, pages server-side; FE `app/pipeline/page.tsx` + `usePipelineJobs` |
| Truck-registry admin routes | `backend/app/api/trucks.py` | `GET/POST /trucks`, `PATCH/DELETE /trucks/{id}`; 409 on duplicate `truck_number`, 404 on missing; tenant-scoped |
| Source-connection admin routes | `backend/app/api/sources.py` | `GET/POST /events/{id}/sources`, `PATCH/DELETE /sources/{id}`, `POST /sources/{id}/test` (config validation only, no network I/O) |
| Source adapter (per-kind validate/fetch) | `backend/app/pipeline/sources.py` | `SourceAdapter` ABC + `get_adapter(kind)` factory; `upload` wired (reuses `ingest.py`), other kinds validate config + raise `SourceFetchNotImplementedError` on fetch |
| RLS policy | `infra/rbac/30_loadtruth_policies.sql` (our tables) / `40_rbac_base_policies.sql` (rbac.* tables) + a test in `backend/tests/` | every tenant table needs one; use `rbac.is_member` / `rbac.has_permission` helpers |
| Tenant/RBAC primitives (3rd-party) | `infra/rbac/00_install_rbac_vendored.sql` (verbatim, BSD-2) + `10_loadtruth_roles.sql` (our 5 roles) | never hand-edit the vendored file; regenerate + bump in CHANGELOG |
| JWT verify / tenant-scoped DB session | `backend/app/db/tenant.py`, `backend/app/db/engine.py` | binds Supabase JWT → RLS per request |
| Auth / session FastAPI deps | `backend/app/api/deps.py` (`CurrentUser`, `TenantSession`) | all protected routes depend on these |
| A pipeline stage (SAM/Spark) | `backend/app/pipeline/<stage>.py` | cache by content hash; log cost to `pipeline_runs` |
| Anomaly rule | `backend/app/anomalies/rules.py` | deterministic rule + Spark narrative |
| Analyst chat tool | `backend/app/chat/tools.py` | read-only, tenant-scoped, parameterized |
| Background job integration seam | `backend/app/worker.py` (ARQ) + Redis in Compose | worker exists as a planned scale-out path; current ingest executes synchronously in FastAPI |
| A screen / page | `frontend/src/app/<route>/page.tsx` | RSC by default; Server Actions for mutations |
| Public (no-login) page | `frontend/src/app/showcase/page.tsx` + allow-list in `components/auth/auth-gate.tsx` (`PUBLIC_PREFIXES`) | the submission's front door; renders signed out |
| Role-restrict a screen (FE) | `frontend/src/components/auth/access-gate.tsx` (`AccessGate`, `capability`/`anyOf`) | page-level guard showing a "not available for your role" state; reads `useAuth().can`. Used on `/trucks` (`manage_trucks`) and `/admin` (any of `manage_events`/`manage_sources`/`manage_users`). Nav/palette gating lives in `app-shell.tsx` (`NavItem.cap`/`anyCap`) |
| Role-gate an action/control (FE) | the component itself, via `useAuth().can(cap)` | hide/disable mutate controls (truck-registry, source-connections, rate-table). Backend `require(...)` in `api/deps.py` is the real enforcement; FE is the usability layer |
| App mode / judge mode | `frontend/src/lib/app-mode.ts` (`NEXT_PUBLIC_APP_MODE`, `NEXT_PUBLIC_JUDGE_TICKET_ID`) read in `app/console/page.tsx`; `bypass_cache` on `api/ingest.py` | build-time `NEXT_PUBLIC_*`, baked by the frontend Dockerfile/compose build args |
| Shared UI component | `frontend/src/components/` | responsive, a11y, dark theme tokens (money-frame, review-console, dashboard, ticket-list, badges, evidence-canvas) |
| Operator console screen | `frontend/src/app/console/page.tsx` | dashboard + queue + review console; single seeded tenant |
| Billing screen | `frontend/src/app/billing/page.tsx` + `frontend/src/components/billing/billing-panel.tsx` | per-event + combined invoice, KPIs, history chart, line items, invoice export; `useBilling` hook, `api.eventBilling`/`combinedBilling`/`invoiceUrl`/`combinedInvoiceUrl`; nav entry in `app-shell.tsx` |
| Data fetching / mutations (FE) | `frontend/src/lib/hooks.ts` (TanStack Query) + `frontend/src/lib/query.tsx` (provider) | invalidate tickets+dashboard on write |
| Display formatting (FE) | `frontend/src/lib/format.ts` | money/percent/CY/debris labels |
| Backend API client (FE) | `frontend/src/lib/api.ts` | typed; browser uses `/api/*` rewrite, server uses BACKEND_URL |
| Theme / design tokens | `frontend/src/app/globals.css` (`@theme`) | mobile-first, WCAG AA |
| CI behavior | `.github/workflows/ci.yml` | keep jobs cached + concurrency-cancelled |
| Deploy behavior | `.github/workflows/deploy.yml` + `docs/DEPLOYMENT.md` | free-tier only |
| A repeated command | `scripts/` + row in `scripts/README.md` | never paste long sequences into chat |

## Data flow (one clip → one ticket)

```
upload (browser) ── optional client compression (>10MB -> 5MB) ──> signed PUT / direct ingest
          │
          ▼
storage resolution: Backblaze B2 (pinned version) OR In-Memory fallback (if unconfigured / limit hit)
          │
          ▼
POST /events/{id}/demo-videos/{vid}/analyze (BE) ──> durable Postgres AnalysisJob
          │
          ▼
worker streams bytes (PyAV ultrafast + threadpool) ──> pipeline stages 1-7 (SAM 3.1 + Muse Spark + Decimal valuation)
          │
          ▼
persists ticket + SHA-256 evidence receipt + stage traces ──> streams progress via SSE
          │
          ▼
review console (FE) renders SVG SAM masks ──> monitor confirms/overrides/speaks call (voice)
          │
          ▼
export FEMA/FROC audit packets (HTML) + county invoices + CSV ledger
```

## Invariants (don't break these)
- Tenant isolation is enforced in **both** RLS and the API layer.
- Every model call is cached by content hash and logged to `pipeline_runs`.
- Heavy work is off the request path (worker), progress streams over SSE.
- The demo path reads cache only.

> If a change doesn't obviously fit a row above, add the row (and the module) rather than scattering logic. Update `PROGRESS.md` "Next" so the following chat knows the plan.
