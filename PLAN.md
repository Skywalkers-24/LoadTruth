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

## 1a. The 9.5+ playbook (read this before building anything)

The plan below is comprehensive. A comprehensive plan is not what wins — a **narrow, flawless, unforgettable demo backed by one real metric** is. Judges score what runs in 3 minutes, not what's written here. This section is the override: when the plan and this section conflict, **this section wins.** Everything here exists to move a specific rubric axis from "good" to "undeniable."

### The governing principle: cut to win, don't build to impress

A 10-day solo build that ships multi-tenant SaaS + RBAC + RLS + ARQ + analyst chat + 6 surfaces almost always lands as a thin, half-working platform. "Ambitious but broken" scores **lower** than "narrow but flawless." There is no feature-count criterion. Every hour spent on invisible infrastructure is an hour not spent on the benchmark and the demo — the only two things that actually move the score.

### Scope decision (make it now, honor it to the end)

| Keep (demo spine + depth) | Cut or defer to a "roadmap" slide |
|---|---|
| Video-to-ticket pipeline (the whole technical core) | **Multi-tenancy / RLS / RBAC** → single seeded tenant, hardcoded. Invisible to judges, costs days. "Architected for multi-tenancy" on a slide is enough. |
| Review console with confirm/override | **Multi-source ingest** (RTSP/HLS/IP-cam/bucket/webhook) → **upload only**. Zero demo payoff, pure engineering cost. |
| **Dollar-delta** on every ticket (see below) | 4 of 6 product surfaces → keep upload, review console, dashboard. Admin reduced to a seed script. |
| Accuracy benchmark (started **early**, not day 9) | — |
| One clean dashboard view + FEMA audit-packet export | — |
| AI Analyst chat — **only if rock-solid**; otherwise cut | A flaky chat on stage costs more than no chat. Decide by day 8: polished or gone. |

Rule of thumb: if a judge can't *see* it in the demo and it isn't the benchmark, it's a candidate for the cut list.

> **Reconciliation with existing work:** the multi-tenant RLS/RBAC *data layer* is already built and green (`infra/rbac/`, `app/db/tenant.py`, auth guard). "Cut" here means **don't build more of it** — no auth/role/admin *screens*, no extra tenants — not rip it out. Seed exactly one tenant on top of it and let it stand as the "architected-for multi-tenancy" proof at ~zero ongoing cost. See PROGRESS.md "Next" #3.

### The five moves that take each axis to 9.5+

**1. Impact — put money on screen.** The demo's defining frame is a dollar delta, not a fill %. Show: *monitor called 80% → LoadTruth measured 62% → 3.6 CY → $X overbilled on this truck → $Y across the event.* A judge who watches money move remembers the project. Store `monitor_call_fill_pct` alongside the estimate and compute the delta everywhere a ticket appears.

**2. Impact — get one real quote.** Run the 7-day validation plan in parallel with building. One email from a monitoring-firm ops manager or a county finance director confirming disputes cost real money, shown on a slide, converts Impact from "plausible" to "validated." Highest-leverage non-code task in the whole build.

**3. Meta tooling — make SAM 3.1 visibly *measure*, not just detect.** The surprise is the bed-rail mask + debris-surface mask producing a measured volume, with the overlay visibly reasoning about the load surface against the rails. "It found the truck" is table stakes; "it measured the load from pixels" is the frontier claim, shown not told.

**4. Technical depth — the benchmark is the whole axis; start it on day 2–3.** Pull clip collection and a first rough benchmark to the first days so you learn early whether monocular fill-% is achievable. If it comes back ±25%, you need time to fix the estimator or reframe the claim honestly. Add a fallback metric that can't be lost: *"LoadTruth agrees with the monitor X% of the time, and every disagreement links to an evidence frame the monitor checks in one click."* Even imperfect accuracy still wins on auditability. Surface a depth-you-can't-otherwise-see widget: cost ledger, cache hit rate, per-stage latency, the ±10% distribution across 50 clips.

**5. Demo — pre-cache, script tightly, film well.** Pre-cache the demo clip's entire pipeline run; the live path reads cache and is immune to network/API latency. Never show a judge a spinner. Script a 3-minute arc with tension and payoff: *truck enters → masks light up → ID read → fill measured → dollar delta appears → anomaly flags a fluffed load → monitor overrides one field in one click → audit packet PDF downloads.* The demo **video** is scored on its own ("genuinely cool to watch") — budget real day-10 time for a crisp recording with captions and pacing. A great project with a shaky screen-grab loses to an equal one that's well filmed.

