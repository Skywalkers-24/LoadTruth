<div align="center">

# 🚛 LoadTruth

### Turning tower video into an auditable, machine-measured load ticket.

**A measurement problem, not a paperwork one.** After a disaster, how full a dump truck is gets decided by a tired human eyeballing it from a tower. LoadTruth replaces that guess with a number that traces back to pixels — using Meta's **SAM 3.1** for segmentation/tracking and **Muse Spark** for reading and classifying — and keeps a human in the loop to confirm every call.

Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) · Oct 26 – Nov 4, 2026
**Track:** Indie Developer · **Theme:** Push the Frontier
[Event notes & judging →](./Hackathon.md) · [Deep research & case studies →](./Research.md)

</div>

> **Developer setup:** see [CONTRIBUTING.md](CONTRIBUTING.md) for requirements, local startup, commands, repository map, and configuration.

---

## 📌 TL;DR

> After a hurricane, debris is hauled away by the **cubic yard**, and a short-term "tower monitor" estimates each truck's fill percentage by eye — often in 10% increments. That subjective estimate becomes the official **load ticket**, which is audited years later when the evidence is long gone.
>
> **LoadTruth points a camera at the tower instead.** A seven-stage pipeline tracks and segments each truck's bed and load (SAM 3.1), reads the ID placard and classifies the debris (Muse Spark), converts the segmentation masks into a fill % with a **deterministic geometry engine**, and flags anomalies (impossible cycle times, a load surface spanning the bed with low measured depth, loads above certified capacity) with a **rules engine**. Every figure links to its evidence frame; a human confirms or overrides each one.
>
> The core engineering idea: **the AI measures, but no model decides the number.** The fill % is a ratio of mask pixels; the arithmetic is exact `Decimal`; the anomaly checks are plain code. A model mistake can surface a flag for review — it can never silently redefine a record.

---

## 🧩 The problem, stated as a systems problem

A load ticket is a **quantity that nobody can independently reproduce.** That single property causes every downstream failure:

| Property of the current system | Consequence |
|---|---|
| The measurement is a human eyeball estimate | Not reproducible, not re-checkable, varies by operator and fatigue |
| The estimate *is* the record of record | The ticket becomes the single point of failure for the whole process |
| Verification happens years later, by audit | By the time anyone checks, the truck and the load are gone |
| Throughput is bounded by human attention | Scaling coverage means hiring more people, not better instruments |

So the real problem is: **produce a per-load volume measurement that is reproducible, evidence-linked, and cheap enough to run on every truck — without adding hardware to a site that only exists for 72 hours.**

### The scale that makes it worth solving well

These figures frame how large and how error-prone the current process is — they're the size of the problem, not a business projection:

<div align="center">

