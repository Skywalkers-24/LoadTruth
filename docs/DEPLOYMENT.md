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
| Shared pipeline cache | Render Key Value (Redis-compatible) | The Render Blueprint creates a private Frankfurt instance and links its internal URL as `REDIS_URL`. |

On every push to `main`, Cloudflare Workers Builds deploys the frontend from its
connected Git integration, and Render immediately deploys the backend from its
connected Git branch. CI runs independently and reports code quality/build
status; it does not gate either production deployment.

## First-time setup

### Render backend

1. Connect this Git repository in Render and create a Blueprint from `render.yaml`.
2. Set `DATABASE_URL` to the Supabase **Session pooler** URL. Keep the
   `postgresql+asyncpg://` driver prefix; use the pooler's host, port, and
   database, and require TLS (`?ssl=require`).
3. Set `MODEL_API_KEY` and `SUPABASE_JWT_SECRET` in the Render environment.
   Set `CORS_ORIGINS` to the exact Cloudflare Worker origin, for example
   `https://loadtruth-console.<your-workers-subdomain>.workers.dev`.
   `REDIS_URL` is linked to the private Render Key Value instance by `render.yaml`;
   full pipeline-result caching is disabled by default to keep RAM bounded;
   reusable AI stage results remain in Postgres.
4. Deploy `main`. Render runs `alembic upgrade head` before Uvicorn starts and
   uses `/health` for its health check. The service URL is
   `https://loadtruth-api.onrender.com`.

The free Render service may sleep and its filesystem is ephemeral. Videos and
processed evidence now require private Backblaze B2 storage; there is no local
storage fallback. Set the `B2_*` secrets declared in `render.yaml` separately on
Render. Browser uploads and playback go directly to B2 using signed URLs. The
Demo Videos library and analysis queue are persisted in Postgres. Startup applies
migration `0004_demo_videos_jobs` and requeues interrupted work. See
[integration configuration](INTEGRATIONS.md) for CORS and per-clip limits.

### Cloudflare frontend

The frontend is Next.js with server rendering, so it deploys as a Cloudflare
Worker through `@opennextjs/cloudflare`, not as the reference repo's static Vite
asset bundle. Browser API calls use the Worker's same-origin `/api` rewrite to
reach Render, so sign-in works without cross-origin CORS settings.

Manual build and deploy from the repo root:

```bash
cd frontend
npm ci
export BACKEND_URL=https://loadtruth-api.onrender.com
npm run cf:build                 # Cloudflare-compatible Next build
npm run preview                  # optional local Workers-runtime preview
npx wrangler login               # one-time local authentication
npm run deploy                   # rebuild and deploy the Worker
```

The production Worker is connected through Cloudflare Workers Builds. It builds
and deploys commits pushed to its configured production branch (`main`). The
repo's GitHub Actions workflow does not deploy a second copy of the Worker;
Cloudflare's connected build is the single frontend deploy path.
`frontend/wrangler.jsonc` contains the Worker entry point and Render backend URL.

For Cloudflare Workers Builds connected directly to GitHub, set these build
settings so commands run in the Next.js project directory:

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run cf:build` |
| Deploy command | `npx wrangler deploy` |

In **Settings → Build → Branch control**, set the production branch to `main`.
With the Git integration connected and automatic production builds enabled,
each push to `main` runs the build and deploy commands above.

Add this **build variable** so Next.js bakes the correct rewrite destination:

```text
BACKEND_URL=https://loadtruth-api.onrender.com
```

With root directory set to `frontend`, Cloudflare detects `package-lock.json`,
installs dependencies, and finds `wrangler.jsonc`. Leaving the root directory at
`/` makes npm look for `/package.json`, which fails before the build starts.

The production build defaults `BACKEND_URL` to the Render API if the Cloudflare
build variable is unset. The Render CORS allowlist is not used for browser API
requests because they stay on the Worker's origin.

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

### 4. Shared pipeline-result cache
- `REDIS_URL` points to the private Render Key Value instance. It shares completed pipeline results across backend instances for seven days, scoped to a tenant and event.
- This full-result cache is disabled by default on free Render (`PIPELINE_RESULT_CACHE_ENABLED=false`). PostgreSQL AI-stage caching still avoids repeated model calls for saved stages.

### Security scanning on a free private repo
CodeQL code scanning is free only for **public** repos; on a free **private** repo it needs paid GitHub Advanced Security and fails at the upload step. So CI uses free equivalents: `gitleaks` (secret scan) in `.github/workflows/security.yml`, plus `bandit`, `pip-audit`, and `npm audit` in `scripts/eval.sh` and CI. Re-enable CodeQL only if the repo goes public or gets Advanced Security.

### 5. Build & dependency cache (free CI speed)
- GitHub Actions caches pip + npm (`cache:` in `setup-python`/`setup-node`) and Docker layers via `type=gha`, so CI stays fast within free minutes.

## Edge AI Proxy & Render Egress Optimization (Cloudflare Worker)

Render free web services enforce a strict 5 GB/month outbound data transfer (egress) limit. Multi-frame perception pipelines (SAM 3.1 & Muse Spark 1.3) can consume significant outbound bandwidth if video frames are repeatedly transmitted in base64. LoadTruth optimizes this via a two-layer edge architecture:

### 1. Single-Upload Transport (`MEDIA_INLINE_MAX_BYTES=0`)
- With `MEDIA_INLINE_MAX_BYTES=0`, the backend never transmits inline base64 video repeatedly across SAM concepts and Muse prompts.
- The clip is uploaded once to Meta's File API (`POST /v1/files`), returning a lightweight `file_id`.
- Subsequent SAM tracking and Muse tasks pass only the 30-character `file_id`, reducing outbound payload volume by over 80%.

### 2. Cloudflare Worker Edge AI Gateway
- **Route:** `/api/ai/v1/[...path]` (`frontend/src/app/api/ai/v1/[...path]/route.ts`).
- **Function:** Proxies streaming SSE completions, model inference, and file uploads directly from Cloudflare's edge network to `https://api.meta.ai`.
- **Egress Savings:** Cloudflare Workers provides unmetered outbound bandwidth. Setting `MODEL_API_BASE_URL=https://loadtruth.tiwabhay800.workers.dev/api/ai/v1` on Render routes AI model traffic through Cloudflare's global edge network.
- **Local Dev Isolation:** Local development, unit tests, and scripts leave `MODEL_API_BASE_URL` unset, defaulting directly to `https://api.meta.ai/v1` with zero proxy dependencies.

### Golden rule (enforced by the protocol)
> Reuse persisted perception results when the clip and AI configuration match. New narration can still run; bypass-cache intentionally requests fresh inference.

## Local full-stack

`docker-compose.yml` runs backend + frontend + Postgres + Redis locally. B2 credentials are now required for media storage and uploads. For the fastest inner loop, use `./scripts/dev.sh` (no containers).

## Promotion flow

1. Push a feature branch and open a PR; CI checks code, tests, and builds.
2. Merge to `main`; Render and Cloudflare deploy after their respective checks.