### What this changes downstream

- §2 (multi-tenant SaaS), §7 tenancy tables, and §10's RLS/RBAC non-negotiables become **"architected-for, single-tenant in the demo build."** Seed one tenant; keep `tenant_id` columns so the architecture reads right, but don't build the auth/RLS/role screens unless days 8–10 are free.
- §3's six surfaces collapse to **three live surfaces** (upload → review console → dashboard) plus a seed script standing in for admin.
- §5 pipeline and §5a/§5b (budget + fixtures) stay exactly as-is — they are the core and the cost discipline.
- The schedule in §8 is superseded by §8a below.

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
2. **Sources + live queue** — video and image evidence can come from **multiple connected sources**, not just a manual upload. A tenant connects whatever it has: file upload (MP4/MOV/image), a pole-camera / tower RTSP or HLS stream, an IP/CCTV camera, a cloud bucket or shared drive that drops clips, or an inbound webhook / mobile capture from a field monitor's phone. Each connected source registers under the event; new evidence from any of them lands in the same realtime queue with live status: tracking → identifying → estimating → classifying → flagged for review. Upload is just one source among several — the pipeline treats every clip or frame identically once ingested, regardless of where it came from.
3. **Review console** *(demo centerpiece)* — the clip plays with SAM 3.1 mask overlays (truck, bed, debris). Right rail: detected truck ID, matched certified capacity, estimated fill %, debris class, computed cubic yards and dollar value, anomaly flags. The monitor **confirms** or **overrides** each field; every value links to its evidence frame.
4. **County dashboard & reports** — tickets table (monitor's call vs. LoadTruth estimate, dollar deltas, anomaly counts), an accuracy chart against the benchmark, fraud-exposure summary, and one-click **FEMA/FROC audit-packet export** (PDF bundle: tickets + evidence frames + anomaly log + accuracy statement).
5. **AI Analyst chat** *(second Meta-tooling moment)* — a Muse Spark chat grounded in the tenant's own data. Ask "which trucks had impossible cycle times this week and what's the dollar exposure?" or "draft the audit narrative for event X". Read-only: it answers, summarizes, and drafts, but never mutates tickets. Tool-calling over Postgres with tenant-scoped, parameterized queries.
6. **Admin** — event management, **source connections** (add/edit/test an upload target, RTSP/HLS stream, IP camera, cloud bucket, or webhook endpoint per event), truck registry (CSV import of certified capacities), rate tables per debris class, user invites/roles, and a tenant settings page. Lean: the registry and rate table are things the pipeline needs anyway.

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
                         │  /auth-context /sources /ingest /pipeline(SSE)   │
                         │  /tickets  (ingest accepts any connected source) │
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
source ─▶ 0 ingest(adapter) ─▶ 1 decode+sample ─▶ 2 track(SAM) ─▶ 3 identify(Spark) ─▶ 4 capacity lookup
                                                                      │
   7 ticket(Spark) ◀─ 6 anomalies ◀─ 5 fill% + class(SAM geometry + Spark) ◀┘
```

**Stage 0 — Ingest from any connected source.** A source adapter normalizes input into a clip/image + metadata, whatever the origin: direct file **upload**, a pulled **RTSP/HLS stream** segment from a pole/tower or IP camera, a file dropped into a connected **cloud bucket / shared drive**, or an inbound **webhook / mobile capture**. Each source is a registered `source` row under the event; the adapter fetches the bytes, records provenance, and hands a uniform artifact to Stage 1. Everything downstream is source-agnostic.

**Stage 1 — Decode & sample.** `ffmpeg`/`PyAV` pulls keyframes at 2–4 fps (single-image inputs skip sampling). Frames and the source clip go to tenant-scoped Supabase Storage. A content hash becomes the cache key for every downstream call.

**Stage 2 — Track & segment (SAM 3.1).** Upload the MP4 with `purpose=user_data`, then stream `sam-3.1` with noun-phrase prompts `"dump truck"`, `"truck bed"`, `"debris pile"`, `"truck placard"`. SAM 3.1 follows each object across frames in one pass. Parse the streamed grammar with `meta_sam_parser`; store per-frame boxes and masks (`object_id`, `frame`, box, `foreground_pixels`). Masks persist as SVG + packed pixel counts so stage 5 is pure geometry, not re-segmentation.

**Stage 3 — Identify the truck (Muse Spark).** Crop the `"truck placard"` region from the clearest frame → `muse-spark-1.3` with a structured-output prompt → `{truck_id, confidence, frame_ref}`. Full-frame fallback if the crop is low confidence.

**Stage 4 — Capacity lookup.** Match `truck_id` against the tenant's certified-truck registry. Fuzzy match + pgvector similarity guards OCR noise. Returns certified bed volume (cubic yards) and body type.

**Stage 5 — Estimate fill % + classify debris.** Geometry first: the bed-rail mask gives the reference plane and bed opening; debris-pile surface area vs. bed opening, plus a depth prior from body type (and a second view when available), yields fill %. Deterministic and explainable — the number traces to pixels. In parallel, Muse Spark classifies debris into vegetative / C&D / white goods with confidence. Cubic yards = certified volume × fill %; dollars = cubic yards × the tenant's class rate.

**Stage 6 — Anomaly engine (deterministic rules + Spark reasoning).** Rules in code: duplicate truck within an impossible window, physically impossible cycle time, hollow/"fluffed" load (high surface area, low mask density across depth), capacity mismatch. Muse Spark writes a per-flag narrative so the monitor sees *why*.

**Stage 7 — Draft the ticket (Muse Spark).** Structured fields → FEMA/FROC-format load ticket (PDF + CSV), each field linked to its evidence frame. The ticket is a **draft** until a human confirms — human-in-the-loop as both product feature and accuracy safeguard.

Every AI call logs prompt, model, token usage, latency, and cost to `pipeline_runs` for the benchmark and the $150 budget ledger.

---

## 5a. Token & credit budget — how we stay under $150

The $150 is spent in two places: **SAM 3.1** on video (frames dominate the bill) and **Muse Spark** on text/reasoning tokens. The goal is to spend credits once per unique piece of evidence and never again. Concrete tactics, in priority order:

**Spend SAM once, reuse forever (biggest lever).**
- **Sample low:** 2–4 fps, and cap long clips — a 30 s haul clip at 2 fps is 60 frames, not 900. Trim to the window where the truck is actually in frame before sending.
- **Content-hash cache:** the Stage-1 hash keys every SAM + Spark result in `pipeline_runs`. A re-run (or the demo's live path) reads the cache and costs **$0**. Pre-cache the demo clip so the stage is network-immune.
- **One SAM pass per clip:** all four noun phrases (`dump truck`, `truck bed`, `debris pile`, `truck placard`) go in a single streamed request, not four. Masks persist as SVG + packed pixel counts so Stage 5 is pure geometry — we never re-segment to recompute fill %.
- **Downscale frames** to the smallest resolution SAM still tracks well (e.g. 720p) before upload.

**Make Spark calls small and few (second lever).**
- **Keyframes only:** OCR, debris class, and ticket draft run on the 1–3 clearest frames, not every sampled frame. Pick the sharpest frame (highest mask confidence / least blur) per task.
- **Crop before you send:** Stage 3 sends the cropped placard region, not the full frame — fewer image tokens, better OCR. Full-frame is the fallback, not the default.
- **Tight structured output:** constrain Spark to a strict JSON schema with the minimum fields; short system prompts, no few-shot examples once a prompt is proven. Cap `max_output_tokens` per task (small for OCR/class, larger only for narratives).
- **Deterministic code does the math, not the model:** fill %, cubic yards, dollars, and the anomaly rules are plain Python. Spark only *narrates* a flag that code already decided — it never recomputes numbers, which keeps output tokens tiny.
- **Batch per clip:** classify debris and draft the ticket in as few round-trips as the schema allows rather than one call per field.

**Chat (analyst) cost control.**
- Tool-calling returns compact rows, not raw tables — the model reasons over summaries, not full result sets.
- Modest `reasoning_effort` and a per-session token cap; stream so we can stop early.

**The spend split: $90–100 build, ~$50–60 reserved for judging.**
The $150 is deliberately divided. We spend **at most $90–100 during the 10-day build** (the benchmark sweep + a few real round-trips to prove each stage). The remaining **~$50–60 is held in reserve for judging week** so the live demo, any re-recording, and judges poking at the deployed app never risk hitting an empty balance. The live spend counter enforces this as **two thresholds, not one**: a soft warning as build spend approaches ~$80, and a hard cap that pauses *build* pipeline runs at **$100**, leaving the rest untouched until the demo. The hard cap is configurable (`BUILD_SPEND_CAP_USD=100`) so we can lift it deliberately for the final rehearsal.

**Guardrails so a bug can't drain credits.**
- **Live spend counter** reads `pipeline_runs.cost_usd` and shows remaining budget on the dashboard; soft warn near $80, hard pause of build runs at $100, with ~$50 reserved for judging.
- **Dev/offline mode:** a `MOCK_AI` flag replays the local fixture responses (see §5b) so UI and plumbing work gets built without touching the API at all. Most of the 10 days run against fixtures; real credits are spent only on the benchmark and on confirming each stage once.
- **Benchmark once:** the 50-clip benchmark runs a single time against real APIs, results stored; we read stored numbers afterward instead of re-running.

Rough envelope: the benchmark (~50 clips × one SAM pass + ~3 Spark keyframe calls) plus a handful of per-stage confirmation runs is the dominant build cost, and sampling + caching + cropping keep it inside the $90–100 build budget — the $100 hard cap is the backstop, and the reserve guarantees the demo always has credits.

---

## 5b. Local fixture library (zero-credit dev + labeled scenarios)

Day-to-day development, UI work, and automated tests run entirely against a committed fixture set — no API calls, no credits. The fixtures live under `backend/tests/fixtures/` (media) and `backend/tests/fixtures/responses/` (recorded SAM + Spark payloads), and `MOCK_AI=1` wires the AI clients to replay them instead of calling Meta.

**How it works.**
- Each fixture is a small sample video or image plus the **recorded real API responses** for that input (captured once, during the benchmark, keyed by the same content hash the live cache uses). So mock mode and live mode return byte-identical SAM masks and Spark JSON — the UI and pipeline can't tell the difference, and switching `MOCK_AI` off later needs no code changes.
- A tiny set of synthetic/edge inputs (blank frame, no truck, garbled placard) have **hand-written** fixture responses for the failure paths we can't easily film.

**Labeled scenarios — positive and negative.** The fixture set is curated so every rule and UI state has a reproducible input:

| Scenario | Input | Expected result |
|---|---|---|
| ✅ Clean full load | clear clip, readable placard, ~90% full | ticket drafts, high confidence, no flags |
| ✅ Clean partial load | readable placard, ~40% full | correct fill %, no flags |
| ✅ Image-only evidence | single sharp photo, no video | pipeline skips sampling, still drafts a ticket |
| ⚠️ Low-confidence placard | blurred/angled placard | OCR low confidence → "needs review", full-frame fallback fires |
| ⚠️ Unknown truck | placard reads an ID not in the registry | capacity lookup fails → flagged, no auto-match |
| 🚩 Hollow / "fluffed" load | high surface area, low fill depth | hollow-load anomaly fires with narrative |
| 🚩 Impossible cycle time | same truck ID twice within minutes | duplicate / impossible-cycle anomaly fires |
| 🚩 Capacity mismatch | load visibly exceeds certified CY | implausible-quantity flag |
| ❌ No truck in frame | street/empty footage | pipeline reports "no truck", drafts nothing |
| ❌ Corrupt / unreadable media | truncated file | ingest fails gracefully with a clear error |

These doubly earn their keep: they drive the **pytest** suite for the anomaly rules and quantity math (no credits, runs in CI), they populate a believable demo tenant with realistic clearly-labeled sample data, and they're exactly the positive/negative cases a judge will want to click through. The ✅/⚠️/🚩/❌ labels map to the review console's confirm / needs-review / anomaly / error states.

A `scripts/record-fixtures.sh` captures fresh real responses for a clip (the only script that deliberately spends credits), and `scripts/seed-demo.sh` loads the fixture tenant for local runs and the demo.

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
sources         id, tenant_id, event_id, kind(upload|rtsp|hls|ip_camera|cloud_bucket|webhook|mobile), name, config(jsonb), status, created_at
clips           id, tenant_id, event_id, source_id, storage_path, media_kind(video|image), fps_sampled, content_hash, duration_s
pipeline_runs   id, tenant_id, clip_id, stage, model, status, tokens_in, tokens_out, latency_ms, cost_usd, cached
tracks          id, tenant_id, clip_id, object_label, sam_object_id, frames(jsonb boxes+mask refs)
tickets         id, tenant_id, event_id, clip_id, truck_id, certified_cubic_yards, debris_class, rate_per_cy,
                est_fill_pct, est_cubic_yards, est_dollar_value,                 -- LoadTruth's measured estimate
                monitor_call_fill_pct, monitor_cubic_yards, monitor_dollar_value, -- the human monitor's baseline call
                delta_cubic_yards, delta_dollar_value,                            -- persisted delta (see §7a) — the demo's money frame
                status(draft|confirmed|overridden|disputed), confirmed_fill_pct, evidence_frames(jsonb)
anomalies       id, tenant_id, ticket_id, type, severity, explanation, evidence_frame
benchmarks      id, tenant_id, clip_id, human_fill_pct, model_fill_pct, abs_error, within_10pct(bool)
reports         id, tenant_id, event_id, kind(audit_packet|accuracy|fraud), storage_path, generated_by, created_at
audit_log       id, tenant_id, actor, entity, action, before, after, created_at   -- append-only
```

RLS on every table keyed on `tenant_id` (and `role` where needed). Storage buckets `clips`/`frames`/`masks`/`tickets`/`reports` use tenant-prefixed paths and signed URLs only. The append-only `audit_log` is the "neutral evidence standard" the moat depends on.

---

## 7a. The dollar-delta (the demo's money frame — §1a move #1)

Every ticket carries both LoadTruth's measured estimate **and** the human monitor's call, so the delta between them is a first-class, persisted value — not something computed ad hoc in the UI. This is the number that goes on screen in the demo, because a judge who watches money move remembers the project.

**Definitions (all deterministic Python, never the model — per §5a):**

```
certified_cubic_yards   from the truck registry (Stage 4)
rate_per_cy             from the event's rate_table[debris_class] ($/CY)

# LoadTruth's measured estimate
est_cubic_yards   = certified_cubic_yards * (est_fill_pct / 100)
est_dollar_value  = est_cubic_yards * rate_per_cy

# the human monitor's call (entered in the review console; the baseline)
monitor_cubic_yards  = certified_cubic_yards * (monitor_call_fill_pct / 100)
monitor_dollar_value = monitor_cubic_yards * rate_per_cy

# the delta that goes on screen — signed, monitor minus LoadTruth
delta_cubic_yards  = monitor_cubic_yards  - est_cubic_yards
delta_dollar_value = monitor_dollar_value - est_dollar_value
```

**Sign convention:** positive delta = the monitor's call is **higher** than LoadTruth's measurement = potential **overbilling** (the money story). Negative = monitor under-called. Zero = agreement. The review console colors positive deltas in the "needs review" accent.

**Worked example (the demo clip):** certified 20 CY, monitor called 80%, LoadTruth measured 62%, C&D rate $12/CY.
- `monitor_cubic_yards = 20 × 0.80 = 16 CY` → `monitor_dollar_value = 16 × 12 = $192`
- `est_cubic_yards = 20 × 0.62 = 12.4 CY` → `est_dollar_value = 12.4 × 12 = $148.80`
- `delta_cubic_yards = 16 − 12.4 = 3.6 CY` → `delta_dollar_value = $192 − $148.80 = $43.20 overbilled on this one truck`

**Event roll-up:** the dashboard sums `delta_dollar_value` across confirmed tickets for the event → *"$Y in disputed volume flagged this event."* That single figure is the Impact-axis payoff and the pitch headline.

**Where it shows:**
- Review console right rail: monitor's call vs. LoadTruth, with the per-truck dollar delta.
- Dashboard: event-level roll-up + a per-contractor breakdown.
- FEMA audit packet: the delta column plus the evidence frame behind each estimate.

**Tests (pytest, no credits):** cover the four arithmetic paths (over-call, under-call, exact agreement, zero-rate / missing-capacity edge) so the money math is provably correct — this is also a Technical-depth signal.

---

## 8. 10-day schedule (mapped to README deliverables + platform)

| Days | Deliverable | Exit check |
|---|---|---|
| 1–2 | Monorepo scaffold, Supabase (auth + RLS + tenancy schema + buckets), multi-source ingest (upload + at least one stream/URL adapter), SAM 3.1 tracking streaming, **`MOCK_AI` fixture mode + labeled fixture library (§5b) + spend counter wired first** | A signed-in user in a tenant feeds a clip from a connected source and gets per-frame truck masks — and the whole flow also runs offline against fixtures at $0 |
| 3–5 | Fill-% estimator (geometry + depth), capacity lookup, truck registry + rate-table admin, ARQ worker | Fill % + cubic yards + dollars computed and shown with the overlay |
| 6–7 | Debris classification, anomaly engine, confirm/override review console, RBAC wired FE+BE | Monitor overrides a field; supervisor resolves a dispute; a flag shows its reason |
| 8 | County dashboard, reports, FEMA/FROC audit-packet export | Accuracy chart renders; audit packet PDF downloads |
| 9 | AI Analyst chat (tool-calling over tenant data), benchmark on 50+ clips | Chat answers a fraud question; ≥ target within ±10% |
| 10 | Demo video: truck → ticket → dispute resolved → analyst answers live; polish | 2–3 min recording + live run rehearsed |

**Day 0 (today):** scaffold, wire `.env` with the real `MODEL_API_KEY`, and get one `sam-3.1` + one `muse-spark-1.3` round-trip on a sample clip — then **immediately record those responses as the first fixtures** (`scripts/record-fixtures.sh`) so every subsequent dev run uses `MOCK_AI` at $0. The existing `test_api.sh` already proves auth works. From here on, real credits are spent only to record new fixtures and to run the one-time benchmark, staying inside the $90–100 build cap.

---

## 8a. Reprioritized 9.5+ schedule (supersedes §8)

This schedule enacts §1a: the benchmark starts on day 2, scope is cut to the demo spine, and days 8–10 are reserved for the dollar-delta polish, the (optional) analyst chat, and a well-filmed demo. The §8 table stays as the "full platform" reference; **build to this one.**

| Days | Deliverable | Exit check (what a judge would see) |
|---|---|---|
| 0–1 | Scaffold, **single seeded tenant** (no auth/RLS screens), `MOCK_AI` fixture mode + spend counter, one real SAM + one real Spark round-trip recorded as fixtures | Offline pipeline skeleton runs at $0; auth round-trip proven |
| **2–3** | **Clip collection + first rough benchmark (pulled early)** alongside the fill-% estimator (bed-rail vs. load-surface geometry + depth prior) and capacity lookup | A first honest accuracy number exists — enough to know if ±10% is reachable or the claim needs reframing |
| 3–4 | SAM 3.1 tracking + segmentation on real clips; **measurement overlay** (rails + load surface visibly reasoned) | Masks track across frames; fill % traces to pixels on screen |
| 5–6 | Review console with confirm/override + **dollar-delta everywhere** (`monitor_call_fill_pct` → CY → $ delta per ticket and per event); debris classification | Monitor overrides a field; the dollar overbill number appears and updates live |
| 6–7 | Anomaly engine (duplicate / impossible cycle / hollow-load / capacity mismatch) with Spark narrative per flag | A fluffed load fires a flag that explains *why*, linked to its frame |
| 7–8 | One clean dashboard view (monitor-call vs. estimate, dollar deltas, anomaly counts, **depth widget**: cost ledger + cache hit rate + ±10% distribution) + FEMA/FROC audit-packet export | Dashboard renders; audit packet PDF downloads |
| 8 | **Go/no-go on AI Analyst chat.** If days are free and it's solid, ship it; otherwise cut it cleanly and move the time to polish | Chat answers a fraud question reliably — or it's removed with no dangling UI |
| 9 | **Final benchmark on 50+ clips** (the one-time real-credit sweep), lock the accuracy + fallback-metric numbers for the pitch | ≥ target within ±10%, or the auditability fallback framing is ready |
| 10 | **Pre-cache the demo clip's full run**, rehearse the 3-minute live arc, record a crisp captioned demo video, build the pitch slides (dollar delta + one real quote) | Live path reads cache (spinner-free); demo video is clean and genuinely watchable |

**Parallel, non-code track (days 1–9):** run the validation outreach from the README — interview monitoring-firm ops managers and county contacts — to land **one real quote or letter of intent** for the Impact slide. This is scheduled work, not optional.

**Cut list locked at day 0 (per §1a):** multi-tenant RLS/RBAC screens, multi-source ingest adapters beyond upload, and the admin surface (replaced by a seed script). These move to a "roadmap / architected-for" slide and are only revived if days 8–10 come free.

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
- **Cost control:** 2–4 fps sampling, content-hash caching of SAM + Spark, keyframe-only Spark calls, cropped inputs, strict/minimal structured output, deterministic math in code, a `MOCK_AI` fixture mode for day-to-day dev, and a live spend counter with a **$90–100 build cap** (reserving ~$50–60 for judging). Full strategy in §5a; fixture library in §5b.

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
6. Wire the multi-source ingest (upload + one stream/URL adapter) + realtime queue, then build outward along the day-by-day schedule.

Say the word and I'll start the scaffold at step 2.
