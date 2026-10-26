# Deployment & Caching (zero-budget, free tiers only)

LoadTruth must ship without paid infrastructure. This documents the free-tier
targets and, more importantly, the **caching strategy** that keeps it fast and
keeps us inside the $150 Meta Model API credit budget.

## Deploy targets (all free tier)

| Layer | Free service | Why |
|---|---|---|
| Frontend (Next.js) | **Vercel Hobby** or **Cloudflare Pages** | Free static + SSR, global CDN, zero config for Next. |
| Backend (FastAPI) | **Fly.io** free allowance or **Render** free web service | Containers from our Dockerfile; Fly keeps a small always-on VM in free allowance. |
| Worker (ARQ) | Same Fly app, second process, or fold into backend for the demo | Avoids a second paid service. |
| Database + Auth + Storage | **Supabase free tier** | 500MB Postgres, auth, storage, RLS — covers the whole data model. |
| Cache / queue | **Upstash Redis free tier** | Serverless Redis, generous free requests; used for ARQ + response cache. |

CI/CD never auto-deploys: `.github/workflows/deploy.yml` is `workflow_dispatch` only and no-ops when the relevant secret is absent, so we never fail a run or spend minutes before we opt in.

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

### 5. Build & dependency cache (free CI speed)
- GitHub Actions caches pip + npm (`cache:` in `setup-python`/`setup-node`) and Docker layers via `type=gha`, so CI stays fast within free minutes.

### Golden rule (enforced by the protocol)
> No uncached model call on any path that runs more than once. The demo path is pure cache reads.

## Local full-stack

`docker-compose.yml` runs backend + frontend + Postgres + Redis locally with no external accounts. For the fastest inner loop, use `./scripts/dev.sh` (no containers).

## Promotion flow

1. Push to a feature branch → CI runs (lint, type, test, build, docker build, CodeQL).
2. PR → review → merge to `main`.
3. Manually dispatch `Deploy` when ready (and once deploy secrets are set).