| Figure | Source |
|---|---|
| **~107 million cubic yards** of debris cleared in the 2024 season alone | [FEMA](https://www.fema.gov/press-release/20250926/recovery-continues-after-historic-2024-hurricane-season) |
| **$190,070,000** — a single county's 5-year debris-*monitoring* contract (Miami-Dade) | [Miami-Dade County](https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf) |
| **15M+ cubic yards** removed after Hurricane Sandy | [FEMA](https://news.va.gov/wp-content/uploads/sites/3/2013/10/FEMA-Sandy-One-Year-Fact-Sheet.pdf) |
| Trucks documented **above 500% of certified capacity** in a post-Katrina audit | [DHS OIG](https://www.oig.dhs.gov/sites/default/files/assets/GrantReports/OIG_DD-09-04_Jan09.pdf) |

</div>

That last row is the exact error LoadTruth is built to catch: a ticket says a 25 CY truck carried 125+ CY, and nothing in the old process could contradict it. Measuring the load surface against the bed rails makes that physically impossible to record unchallenged. ([11 sourced case studies →](./Research.md))

---

## ✅ How the system works

A phone or pole camera at the tower records every truck. LoadTruth turns that clip into a verified ticket in seven stages. Stages shaded **AI** call Meta models; stages shaded **deterministic** are pure code with no model in the loop.

```
┌─────────┐   ┌──────────────┐   ┌─────────────┐   ┌───────────────┐
│ 0–1     │   │ 2  SAM 3.1   │   │ 3  Muse     │   │ 4  Registry   │
│ Ingest  │──▶│ track + seg  │──▶│ Spark OCR   │──▶│ capacity      │
│ + hash  │AI │ bed/debris/  │AI │ read placard│AI │ lookup (fuzzy)│ det.
│ (cache) │   │ placard      │   │             │   │               │
└─────────┘   └──────────────┘   └─────────────┘   └───────┬───────┘
                                                            │
     ┌──────────────────────────────────────────────────────┘
     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────┐   ┌──────────────┐
│ 5  Geometry   │   │ 5b Muse Spark │   │ 6  Anomaly rules  │   │ 7  Draft      │
│ fill %        │──▶│ classify      │──▶│ (deterministic)   │──▶│ ticket +      │
│ DETERMINISTIC │det│ debris class  │AI │ capacity/cycle/   │det│ evidence +    │ det.
│ from masks    │   │               │   │ depth/uncertified │   │ exports       │
└───────────────┘   └───────────────┘   └───────────────────┘   └──────┬───────┘
                                                                        │
                                                        ┌───────────────┘
                                                        ▼  Human confirms / overrides (never authors)
```

1. **Ingest & hash** — the clip is normalized and SHA-256 content-hashed. The hash is the cache key for every downstream AI call, so re-processing the same footage is free and deterministic.
2. **Track & segment (SAM 3.1)** — text-prompted multi-object tracking/segmentation of `dump truck`, `truck bed`, `debris pile`, `placard` across frames, returning per-instance masks.
3. **Read placard (Muse Spark)** — OCR the truck's ID from the clearest frame.
4. **Capacity lookup** — the OCR'd ID is matched to the certified-truck registry with **fuzzy matching** (exact → normalized → edit-distance) so OCR noise fails loudly instead of guessing.
5. **Measure fill % (deterministic)** — the geometry engine turns the bed and load masks into `planar coverage × depth factor` (a body-type depth prior) → a fill % that is reproducible and traceable to the mask pixels.
6. **Classify debris (Muse Spark)** — vegetative / construction & demolition / white goods / hazardous / other; this selects the per-class rate.
7. **Flag + draft (deterministic)** — plain-Python rules raise `capacity_exceeded`, `impossible_cycle`, `surface_depth_mismatch`, `uncertified_truck`, `duplicate_truck`, `identity_unreadable`, `low_confidence`; Muse Spark only *narrates* a flag the rules already decided. A **draft ticket** is written with its evidence frames and the full stage trace.

The human monitor then reviews the draft — **confirm**, **override**, or **dispute**. They never type a ticket from scratch; they adjudicate a machine-made one.

---

## 🤔 Design questions this build answers

### Who creates a ticket? Is it automatic?

**The pipeline creates it, automatically — no human authors a ticket.** A clip arrives, the seven stages run, and a ticket is written in `draft` status. The only human action is review (confirm / override / dispute). This inverts the status quo: instead of *human measures → system records the human's guess*, it's *system measures from evidence → human adjudicates the measurement.*

In this build the clip arrives via a manual upload (the scope-cut demo path). The architecture already generalizes to automatic capture: a `sources` table + a per-kind **source adapter** layer (`upload`, `rtsp`, `hls`, `s3`, `gcs`, `azure_blob`, `google_drive`, `dropbox`, `webhook`) lets a fixed site camera or a cloud bucket feed clips with no human in the ingest step. The non-upload adapters validate their configuration today and are the wiring point for live capture.

### How does this scale to 1,000+ trucks a day?

Throughput and cost are the two things that break a naive "call a vision model per truck" design. The architecture addresses both:

- **Stateless, queue-fronted pipeline.** The orchestrator is pure application logic that takes an artifact + the tenant's registry/rate table and returns a result — it never touches the database. Ingest's job is to **enqueue** and return immediately; an ARQ (Redis-backed) worker pool drains the queue at whatever concurrency the budget allows. 1,000 clips/day is ≈ one every ~90s over an 8-hour window — comfortably absorbed by a small worker pool, with bursts smoothed by the queue rather than dropped.
- **Content-hash result cache.** Every clip is hashed; a repeat (duplicate capture, re-run, demo replay) returns the cached result for **zero model calls**. The cache key is the same hash the AI seam uses, so hot paths never re-pay.
- **Cost ledger + budget caps.** Each stage records spend; soft and hard caps (`spend_warn_usd` / `build_spend_cap_usd`) stop runaway cost when volume spikes — the single most important control for a per-call vision pipeline.
- **Pagination and event scoping everywhere.** Ticket lists, the review queue, and reports are all `limit/offset` paginated with a separate `COUNT`, and data is scoped to `(tenant_id, event_id)` on indexed hot paths, so query latency stays flat as a single event grows to tens of thousands of tickets.

**Honest status:** the queue is architected (the orchestrator is already fully decoupled from the request and the DB, so moving it behind a worker is a lift-and-shift) but not yet wired — today ingest runs the pipeline synchronously in the request, which is fine at demo volume. The live job store that powers the "AI Pipeline" view is process-local in-memory and becomes Redis/DB-backed at scale. These are the two seams to turn on for production throughput; nothing in the pipeline logic needs to change to do it.

---

## 🧠 The central engineering decision: AI measures, code decides

The fill % comes from a ratio of segmentation-mask pixels (`pipeline/geometry.py`), **not** a model saying "looks 80% full." Cubic yards and the monitor-vs-measured difference use exact `Decimal` arithmetic (`tickets/money.py`). Anomalies are plain-Python decisions (`pipeline/anomalies.py`); a model only phrases a flag the rules already raised.

Why this matters as a system property:

- **Auditability** — every number resolves to either a pixel mask or a rule a reviewer can read. There is no "the model felt this was right."
- **Failure isolation** — a model error can only *surface a draft for review* or *raise a flag*. It cannot change a recorded quantity. The human-confirm step is the backstop, and the deterministic core is what makes that review meaningful.
- **Testability** — the geometry, money math, registry matching, and rules are pure functions with unit tests; the AI is mocked by content hash, so the whole pipeline runs end-to-end offline and deterministically.

---

## 🤖 Meta AI usage & model configuration

LoadTruth uses two Meta models for complementary jobs, behind a single **AIClient seam** (`ai/base.py`) so swapping mock ↔ live changes nothing for callers:

| Model | What it does here | Billing shape |
|---|---|---|
| **SAM 3.1** (`sam-3.1`) | Text-prompted multi-object **tracking + segmentation** of truck / bed / debris / placard across video frames — the "where and how much" (pixels). | per 1k images |
| **Muse Spark 1.3** (`muse-spark-1.3`) | **Placard OCR**, **debris classification**, and one-line **anomaly narration** — the "what and who". | per 1M tokens |
| **Muse Wonder** (`muse-wonder-1.0`) | Optional upgrade for the hardest reasoning (e.g. the analyst chat) when capability matters more than cost. | per 1M tokens (premium) |

> SAM gives *where and how much*. Spark gives *what and who*. The deterministic engine turns both into an auditable quantity.

### Per-task model configuration

The pipeline makes **five distinct AI calls**, and each is independently tunable from the admin "AI & Models" screen — model, **reasoning effort**, and **cost mode** — because they have very different difficulty and volume. The catalog (`ai/catalog.py`) is the typed source of truth the settings UI renders.

| Task (pipeline stage) | Eligible models | Recommended model · effort | Why |
|---|---|---|---|
| `sam_track` — vision track & segment | SAM 3.1 | SAM 3.1 (no effort knob) | The measurement step; segmentation has no reasoning-effort dial |
| `spark_ocr` — read placard | Spark 1.1–1.3, Wonder | Spark 1.3 · **low** | Narrow perception task; minimal reasoning is plenty |
| `spark_classify` — debris class | Spark 1.1–1.3, Wonder | Spark 1.3 · **balanced** | Drives the rate; worth a little more care |
| `narrate_anomaly` — phrase a flag | Spark 1.2–1.3 | Spark 1.3 · **minimal** | Short, low-stakes output; keep it cheap |
| `analyst_chat` — grounded Q&A | Wonder, Spark 1.2–1.3 | Spark 1.3 · **balanced** | Can escalate to Wonder for hard questions |

**Reasoning effort** (`minimal → low → balanced → high → max`) maps to Meta's `reasoning_effort` parameter: higher effort spends more tokens for better quality on hard calls; lower effort is cheaper and faster for high-volume perception. **Cost mode** is `standard` (normal price, content never trained on) or `contributor` (heavily discounted in exchange for Meta training on your content; rate-limited, no `max` effort — never for sensitive data). Admins pick per task so capability and spend are tuned where it matters, not globally.

### Media handling & cost optimization (grounded in Meta's limits)

The seven stages are unchanged; what's optimized is *how bytes reach the models*, per the Meta docs (50 MB inline, 1 GiB Files-API upload, 50-image VLM budget, SAM billed per frame). `pipeline/media.py` + `frames.py` apply:

- **Sample, don't stream every frame.** Stage 1 samples at 2–4 fps and hard-caps the keyframe count (`max_sampled_frames`), so a 10-minute clip is ~120 frames to SAM, not 18,000 — and SAM is billed per frame, so this is the dominant cost lever.
- **Upload once, reuse the `file_id`.** A clip above ~8 MB is uploaded to the Files API once and referenced by id across all three per-clip calls (SAM track + Spark OCR + Spark classify) — the bytes travel once, not three times. Smaller clips go inline to skip the round-trip; clips over 1 GiB are rejected with `413`.
- **Few, downscaled keyframes for the VLM.** OCR and classification get a handful of evenly-spaced keyframes (far under the 50-image budget), each downscaled to a 1024 px longest edge so the base64 payload — and the input-token cost — stays small.
- **Content-hash cache + budget caps** mean repeats cost nothing and a volume spike can't run away. ([Full notes → LEARNINGS.md §5](./LEARNINGS.md))

### The $0-to-run seam

Each clip is content-hashed; the hash keys both the result cache and the fixture lookup. A **mock AI client** (`ai/mock.py`) replays recorded fixtures keyed by that hash, so the whole stack runs end-to-end with `MOCK_AI=true` at **zero credits and no network** — then flips to the live Meta Model API with one env var (`ai/factory.py` selects the client). The mock also steers scenarios by a filename prefix (`no-truck__clip.mp4`, `uncertified-truck__clip.mp4`, …) so each positive/negative path is demoable on demand.

---

## 🛠️ Architecture

### System architecture (current implementation)

This is a component and dependency view of the running code, not a sequence diagram. It includes the user interface, API/auth boundaries, pipeline and model seam, persistence, local artifacts, and optional integrations. The upload pipeline currently runs synchronously in the FastAPI process. Redis is started by Compose, but the current ingest path does not enqueue a worker job. Supabase JWT/RLS support exists as an integration path; the standard app login uses LoadTruth session tokens and API role checks.

```mermaid
architecture-beta
    group clients(cloud)[Clients]
    service operator(browser)[Operator] in clients
    service reviewer(browser)[Reviewer] in clients

    group web(server)[Next.js application]
    service next(server)[App Router and API proxy] in web
    service screens(server)[Screens and components] in web
    service webapi(server)[Typed API client] in web
    service authui(server)[Auth and role gates] in web

    group backend(server)[FastAPI application]
    service routes(server)[API routers] in backend
    service auth(server)[Session verification and RBAC] in backend
    service tenant(server)[Active tenant context] in backend
    service ingest(server)[Ingest route] in backend
    service repo(server)[SQL ticket repository] in backend
    service exports(server)[Reports billing and exports] in backend
    service chat(server)[Analyst chat] in backend

    group pipeline(server)[Pipeline and AI boundary]
    service media(server)[Upload hash transcode frames] in pipeline
    service orchestrator(server)[Pipeline orchestrator] in pipeline
    service sam(server)[SAM tracking and masks] in pipeline
    service spark(server)[Muse OCR classify narration] in pipeline
    service geometry(server)[Fill geometry and capacity] in pipeline
    service anomalies(server)[Deterministic anomaly rules] in pipeline
    service valuation(server)[Decimal valuation] in pipeline
    service trace(server)[Trace progress and job store] in pipeline
    service cache(server)[Result and stage caches] in pipeline
    service ledger(server)[Cost ledger and budget] in pipeline

    group storage(database)[Persistence and local artifacts]
    service db(database)[SQLAlchemy database] in storage
    service evidence(disk)[Evidence media] in storage
    service metalog(disk)[Redacted model API log] in storage
    service fixtures(disk)[Recorded AI fixtures] in storage

    group integrations(cloud)[External and optional integrations]
    service meta(cloud)[Meta Model API] in integrations
    service supabase(cloud)[Supabase JWT and Postgres RLS] in integrations
    service redis(cloud)[Redis ARQ queue optional] in integrations

    operator:R --> L:next
    reviewer:R --> L:next
    next:B --> T:screens
    screens:R --> L:webapi
    authui:B --> T:webapi
    webapi:R --> L:routes
    next:R --> L:routes

    routes:B --> T:auth
    auth:B --> T:tenant
    routes:R --> L:repo
    routes:R --> L:ingest
    routes:R --> L:exports
    routes:R --> L:chat
    ingest:B --> T:media
    media:R --> L:orchestrator
    orchestrator:L --> R:sam
    orchestrator:L --> R:spark
    sam:R --> L:meta
    spark:R --> L:meta
    orchestrator:B --> T:geometry
    geometry:R --> L:anomalies
    anomalies:R --> L:valuation
    orchestrator:B --> T:trace
    orchestrator:B --> T:cache
    orchestrator:B --> T:ledger
    cache:B --> T:repo
    repo:B --> T:db
    exports:B --> T:repo
    chat:B --> T:repo
    ingest:B --> T:evidence
    trace:R --> L:routes
    meta:B --> T:metalog
    fixtures:R --> L:spark
    fixtures:R --> L:sam
    tenant:R --> L:supabase
    redis:R --> L:orchestrator
```

The database defaults to SQLite on the host and uses Postgres in the Compose stack. AI stage results are persisted in the SQL repository; a separate in-process whole-pipeline cache avoids repeated work within a running process. Evidence media and redacted model logs are local filesystem artifacts by default. Fixture mode routes SAM/Spark calls to recorded scenarios and makes no external model request. The Supabase and Redis links mark integration seams rather than the primary local request path.

```
loadtruth/
├── backend/app/
│   ├── main.py              # FastAPI: lifespan, CORS, routers, /health
│   ├── config.py            # pydantic-settings; MOCK_AI, spend caps, model names
│   ├── ai/                  # ── the AI seam ──
│   │   ├── base.py          #   AIClient Protocol + normalized result types
│   │   ├── factory.py       #   picks Mock vs Live from config
│   │   ├── mock.py          #   fixture replay ($0, deterministic, scenario-steerable)
│   │   ├── live.py          #   real Meta Model API (SAM 3.1 + Muse Spark)
│   │   ├── catalog.py       #   models + efforts + cost modes + per-task config
│   │   └── config_store.py  #   admin's per-task model/effort selections
│   ├── pipeline/            # ── the 7-stage pipeline ──
│   │   ├── ingest.py        #   Stage 0–1: normalize + SHA-256 content hash
│   │   ├── frames.py        #   Stage 1: keyframe sampling (PyAV, optional)
│   │   ├── registry.py      #   Stage 4: fuzzy certified-capacity lookup
│   │   ├── geometry.py      #   Stage 5: DETERMINISTIC fill-% from masks
│   │   ├── anomalies.py     #   Stage 6: DETERMINISTIC rule engine
│   │   ├── orchestrator.py  #   runs stages 0–7; cache + ledger injected
│   │   ├── cache.py         #   content-hash result cache (Redis-ready)
│   │   ├── ledger.py        #   per-stage cost ledger + budget caps
│   │   └── sources.py       #   per-kind source adapters (upload/rtsp/hls/s3/gcs/…)
│   ├── tickets/
│   │   ├── money.py         #   exact Decimal CY math + monitor-vs-measured difference
│   │   ├── domain.py        #   Event/Ticket records
│   │   └── repository.py    #   async, tenant-scoped storage (paginated)
│   ├── db/                  # SQLAlchemy models, multi-tenant, SQLite→Postgres
│   └── api/                 # events, tickets, trucks, sources, ingest, reports, chat, system
│                            # (ARQ worker for off-request video is the planned next seam)
├── frontend/                # Next.js 16 operator console (overview, review, pipeline, reports, admin)
└── infra/rbac/              # Postgres schema + row-level-security policies
```

**Stack:** Python 3.12 · FastAPI · SQLAlchemy (async) · pydantic-settings · ARQ (Redis) worker · SQLite for dev → Supabase/Postgres with RLS for multi-tenant prod · Next.js 16 · Meta Model API (`sam-3.1`, `muse-spark-1.3`, `muse-wonder-1.0`).

### Data flow (one clip → one ticket)

```
capture/upload → POST /events/{id}/ingest → stages 1–7 → draft ticket + anomalies
                                          └─(planned: enqueue → ARQ worker)─┘
                                                                                        │
review console reads ticket + masks + stage trace → monitor confirms / overrides → exports (CSV / audit packet)
analyst chat → POST /chat → Muse Spark + read-only, tenant-scoped tools over the event's data
```

### Invariants (the rules the architecture enforces)

- **Tenant isolation** is enforced in *both* Postgres RLS and the API layer.
- **Every model call is cached by content hash**; repeats cost nothing.
- **No model decides a recorded quantity** — fill %, cubic yards, and anomalies are deterministic.
- **Heavy work stays off the request path** (worker/queue); the demo path reads cache only.

### API surface (implemented)

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + whether the Model API key is configured |
| `GET`/`POST`/`PATCH` | `/events…` | Manage disaster events & per-class rate tables |
| `POST` | `/events/{id}/ingest` | Run a clip through the pipeline → a draft ticket |
| `GET` | `/tickets`, `/tickets/{id}` | List/fetch tickets (paginated) with valuation + evidence |
| `PATCH` | `/tickets/{id}/monitor-call` | Record the monitor's call → computes the difference |
| `PATCH` | `/tickets/{id}/status` | Confirm / override / dispute a ticket |
| `GET` | `/tickets/{id}/pipeline` | The persisted AI stage trace for a ticket |
| `POST` | `/tickets/{id}/reverify` | Reproduce the fill % from stored evidence and return the evidence receipt |
| `GET`/`POST`/… | `/trucks…` | Certified-truck registry (unique per tenant) |
| `GET`/`POST`/… | `/events/{id}/sources…` | Connected evidence sources (upload, RTSP, bucket) |
| `GET` | `/events/{id}/dashboard` | Review progress, anomalies, agreement with monitor, summed difference |
| `GET` | `/events/{id}/export.csv` | Event tickets as CSV |
| `GET` | `/events/{id}/audit-packet.html` | Standalone HTML evidence packet for auditors |
| `GET`/`PATCH` | `/system/ai-config…` | Per-task model / effort / cost-mode configuration |
| `POST` | `/chat` | Grounded analyst Q&A over the event (read-only tools) |

---

## 🚀 Quick start

```bash
# 1. backend deps (uv)
cd backend && uv sync

# 2. configure — zero-credit dev needs nothing but this
cp ../.env.example ../.env
echo "MOCK_AI=true" >> ../.env          # replay fixtures, $0, no network

# 3. run the API (seeds a demo tenant + sample data on boot in SQLite)
uv run uvicorn app.main:app --reload
#   → http://localhost:8000/health   and   /docs for the OpenAPI UI

# full stack (backend + frontend + Postgres + Redis)
docker compose up          # → frontend http://localhost:3000
```

Sample ~1 MB test clips live in [`data_tests/`](./data_tests/README.md), named so each exercises a specific mock scenario (clean / unreadable placard / hollow / uncertified / no-truck). To run against the **live Meta Model API**, set `MODEL_API_KEY` and remove `MOCK_AI`; the factory switches clients automatically and the content-hash cache keeps repeat runs free.

```bash
cd backend && uv run pytest        # money math · record matching · rules · ingest scenarios
```

---

## ⚠️ Scope & honest limits

- **Upload-only capture in this build.** Automatic site-camera ingest is architected (sources + adapters) but the non-upload adapters don't do live network I/O yet.
- **Queue is planned, not wired.** Ingest runs synchronously today; adding an ARQ worker and enqueuing from ingest is the production throughput step and requires no pipeline-logic changes (the orchestrator is already request/DB-decoupled).
- **Irregular vegetative loads are the hardest to measure.** Mitigated by the human-confirm step, per-stage confidence scoring, and the ±10% accuracy benchmark.
- **Not a certification.** LoadTruth produces auditable evidence and flags; the responsible monitor retains authority over the official record.

---

## 📚 Sources & further reading

- **Project docs:** [Research.md](./Research.md) (design + 11 sourced case studies) · [Hackathon.md](./Hackathon.md) · [LEARNINGS.md](./LEARNINGS.md) (Meta model usage notes) · [docs/ARCHITECTURE_MAP.md](./docs/ARCHITECTURE_MAP.md)
- **Meta models:** [SAM 3.1](https://ai.meta.com/blog/segment-anything-model-3/) · [Muse Spark](https://dev.meta.ai/resources/blog/build-with-muse-spark)
- **FEMA debris volumes (2024):** https://www.fema.gov/press-release/20250926/recovery-continues-after-historic-2024-hurricane-season
- **DHS OIG debris-monitoring alert (Irma):** https://www.oig.dhs.gov/sites/default/files/assets/2018-10/OIG-18-85-Sep18.pdf
- **Miami-Dade $190M monitoring contract:** https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf
- **FEMA Debris Monitoring Guide:** https://www.fema.gov/sites/default/files/documents/fema_debris-monitoring-guide_sop_3-01-2021.pdf

<div align="center">

*Figures and quantities are paraphrased from government reports (FEMA, DHS OIG, GAO, DOJ) and news coverage linked inline; they establish the scale of the measurement problem, not any claim of certification. Content rephrased for compliance with licensing restrictions.*

</div>
