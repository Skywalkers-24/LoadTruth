# LoadTruth — End-to-End Build Plan

> Video-verified load tickets for hauling paid by the cubic yard, starting with disaster-debris removal.
> Meta Global AI Developer Hackathon · Indie track · Theme: Push the Frontier · Build window: Oct 26 – Nov 4, 2026.

This is the engineering plan. It turns the pitch in [Readme.md](./Readme.md) and the judging rubric in [Hackathon.md](./Hackathon.md) into a concrete, enterprise-grade, **multi-tenant platform** we can ship in 10 days and defend in a live demo.

> **Every agent working on this repo must follow the operating protocol in [.kiro/steering/agent-protocol.md](./.kiro/steering/agent-protocol.md)** — progress tracking ([docs/PROGRESS.md](./docs/PROGRESS.md)), changelog ([CHANGELOG.md](./CHANGELOG.md)), lessons learned ([docs/LESSONS.md](./docs/LESSONS.md)), reusable scripts ([scripts/](./scripts/README.md)), and the open-source code eval gate (`scripts/eval.sh`).

---

## 1. What we are optimizing for

The submission is scored on four axes. Every feature below maps back to one of them. There is **no "feature count" criterion**, so each platform feature is included only because it also serves a rubric axis — not for completeness theater.

| Criterion | Weight | How the build earns it |
|---|---|---|
| Impact | 30% | A real FEMA load ticket, a real dollar delta vs. the monitor's call, a one-click dispute, and an audit packet a county could actually file. |
| Use of Meta AI tooling | 25% | SAM 3.1 multi-object video tracking + segmentation, plus Muse Spark doing **five distinct jobs** (placard OCR, debris class, anomaly narrative, ticket drafting, and an analyst chat over our own data). One model, surprising range. |
| Technical depth & execution | 20% | A measurable fill-% estimator, a cached pipeline, an anomaly engine, a benchmark on 50+ clips, and genuine multi-tenant isolation with RBAC — "thought through with real craft". |
| Demo | 25% | Clip in → verified ticket out with overlays, a dispute resolved live, and an AI analyst answering a fraud question on stage. |

**Primary success metric:** fill-% estimates within ±10% of careful human measurement on the benchmark set.

---

## 2. Platform shape: a real multi-tenant SaaS

LoadTruth is sold to monitoring firms and counties, so the platform is tenant-isolated from day one. Tenancy and roles are enforced at the **data layer** (Supabase Auth + Postgres RLS), which gives us enterprise isolation with almost no bespoke screens — the opposite of spending the sprint on admin CRUD.

### Tenancy model
- **Tenant = organization** (a monitoring firm or a county). Every row of operational data carries a `tenant_id`.
- **Disaster event** scopes work within a tenant (e.g. "Hurricane season 2026 — Pinellas County"). Trucks, clips, tickets, and benchmarks belong to an event.
- **Isolation** is enforced by Postgres RLS policies keyed on the JWT's `tenant_id` claim. No query can cross tenants, even if the API has a bug — the database refuses it.

### Roles (RBAC)

| Role | Can do | Primary screen |
|---|---|---|
| `monitor` | Review clips, confirm/override ticket fields | Review console |
| `supervisor` | Everything a monitor can, plus resolve disputes and reassign | Review console + queue |
| `county_admin` | Manage events, truck registry, rate tables, invite users, run reports | Admin + dashboard |
| `auditor` | Read-only across the tenant, export FEMA audit packets, use analyst chat | Dashboard + reports |
| `super_admin` | Cross-tenant platform ops (us) — tenant provisioning, usage, cost ledger | Platform console |

Roles are a Postgres enum on `memberships(user_id, tenant_id, role)`; a user can belong to multiple tenants with different roles. RLS policies check both `tenant_id` and `role`.

---

## 3. Product surface (what a judge clicks through)

Six surfaces, one story. The first three are the live-demo spine; the rest make it a believable platform.

