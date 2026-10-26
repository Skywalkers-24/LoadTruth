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
| DB model / table | `backend/app/db/models.py` + a new Alembic migration in `infra/migrations/` | index FKs + hot columns in the same migration |
| RLS policy | `infra/policies/<table>.sql` + a test in `backend/tests/` | every tenant table needs one |
| A pipeline stage (SAM/Spark) | `backend/app/pipeline/<stage>.py` | cache by content hash; log cost to `pipeline_runs` |
| Anomaly rule | `backend/app/anomalies/rules.py` | deterministic rule + Spark narrative |
| Analyst chat tool | `backend/app/chat/tools.py` | read-only, tenant-scoped, parameterized |
| Background job | `backend/app/worker.py` (ARQ) | heavy video work goes here, not in request handlers |
| A screen / page | `frontend/src/app/<route>/page.tsx` | RSC by default; Server Actions for mutations |
| Shared UI component | `frontend/src/components/` | responsive, a11y, dark theme tokens |
| Backend API client (FE) | `frontend/src/lib/api.ts` | typed; add new endpoints here |
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
