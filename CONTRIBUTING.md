# LoadTruth

LoadTruth turns tower-camera video of debris trucks into evidence-linked draft load tickets. The backend runs a video pipeline, measures fill from segmentation masks, applies deterministic capacity and anomaly rules, values the load, and stores the evidence and pipeline trace for a human review. The Next.js app is the operator console for reviewing tickets, managing events and trucks, and exporting reports.

This file is the practical starting point for developing the repository. The existing [Readme.md](Readme.md) contains the product and system overview and current architecture diagram; focused design and operating references are linked below.

## Start here

### Requirements

- Python **3.12**
- Node.js **20.17+** and npm
- Docker Desktop / Docker Compose for the full containerized stack
- A Meta Model API key only for real model calls. Without a configured key, the AI factory uses recorded fixtures.

### Fast local setup

From the repository root:

```bash
./scripts/setup.sh
```

This creates `backend/.venv`, installs backend development dependencies, installs frontend packages, and copies `.env.example` to `.env` if one does not exist. It does not overwrite an existing `.env`. The backend defaults to a local SQLite database, so you do not need Postgres or Redis for the basic local app.

Start the API and frontend:

```bash
./scripts/dev.sh
```

Open <http://localhost:3000>. The API is at <http://localhost:8000>, with interactive docs at <http://localhost:8000/docs> and a liveness endpoint at <http://localhost:8000/health>. The frontend proxies `/api/*` to the backend on port 8000. `Ctrl-C` stops both development servers.

