# Deployment & Caching (Render + Cloudflare)

This documents the Render backend and Cloudflare frontend setup, plus the
**caching strategy** that keeps repeat processing inside the $150 Meta Model
API credit budget.

## Deploy targets (all free tier)

| Layer | Free service | Why |
|---|---|---|
| Frontend (Next.js) | **Cloudflare Workers** via OpenNext | Runs the Next App Router on Cloudflare's Workers runtime. |
| Backend (FastAPI) | **Render** web service | `render.yaml` deploys `backend/`, applies Alembic, and checks `/health`. |
| Database + Auth + Storage | **Supabase Postgres** | Use its session pooler URL in Render; the migration installs Supabase RBAC. |
| Cache / queue | Optional Redis | Configure `REDIS_URL` if enabling the worker/queue deployment path. |

On pushes to `main`, CI deploys the frontend to Cloudflare after backend and
frontend checks pass. Render deploys the backend from the same branch after CI
checks pass.

## First-time setup

### Render backend

1. Connect this Git repository in Render and create a Blueprint from `render.yaml`.
2. Set `DATABASE_URL` to the Supabase **Session pooler** URL. Keep the
   `postgresql+asyncpg://` driver prefix; use the pooler's host, port, and
   database, and require TLS (`?ssl=require`).
3. Set `MODEL_API_KEY` and `SUPABASE_JWT_SECRET` in the Render environment.
   Set `CORS_ORIGINS` to the exact Cloudflare Worker origin, for example
   `https://loadtruth-console.<your-workers-subdomain>.workers.dev`.
4. Deploy `main`. Render runs `alembic upgrade head` before Uvicorn starts and
   uses `/health` for its health check. The service URL is
   `https://loadtruth-api.onrender.com`.

The free Render service may sleep when idle and its local filesystem is
ephemeral. Evidence files and model logs are written under `/tmp`; configure
durable object storage before relying on them across restarts.

### Cloudflare frontend

The frontend is Next.js with server rendering, so it deploys as a Cloudflare
Worker through `@opennextjs/cloudflare`, not as the reference repo's static Vite
asset bundle. Browser API calls go directly to Render so large uploads do not
pass through the Worker. The public API URL is embedded at build time.

Manual build and deploy from the repo root:

```bash
cd frontend
npm ci
export BACKEND_URL=https://loadtruth-api.onrender.com
export NEXT_PUBLIC_API_URL=https://loadtruth-api.onrender.com
npm run cf:build                 # Cloudflare-compatible Next build
npm run preview                  # optional local Workers-runtime preview
npx wrangler login               # one-time local authentication
npm run deploy                   # rebuild and deploy the Worker
```

For GitHub auto-deploys, add repository secrets `CLOUDFLARE_API_TOKEN` (Edit
Cloudflare Workers permission) and `CLOUDFLARE_ACCOUNT_ID`. The CI workflow
builds and deploys `loadtruth-console` when a push to `main` passes the backend
and frontend jobs. `frontend/wrangler.jsonc` contains the Worker entry point and
Render backend URL.

For Cloudflare Workers Builds connected directly to GitHub, set these build
settings so commands run in the Next.js project directory:

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run cf:build` |
| Deploy command | `npx wrangler deploy` |

Add these **build variables** (the public URL is embedded in the browser bundle;
neither value is a secret):

```text
BACKEND_URL=https://loadtruth-api.onrender.com
NEXT_PUBLIC_API_URL=https://loadtruth-api.onrender.com
```

With root directory set to `frontend`, Cloudflare detects `package-lock.json`,
installs dependencies, and finds `wrangler.jsonc`. Leaving the root directory at
`/` makes npm look for `/package.json`, which fails before the build starts.

If your Cloudflare Worker URL differs from the `CORS_ORIGINS` value in Render,
update that Render variable to the exact deployed origin and redeploy the API.

## Caching strategy (this is what makes it fast *and* cheap)

Caching is layered so the expensive thing — Meta Model API calls on video — happens **at most once per clip**, and repeat views cost nothing.

### 1. Model-result cache (the big one, saves credits)
- **Key:** content hash of the clip + stage + prompt + model. Deterministic.
- **Store:** results persisted in Postgres (`pipeline_runs`, `tracks`, masks in Storage). A second request for the same clip/stage reads the DB, never the API.
- **Effect:** the demo clip is processed once; every live re-run during judging is a cache hit. Directly protects the $150 budget (see LESSONS.md).

### 2. HTTP response cache
- Read-heavy GETs (dashboard lists, ticket detail, accuracy stats) set `Cache-Control` + `ETag`. Next.js RSC `fetch` uses `revalidate` tags; mutations call `revalidateTag`.
- Static assets served from the CDN (Vercel/Cloudflare) for free.

### 3. Edge / CDN cache
- Frontend static output and images cached at the edge automatically on Vercel/Cloudflare Pages — free global acceleration.

### 4. In-process + Redis cache
- Hot, small lookups (truck registry by number, rate tables) cached in-process with a TTL and backed by Upstash Redis so all backend instances share it.
- Supabase signed Storage URLs cached until just before expiry to avoid re-signing per request.

### Security scanning on a free private repo
CodeQL code scanning is free only for **public** repos; on a free **private** repo it needs paid GitHub Advanced Security and fails at the upload step. So CI uses free equivalents: `gitleaks` (secret scan) in `.github/workflows/security.yml`, plus `bandit`, `pip-audit`, and `npm audit` in `scripts/eval.sh` and CI. Re-enable CodeQL only if the repo goes public or gets Advanced Security.

### 5. Build & dependency cache (free CI speed)
- GitHub Actions caches pip + npm (`cache:` in `setup-python`/`setup-node`) and Docker layers via `type=gha`, so CI stays fast within free minutes.

### Golden rule (enforced by the protocol)
> No uncached model call on any path that runs more than once. The demo path is pure cache reads.

## Local full-stack

`docker-compose.yml` runs backend + frontend + Postgres + Redis locally with no external accounts. For the fastest inner loop, use `./scripts/dev.sh` (no containers).

## Promotion flow

1. Push a feature branch and open a PR; CI checks code, tests, and builds.
2. Merge to `main`; Render and Cloudflare deploy after their respective checks.
