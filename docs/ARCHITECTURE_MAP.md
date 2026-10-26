# Architecture Map — "where does this change go?"

The mental map every agent reads at the start of a new chat so it knows exactly
where a change belongs **without re-exploring the repo**. Keep this current: when
you add a module or move responsibility, update the relevant row in the same change.

## Top-level layout

```
loadtruth/
├─ backend/              FastAPI, Python 3.12 — API + pipeline + worker
├─ frontend/             Next.js 16 App Router — operator console
├─ infra/                Supabase schema, RLS policies, migrations, seed
├─ scripts/              Reusable task entry points (setup/dev/test/eval/pipeline/...)
├─ docs/                 PROGRESS · CHANGELOG(root) · LESSONS · DEPLOYMENT · this map
├─ .github/workflows/    CI (ci.yml), security (codeql.yml), deploy (deploy.yml)
└─ .kiro/steering/       Always-on agent protocol
```

## "I need to change X → go here"

| Change | Location | Notes |
|---|---|---|
| App config / new env var | `backend/app/config.py` + `.env.example` | pydantic-settings; validated on boot |
| Logging / observability | `backend/app/log.py` | structlog JSON; add request/tenant context here |
| New API route | `backend/app/api/<resource>.py` (router) → include in `app/main.py` | one router per resource |
| DB model / table | `backend/app/db/models.py` (base/mixins `app/db/base.py`, portable types `app/db/types.py`) + schema SQL in `infra/rbac/20_loadtruth_schema.sql` | runs on SQLite now (portable `GUID`/`JSON`), Postgres later; `DATABASE_URL` switches |
| DB engine / init / seed | `app/db/engine.py` (`init_db` creates SQLite tables), `app/tickets/seed.py` (demo tenant) | Postgres uses infra SQL instead of `init_db` |
| Ticket storage (repo) | `backend/app/tickets/repository.py` (`SqlTicketRepository`) + provider in `backend/app/api/repo.py` | async, tenant-scoped; session-per-request. `list_tickets` = all rows (dashboard/CSV/audit-packet aggregate the whole event); `list_tickets_page` = one page + total (ticket-list UI); `dashboard`/`reports_summary` build the roll-ups |
| Pipeline stage (deterministic) | `backend/app/pipeline/` — `geometry.py` (fill %), `anomalies.py` (rules), `ingest.py` (hash), `registry.py` (capacity) | pure Python, no model calls |
| Frame decoding / keyframe sampling (Stage 1) | `backend/app/pipeline/frames.py` | samples 2-4 fps via PyAV (optional `av` dep, feature-detected); image→1 frame, no decoder→degraded empty sample |
| Pipeline result cache (content-hash) | `backend/app/pipeline/cache.py` | `ResultCache` protocol + async-safe `InMemoryResultCache` (Redis later); injected into the orchestrator |
| Cost ledger ($150 budget) | `backend/app/pipeline/ledger.py` | `CostLedger.record_run` per stage + `summarize()` (spend, cache-hit rate, per-stage) + `budget_status()` vs config caps |
| Pipeline orchestrator | `backend/app/pipeline/orchestrator.py` | runs Stages 0-7, returns a draft ticket + anomalies; optional cache (free re-run) + ledger (row per stage) injected |
| Shared pipeline cache + ledger singletons | `backend/app/api/ingest.py` (`get_pipeline_cache`, `get_cost_ledger`) | process-local; the future cost-dashboard endpoint reads the ledger summary |
| AI calls (SAM/Spark) | `backend/app/ai/` — `base.py` (protocol), `mock.py` (fixtures), `live.py` (stub), `factory.py` | nothing else calls Meta directly; `get_ai_client` selects by config |
| AI fixtures (§5b) | `backend/app/ai/fixtures/scenarios.json` | keyed by content hash; `record-fixtures.sh` adds real ones |
| Ingest / export routes | `backend/app/api/ingest.py`, `backend/app/api/reports.py` | pipeline run; CSV + audit-packet HTML |
| Report export logic | `backend/app/tickets/export.py` | CSV + printable FEMA/FROC audit packet |
| Ticket money math (CY, $, delta) | `backend/app/tickets/money.py` | pure/deterministic (PLAN.md §7a); never the model; `Decimal`-exact |
| Ticket API schemas / enums | `backend/app/tickets/schemas.py` | `TicketOut`/`ValuationOut`/`MonitorCallIn`/`EventOut`/`EventIn`/`EventPatch`/`DashboardOut`/`PaginatedTickets`/`ReportsSummary`/`TruckOut`/`TruckIn`/`TruckPatch`/`SourceOut`/`SourceIn`/`SourcePatch`/`SourceTestResult`, `DebrisClass`/`TicketStatus`/`SourceKind`/`SourceStatus`, serializers |
| Ticket/event domain records | `backend/app/tickets/domain.py` | `Event`/`Ticket` dataclasses; `apply_monitor_call` recomputes delta |
| Ticket storage (repo) | `backend/app/tickets/repository.py` (protocol + `InMemoryRepository`) + provider in `backend/app/api/repo.py` | tenant-scoped; swap provider for Postgres later |
| Demo seed data (§5b scenarios) | `backend/app/tickets/seed.py` | one tenant/event + labeled tickets; `DEMO_TENANT_ID`/`DEMO_EVENT_ID` |
| Ticket/dashboard API routes | `backend/app/api/tickets.py` | events (incl. `POST /events` + `PATCH /events/{id}` admin), tickets (paginated: `limit`/`offset` + `status`/`debris_class` filters → `PaginatedTickets`), monitor-call (delta), status, dashboard, reports summary (`/events/{id}/reports/summary` → `ReportsSummary`) |
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
| Background job | `backend/app/worker.py` (ARQ) | heavy video work goes here, not in request handlers |
| A screen / page | `frontend/src/app/<route>/page.tsx` | RSC by default; Server Actions for mutations |
| Shared UI component | `frontend/src/components/` | responsive, a11y, dark theme tokens (money-frame, review-console, dashboard, ticket-list, badges, evidence-canvas) |
| Operator console screen | `frontend/src/app/console/page.tsx` | dashboard + queue + review console; single seeded tenant |
| Data fetching / mutations (FE) | `frontend/src/lib/hooks.ts` (TanStack Query) + `frontend/src/lib/query.tsx` (provider) | invalidate tickets+dashboard on write |
| Display formatting (FE) | `frontend/src/lib/format.ts` | money/percent/CY/debris labels |
| Backend API client (FE) | `frontend/src/lib/api.ts` | typed; browser uses `/api/*` rewrite, server uses BACKEND_URL |
| Theme / design tokens | `frontend/src/app/globals.css` (`@theme`) | mobile-first, WCAG AA |
| CI behavior | `.github/workflows/ci.yml` | keep jobs cached + concurrency-cancelled |
| Deploy behavior | `.github/workflows/deploy.yml` + `docs/DEPLOYMENT.md` | free-tier only |
| A repeated command | `scripts/` + row in `scripts/README.md` | never paste long sequences into chat |

## Data flow (one clip → one ticket)

```
upload (FE) → POST /ingest (BE) → enqueue (ARQ) → pipeline stages 1-7 → tickets/anomalies rows
         ↑ realtime queue (Supabase) ←───────────────── progress (SSE) ──────────┘
review console (FE) reads ticket + masks → monitor confirms/overrides → export (PDF/CSV)
analyst chat (FE) → POST /chat (BE) → Muse Spark + read-only tools over tenant data
```

## Invariants (don't break these)
- Tenant isolation is enforced in **both** RLS and the API layer.
- Every model call is cached by content hash and logged to `pipeline_runs`.
- Heavy work is off the request path (worker), progress streams over SSE.
- The demo path reads cache only.

> If a change doesn't obviously fit a row above, add the row (and the module) rather than scattering logic. Update `PROGRESS.md` "Next" so the following chat knows the plan.