The default `.env.example` includes a placeholder model key. The backend uses fixture-backed mock AI when a real key is not configured; set `MOCK_AI=1` to force fixtures even when a key exists. To make live calls, set `MODEL_API_KEY` to a valid key and `MOCK_AI=0`. Live video calls can incur model charges; read [cost controls and model notes](Readme.md#-meta-ai-usage--model-configuration) first.

### Full local stack with Docker

```bash
cp .env.example .env   # only if .env does not already exist
make up
```

Compose starts Postgres, Redis, FastAPI, and Next.js. The containers use Postgres and Redis even though the host development path defaults to SQLite and runs without Redis. Visit the same ports as above. Useful commands:

```bash
make logs
make down
```

Docker is the closest local setup to the composed service topology. The current ingest implementation runs synchronously in the API request; ARQ/Redis worker support is an intended scaling seam, not a required part of the basic developer loop.

## Typical development loop

1. Start the app using either the fast host setup or Docker setup above.
2. Open the console and use the seeded demo event/tickets, or create a draft from **New Ticket** by uploading an image or clip.
3. Follow a ticket from the review screen to its evidence, per-stage trace, flags, and measured value. The Pipeline, Reports, Billing, Trucks, and Admin screens cover the other workflows.
4. Make the smallest change in the relevant backend or frontend area (see [where changes go](docs/ARCHITECTURE_MAP.md)). Keep tenant scoping and deterministic measurement / money rules intact.
5. Run the relevant focused checks, then the full repository gate when appropriate:

```bash
make check       # fast Ruff + ESLint
make test        # backend pytest + frontend Vitest, without coverage
make ci          # full scripts/eval.sh gate
```

Frontend-specific commands run from `frontend/`: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run test`. Backend checks run from `backend/` with the venv active, or use `make ci` from root. Do not confuse `scripts/eval.sh`'s installed-tool checks with `make test`; `make test` invokes the project test suites directly.

## How a clip becomes a ticket

```text
upload → normalize/hash → frame sampling → SAM segmentation/tracking
       → placard OCR → certified truck lookup → mask geometry fill estimate
       → debris classification → deterministic anomaly checks and valuation
       → draft ticket + evidence/trace → human confirm, override, or dispute
```

The AI boundary is under `backend/app/ai/`: the client protocol/factory chooses mock or live model clients, and fixtures support repeatable zero-credit development. Pipeline orchestration and evidence are in `backend/app/pipeline/`. Fill geometry, anomaly decisions, and ticket money calculations are code-driven and auditable. Tickets remain drafts for human review.

Architecture is documented in [Readme.md](Readme.md#-architecture), with a component diagram and implementation status notes.

## Repository map

| Path | Responsibility |
|---|---|
| `backend/app/main.py` | FastAPI lifespan, health endpoint, API router registration |
| `backend/app/api/` | HTTP routes for auth/session, tickets, ingest, trucks, sources, users, chat, reports, billing, and system data |
| `backend/app/ai/` | Meta model client abstraction, live/mock clients, model/task configuration, fixtures, API logging |
| `backend/app/pipeline/` | Clip ingest/transcode/frames, SAM measurements, cache, evidence, trace, ledger, source adapters, orchestration |
| `backend/app/tickets/` | Ticket schemas/domain, repository, seed data, exact money math, billing and exports |
| `backend/app/db/` | SQLAlchemy models, engine/session setup, tenant database context and portable types |
| `backend/tests/` | Backend API, pipeline, database, auth, ticket, billing and media tests |
| `frontend/src/app/` | Next.js routes/screens: overview, console, new ticket, pipeline, reports, billing, trucks, admin, guide, showcase |
| `frontend/src/components/` | Screen workflows and shared UI, auth, shell, AI, review, reports, billing, admin |
| `frontend/src/lib/` | Typed API client, auth/query hooks, formatting, themes and app mode |
| `infra/rbac/` | PostgreSQL RBAC schema and row-level security policies |
| `scripts/` | Repeatable setup, dev, evaluation, live-check, probe and demo-cache tasks |
| `.github/workflows/` | CI, security scan and manually dispatched deployment workflows |

## Configuration

The backend reads the repository-root `.env` using typed settings in `backend/app/config.py`. Keep secrets in `.env`, which is ignored by Git; never put service-role credentials or model keys in frontend `NEXT_PUBLIC_*` variables.

| Variable | Purpose |
|---|---|
| `MODEL_API_KEY` | Enables live Meta model requests when valid and mock mode is off |
| `MOCK_AI` | `1` forces fixture replay; `0` allows live requests if a valid key exists |
| `DATABASE_URL` | Database URL; host default is local SQLite, Compose overrides to local Postgres |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | Supabase auth / Postgres integration settings; service role key is backend-only |
| `REDIS_URL` | Redis connection for worker/queue integrations; not needed for host dev server startup |
| `BUILD_SPEND_CAP_USD`, `SPEND_WARN_USD` | Pipeline spend guardrails |
| `NEXT_PUBLIC_APP_MODE`, `NEXT_PUBLIC_JUDGE_TICKET_ID` | Frontend build-time demo/judge mode settings |
| `MODEL_API_LOG_PATH`, `EVIDENCE_DIR` | Local paths for model exchange logs and processed evidence (sensitive artifacts; ignored by Git) |

See the complete list and comments in [.env.example](.env.example). Configuration defaults and additional pipeline tuning knobs live in [backend/app/config.py](backend/app/config.py).

## Working safely in this codebase

- Preserve tenant scoping in both API access and Postgres row-level security. Add or update policies for new tenant data tables.
- Keep fill, capacity checks, anomaly rules, and money arithmetic deterministic; model outputs are inputs/evidence, not the authority for ticket quantities or prices.
- Avoid committing `.env`, model logs, customer clips, evidence, or generated media. `.gitignore` documents the local artifact exclusions.
- When adding a module or moving responsibility, update the [architecture map](docs/ARCHITECTURE_MAP.md) as part of the same change.
- Do not assume every architecture note is already deployed: the architecture map, plans, and research notes include planned seams. Verify the current implementation before extending them.

## Documentation guide

- [Product and end-to-end design](Readme.md) — problem, workflow, model boundary, product screens and system overview.
- [Architecture map](docs/ARCHITECTURE_MAP.md) — change-to-file map and data flow.
- [Plan](PLAN.md) — project plan, design decisions and planned work.
- [Progress](docs/PROGRESS.md) and [changelog](CHANGELOG.md) — status and implementation history.
- [Lessons learned](LEARNINGS.md) — implementation and model-call findings.
- [Deployment](docs/DEPLOYMENT.md) — deployment targets and caching strategy.
- [Scripts reference](scripts/README.md) — script purpose and flags.
- [Backend guide](backend/README.md), [frontend guide](frontend/README.md), and [RBAC guide](infra/rbac/README.md) — subsystem notes.
- [Research](Research.md) and [hackathon notes](Hackathon.md) — project context and evaluation material.

## Current scope notes

This repository includes a working full-stack application and tests, alongside forward-looking design documentation. The default local path is seeded SQLite and fixture-backed AI when no real model key is supplied. The Compose path uses local Postgres and Redis. Supabase/RLS configuration and worker/queue architecture are represented in code and infrastructure notes, but should be checked for the specific workflow being developed; the upload pipeline currently runs synchronously in the API process.