1. **Auth + tenant switcher** — sign in (Supabase Auth), pick your organization and event. Role determines what you see.
2. **Upload / live queue** — drop a truck clip (or point at a pole-camera URL). It appears in a realtime queue with live status: tracking → identifying → estimating → classifying → flagged for review.
3. **Review console** *(demo centerpiece)* — the clip plays with SAM 3.1 mask overlays (truck, bed, debris). Right rail: detected truck ID, matched certified capacity, estimated fill %, debris class, computed cubic yards and dollar value, anomaly flags. The monitor **confirms** or **overrides** each field; every value links to its evidence frame.
4. **County dashboard & reports** — tickets table (monitor's call vs. LoadTruth estimate, dollar deltas, anomaly counts), an accuracy chart against the benchmark, fraud-exposure summary, and one-click **FEMA/FROC audit-packet export** (PDF bundle: tickets + evidence frames + anomaly log + accuracy statement).
5. **AI Analyst chat** *(second Meta-tooling moment)* — a Muse Spark chat grounded in the tenant's own data. Ask "which trucks had impossible cycle times this week and what's the dollar exposure?" or "draft the audit narrative for event X". Read-only: it answers, summarizes, and drafts, but never mutates tickets. Tool-calling over Postgres with tenant-scoped, parameterized queries.
6. **Admin** — event management, truck registry (CSV import of certified capacities), rate tables per debris class, user invites/roles, and a tenant settings page. Lean: the registry and rate table are things the pipeline needs anyway.

---

## 4. Architecture

```
                         ┌───────────────────────────────────────────────┐
                         │  Next.js 16 frontend (App Router, RSC)          │
                         │  Auth · Queue · Review · Dashboard · Chat · Admin│
                         │  Supabase JS (auth + realtime + storage)        │
                         └───────────────────┬─────────────────────────────┘
                                             │ HTTPS (REST + SSE), JWT w/ tenant_id+role
                         ┌───────────────────▼─────────────────────────────┐
                         │  FastAPI backend (Python 3.12, async)            │
                         │  /auth-context /ingest /pipeline(SSE) /tickets   │
                         │  /reports /export /chat(SSE) /admin              │
                         │  Pipeline orchestrator · Anomaly engine · RBAC   │
                         └───┬──────────────┬──────────────┬────────────────┘
                             │              │              │
             ┌───────────────▼──┐   ┌───────▼───────┐  ┌───▼──────────────┐
             │ Meta Model API   │   │ Supabase       │  │ Supabase Storage │
             │  sam-3.1 (stream)│   │ Postgres (RLS) │  │ clips·frames·    │
             │  muse-spark-1.3  │   │ + pgvector     │  │ masks·tickets    │
             │  (pipeline+chat) │   │ multi-tenant   │  │ (signed URLs)    │
             └──────────────────┘   └────────────────┘  └──────────────────┘
                                             │
                                     ┌───────▼───────┐
                                     │ Redis + ARQ    │  background video workers
                                     └────────────────┘
```

- **Frontend:** Next.js 16 (App Router, RSC, Server Actions), TypeScript strict, Tailwind v4, shadcn/ui, TanStack Query, Supabase JS for auth + realtime queue subscriptions.
- **Backend:** FastAPI (~0.141, `fastapi[standard]`) on Python 3.12, async-first. SQLAlchemy 2.0 async + asyncpg, Alembic migrations, Pydantic v2. A FastAPI dependency resolves the JWT into `(tenant_id, role)` and injects it into every query; RBAC is enforced in both the API and RLS (defense in depth).
- **Background work:** Redis + ARQ for the heavy video stages so API requests stay fast and progress streams to the queue via SSE + Supabase realtime. (Chosen over bare `BackgroundTasks` because a 10-stage pipeline across many clips needs retries and a durable queue — this reads as "engineering sound".)
- **AI:** Meta Model API via the official `openai` SDK at `https://api.meta.ai/v1`. `sam-3.1` for segmentation/tracking (streamed, parsed with `meta_sam_parser`); `muse-spark-1.3` for placard OCR, debris classification, anomaly narrative, ticket drafting, **and** the analyst chat (tool-calling over tenant data). `muse-code` as our build accelerator. Glimmer/Muse Image flagged for generating annotated evidence overlays in the ticket PDF once credits are live.

---

## 5. The video-to-ticket pipeline (the technical core)

Each stage is a discrete, cached, independently testable step. We sample frames at 2–4 fps to respect the $150 credit budget and cache SAM + Spark results so demo re-runs cost nothing.

```
clip ─▶ 1 decode+sample ─▶ 2 track(SAM) ─▶ 3 identify(Spark) ─▶ 4 capacity lookup
                                                                      │
   7 ticket(Spark) ◀─ 6 anomalies ◀─ 5 fill% + class(SAM geometry + Spark) ◀┘
```

**Stage 1 — Decode & sample.** `ffmpeg`/`PyAV` pulls keyframes at 2–4 fps. Frames and the source clip go to tenant-scoped Supabase Storage. A content hash becomes the cache key for every downstream call.

**Stage 2 — Track & segment (SAM 3.1).** Upload the MP4 with `purpose=user_data`, then stream `sam-3.1` with noun-phrase prompts `"dump truck"`, `"truck bed"`, `"debris pile"`, `"truck placard"`. SAM 3.1 follows each object across frames in one pass. Parse the streamed grammar with `meta_sam_parser`; store per-frame boxes and masks (`object_id`, `frame`, box, `foreground_pixels`). Masks persist as SVG + packed pixel counts so stage 5 is pure geometry, not re-segmentation.

**Stage 3 — Identify the truck (Muse Spark).** Crop the `"truck placard"` region from the clearest frame → `muse-spark-1.3` with a structured-output prompt → `{truck_id, confidence, frame_ref}`. Full-frame fallback if the crop is low confidence.

**Stage 4 — Capacity lookup.** Match `truck_id` against the tenant's certified-truck registry. Fuzzy match + pgvector similarity guards OCR noise. Returns certified bed volume (cubic yards) and body type.

**Stage 5 — Estimate fill % + classify debris.** Geometry first: the bed-rail mask gives the reference plane and bed opening; debris-pile surface area vs. bed opening, plus a depth prior from body type (and a second view when available), yields fill %. Deterministic and explainable — the number traces to pixels. In parallel, Muse Spark classifies debris into vegetative / C&D / white goods with confidence. Cubic yards = certified volume × fill %; dollars = cubic yards × the tenant's class rate.

**Stage 6 — Anomaly engine (deterministic rules + Spark reasoning).** Rules in code: duplicate truck within an impossible window, physically impossible cycle time, hollow/"fluffed" load (high surface area, low mask density across depth), capacity mismatch. Muse Spark writes a per-flag narrative so the monitor sees *why*.

**Stage 7 — Draft the ticket (Muse Spark).** Structured fields → FEMA/FROC-format load ticket (PDF + CSV), each field linked to its evidence frame. The ticket is a **draft** until a human confirms — human-in-the-loop as both product feature and accuracy safeguard.

Every AI call logs prompt, model, token usage, latency, and cost to `pipeline_runs` for the benchmark and the $150 budget ledger.

---

## 6. AI Analyst chat (second creative use of Muse Spark)

A tenant-scoped, read-only analyst. It directly scores on Use-of-Meta-Tooling and Demo.

- **Grounding:** tool-calling. Muse Spark is given a small set of safe, parameterized tools — `query_tickets(filters)`, `query_anomalies(filters)`, `event_summary(event_id)`, `accuracy_stats(event_id)`. Each tool runs a tenant-scoped SQL query (RLS still applies). The model never writes raw SQL and never mutates.
- **Capabilities:** answer operational/fraud questions, summarize an event, and **draft the audit narrative** that goes into the FEMA packet.
- **Streaming:** SSE with `max_output_tokens ≥ 4000` and modest `reasoning_effort` so first-token latency stays demo-friendly (per Meta's video/reasoning guidance).
- **Safety:** read-only by design. Resolving disputes and re-running the pipeline stay human actions in the review console, not chat actions.

---

## 7. Data model (Supabase Postgres, multi-tenant)

```
tenants         id, name, type(firm|county), created_at
users           (Supabase auth.users)
memberships     user_id, tenant_id, role(monitor|supervisor|county_admin|auditor|super_admin)
events          id, tenant_id, name, location, status, rate_table(jsonb by debris_class)
trucks          id, tenant_id, truck_number, body_type, certified_cubic_yards, registry_source, embedding(vector)
clips           id, tenant_id, event_id, storage_path, source(upload|pole_cam), fps_sampled, content_hash, duration_s
pipeline_runs   id, tenant_id, clip_id, stage, model, status, tokens_in, tokens_out, latency_ms, cost_usd, cached
tracks          id, tenant_id, clip_id, object_label, sam_object_id, frames(jsonb boxes+mask refs)
tickets         id, tenant_id, event_id, clip_id, truck_id, fill_pct, cubic_yards, debris_class, rate, dollar_value,
                status(draft|confirmed|overridden|disputed), monitor_call_fill_pct, evidence_frames(jsonb)
anomalies       id, tenant_id, ticket_id, type, severity, explanation, evidence_frame
benchmarks      id, tenant_id, clip_id, human_fill_pct, model_fill_pct, abs_error, within_10pct(bool)
reports         id, tenant_id, event_id, kind(audit_packet|accuracy|fraud), storage_path, generated_by, created_at
audit_log       id, tenant_id, actor, entity, action, before, after, created_at   -- append-only
```

RLS on every table keyed on `tenant_id` (and `role` where needed). Storage buckets `clips`/`frames`/`masks`/`tickets`/`reports` use tenant-prefixed paths and signed URLs only. The append-only `audit_log` is the "neutral evidence standard" the moat depends on.

---

## 8. 10-day schedule (mapped to README deliverables + platform)

| Days | Deliverable | Exit check |
|---|---|---|
| 1–2 | Monorepo scaffold, Supabase (auth + RLS + tenancy schema + buckets), clip ingest, SAM 3.1 tracking streaming | A signed-in user in a tenant uploads a clip and gets per-frame truck masks |
| 3–5 | Fill-% estimator (geometry + depth), capacity lookup, truck registry + rate-table admin, ARQ worker | Fill % + cubic yards + dollars computed and shown with the overlay |
| 6–7 | Debris classification, anomaly engine, confirm/override review console, RBAC wired FE+BE | Monitor overrides a field; supervisor resolves a dispute; a flag shows its reason |
| 8 | County dashboard, reports, FEMA/FROC audit-packet export | Accuracy chart renders; audit packet PDF downloads |
| 9 | AI Analyst chat (tool-calling over tenant data), benchmark on 50+ clips | Chat answers a fraud question; ≥ target within ±10% |
| 10 | Demo video: truck → ticket → dispute resolved → analyst answers live; polish | 2–3 min recording + live run rehearsed |

**Day 0 (today):** scaffold, wire `.env` with the real `MODEL_API_KEY`, and get one `sam-3.1` + one `muse-spark-1.3` round-trip on a sample clip. The existing `test_api.sh` already proves auth works.

---

## 9. UI direction (references)

Target a calm, dense, evidence-first "operator console" — dark analytics UI that reads as trustworthy infrastructure, not a toy.

- **Operator / review console:** dark-mode tracking and event-config dashboards on Dribbble's [dark-ui](https://dribbble.com/tags/dark-ui) and [dark-mode](https://dribbble.com/tags/dark-mode) tags — left timeline rail, large media canvas, right-side structured fields.
- **Evidence-review pattern:** feedback/evidence engines that turn video into structured reviewable records, like [Retick](https://retick.io/) and the [coordinated-behavior evidence dashboard](https://github.com/XoRoSh/democracy-hackathon-front) — each claim links to its frame.
- **Analytics dashboard & chat:** SaaS analytics layouts with clear data hierarchy; a docked analyst-chat panel beside the data it reasons over.

Design system: Tailwind v4 + shadcn/ui, Inter/Geist, one accent for "needs review", green/amber/red for confirm/flag/anomaly, translucent mask-overlay palette. Accessibility: keyboard-navigable review actions, visible focus states, WCAG AA contrast in dark mode.

*(Dribbble/GitHub references gathered via web search and paraphrased for compliance with licensing restrictions.)*

---

## 10. Enterprise-grade standards (non-negotiables)

- **Repo:** monorepo — `/frontend` (Next.js), `/backend` (FastAPI), `/infra` (Supabase migrations + RLS SQL), `/docs`.
- **Config:** everything via env (`MODEL_API_KEY`, Supabase URL/anon/service keys, DB URL, Redis URL). `.env` stays gitignored. Pydantic `BaseSettings` validates on boot. Service-role key is server-side only.
- **Multi-tenancy & RBAC:** RLS on every table + API-level role checks (defense in depth). Tenant isolation is tested, not assumed.
- **Typing & lint:** backend — `ruff` + `mypy` strict + Pydantic v2; frontend — TypeScript strict, ESLint, Prettier.
- **Tests:** `pytest` (async) for pipeline stages, anomaly rules, and **RLS tenant-isolation tests**; fixture clips with known fill %. Vitest + Playwright for the review flow. *(Added when you want them — not by default.)*
- **CI:** GitHub Actions — lint, type-check, test, build per PR; never push to `main` directly.
- **Observability:** structured JSON logs with request + tenant IDs, the `pipeline_runs` cost ledger, `/health`.
- **Security:** RLS, signed Storage URLs, no secrets in client bundles, parameterized tool-calling for chat, input validation everywhere, append-only audit log.
- **Cost control:** 2–4 fps sampling, content-hash caching of SAM + Spark, keyframe-only Spark calls, live spend counter vs. the $150 budget.

---

## 11. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| Platform breadth eats demo-critical pipeline time | Tenancy/RBAC live at the data layer (cheap); only 2 admin screens; chat is read-only. Pipeline + review console are built first (days 1–7). |
| Irregular vegetative loads hard to measure | Deterministic geometry + depth prior + mandatory human-confirm; report confidence, not false precision |
| SAM cost on long clips | 2–4 fps sampling, cache by content hash, reuse `file_id` across stages |
| Placard OCR failure | Spark full-frame fallback + fuzzy/vector registry match + manual override |
| Spark reasoning returns empty | `max_output_tokens ≥ 4000`, stream, lower `reasoning_effort` |
| Chat leaks cross-tenant data | Tool-calling only (no raw SQL), tenant-scoped parameterized queries, RLS still enforced underneath |
| No real tower clips in time | Public storm-cleanup footage + phone video of local haul trucks; benchmark vs. careful manual measurement |
| Demo flakiness | Pre-cache the demo clip's pipeline run; live path reads cache, immune to stage network latency |

---

## 12. Immediate next actions

1. Confirm this full-platform plan and the stack (Next.js 16, FastAPI/Python 3.12, Supabase, Redis/ARQ).
2. Scaffold the monorepo (`/frontend`, `/backend`, `/infra`, `/docs`).
3. Drop a real `MODEL_API_KEY` into `.env`.
4. Stand up Supabase: tenancy + RLS schema migration, roles, Storage buckets.
5. Prove one `sam-3.1` video round-trip + one `muse-spark-1.3` structured-output round-trip on a sample clip.
6. Wire the ingest endpoint + realtime queue, then build outward along the day-by-day schedule.

Say the word and I'll start the scaffold at step 2.
