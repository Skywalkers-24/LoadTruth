<div align="center">

# 🚛 LoadTruth

### Turning tower video into an auditable, AI-estimated load ticket.

**A measurement problem, not a paperwork one.** After a disaster, how full a dump truck is gets decided by a tired human eyeballing it from a tower. LoadTruth provides a frame-based visual fill estimate from **Muse Spark**, uses **SAM 3.1** to track the truck and load, and keeps a human in the loop to review every call.

Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) · Oct 26 – Nov 4, 2026
**Track:** Indie Developer · **Theme:** Push the Frontier
[Event notes & judging →](./Hackathon.md) · [Deep research & case studies →](./Research.md)

</div>

> **Developer setup:** see [CONTRIBUTING.md](CONTRIBUTING.md) for requirements, local startup, commands, repository map, and configuration.

---

## 📌 TL;DR

> After a hurricane, debris is hauled away by the **cubic yard**, and a short-term "tower monitor" estimates each truck's fill percentage by eye — often in 10% increments. That subjective estimate becomes the official **load ticket**, which is audited years later when the evidence is long gone.
>
> **LoadTruth points a camera at the tower instead.** A seven-stage pipeline tracks the truck and load (SAM 3.1), asks Muse Spark to estimate fill from multiple video frames and combines those estimates with a deterministic median, reads the ID placard, and classifies the debris. Compliance rules flag identity, certification, capacity, and cycle-time issues; fill-quality concerns are left for the monitor to review. Every figure links to its evidence.
>
> The core engineering idea: **Muse makes the visual fill estimate; deterministic code combines and values it.** SAM masks support truck/load tracking, not fill calculation. Cubic yards and dollars use exact `Decimal` arithmetic, while compliance checks are plain code. A monitor remains responsible for reviewing visual concerns.

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

A phone or pole camera at the tower records each truck. LoadTruth turns the clip into an evidence-linked draft ticket; the monitor reviews and adjudicates it.

```mermaid
flowchart LR
    upload[Video or image] --> ingest[Normalize, hash and sample]
    ingest --> sam[SAM 3.1<br/>Track truck, bed and load]
    ingest --> muse[Muse Spark<br/>Per-frame fill + debris class]
    ingest --> ocr[Muse Spark<br/>Placard OCR]
    ocr --> registry[Certified-truck registry]
    muse --> aggregate[Median of Muse frame estimates]
    aggregate --> quantity[Fill % → estimated cubic yards]
    registry --> quantity
    muse --> price[Apply debris rate with exact Decimal math]
    quantity --> price
    sam --> evidence[Persist masks and video evidence]
    price --> rules[Deterministic compliance checks]
    rules --> ticket[Draft ticket + stage trace]
    evidence --> ticket
    ticket --> monitor[Monitor confirms, overrides or disputes]
    monitor --> reports[Reports, audit packet and billing]
```

1. **Ingest & hash** — the clip is normalized and SHA-256 content-hashed. The hash is the cache key for every downstream AI call, so re-processing the same footage is free and deterministic.
2. **Track & segment (SAM 3.1)** — text-prompted multi-object tracking/segmentation of the truck, bed, debris and placard across frames, returning per-instance masks as visual evidence. SAM masks do not calculate or adjust fill.
3. **Read placard (Muse Spark)** — OCR the truck's ID from the clearest frame.
4. **Capacity lookup** — the OCR'd ID is matched to the certified-truck registry with **fuzzy matching** (exact → normalized → edit-distance) so OCR noise fails loudly instead of guessing.
5. **Estimate fill % (Muse Spark)** — Muse visually estimates fill from multiple sampled video frames. The pipeline uses the median of those estimates; SAM segmentation is not used to calculate, adjust, or flag the fill percentage.
6. **Classify debris (Muse Spark)** — vegetative / construction & demolition / white goods / hazardous / other; this selects the per-class rate.
7. **Flag + draft (deterministic)** — plain-Python rules can raise `capacity_exceeded`, `impossible_cycle`, `uncertified_truck`, and `identity_unreadable`; fill quality is left for monitor review rather than automatically flagged. A **draft ticket** is written with its evidence frames and the full stage trace.

The human monitor then reviews the draft — **confirm**, **override**, or **dispute**. They never type a ticket from scratch; they adjudicate a machine-made one.

### Quantity, unit and evidence

Muse estimates **visual fill percentage**, not a scale weight or a physical 3D volume. The ticket's Estimated cubic yards are calculated deterministically as certified truck capacity × Muse fill percentage. The visual pipeline neither infers nor records weight; actual weight would require a separate scale integration. SAM supplies trackable visual evidence so a reviewer can follow the same truck and inspect the masks alongside the source video.

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

**Current execution:** ingest runs synchronously in the API process. The orchestrator is the pipeline boundary; ARQ/Redis worker execution is a planned scale-out seam, not the current request path. Live progress and the whole-pipeline result cache are process-local; AI-stage results are persisted in the SQL database.

---

## 🧠 The central engineering decision: Muse estimates, code aggregates and prices

Muse Spark estimates fill visually in each sampled frame; the pipeline uses the median of those estimates. SAM segmentation is not an input to fill calculation. Cubic yards and the monitor-vs-measured difference use exact `Decimal` arithmetic (`tickets/money.py`). Compliance anomalies are plain-Python decisions (`pipeline/anomalies.py`); monitors review fill quality.

Why this matters as a system property:

- **Auditability** — the receipt preserves the source video, Muse's individual frame estimates, and the deterministic median/value calculations.
- **Failure isolation** — a model error cannot alter pricing rules or silently bypass human review. The monitor can confirm, override, or dispute the resulting draft.
- **Testability** — median aggregation, money math, registry matching, and compliance rules have unit tests; the AI is mocked by content hash, so the whole pipeline runs end-to-end offline and deterministically.

---

## 🤖 Meta AI usage & model configuration

LoadTruth uses two Meta models for complementary jobs, behind a single **AIClient seam** (`ai/base.py`) so swapping mock ↔ live changes nothing for callers:

| Model | What it does here | Billing shape |
|---|---|---|
| **SAM 3.1** (`sam-3.1`) | Text-prompted multi-object **tracking + segmentation** of truck / bed / debris / placard across video frames — visual tracking evidence, not fill measurement. | per 1k images |
| **Muse Spark 1.3** (`muse-spark-1.3`) | **Per-frame visual fill estimation**, **placard OCR**, **debris classification**, and one-line **anomaly narration**. | per 1M tokens |
| **Muse Wonder** (`muse-wonder-1.0`) | Optional upgrade for the hardest reasoning (e.g. the analyst chat) when capability matters more than cost. | per 1M tokens (premium) |

> SAM tracks the truck and load. Muse Spark estimates the fill visually. Deterministic code takes the median and calculates the resulting volume and value.

### Per-task model configuration

The AI catalog defines seven independently configurable task types. The admin "AI & Models" screen tunes each eligible task by model, **reasoning effort**, and **cost mode**; the catalog (`ai/catalog.py`) is the typed source of truth the settings UI renders.

| Task (pipeline stage) | Eligible models | Recommended model · effort | Why |
|---|---|---|---|
| `sam_track` — vision track & segment | SAM 3.1 | SAM 3.1 (no effort knob) | Produces the truck/load tracking evidence; segmentation has no reasoning-effort dial |
| `spark_ocr` — read placard | Spark 1.1–1.3, Wonder | Spark 1.3 · **low** | Narrow perception task; minimal reasoning is plenty |
| `spark_classify` — per-frame fill + debris class | Spark 1.1–1.3, Wonder | Spark 1.3 · **balanced** | Supplies visual fill estimates and debris classification |
| `name_load` — name load materials for SAM prompts | Spark 1.1–1.3, Wonder | Spark 1.3 · **low** | Adapts SAM's load prompts to the visible material |
| `narrate_anomaly` — phrase a flag | Spark 1.2–1.3 | Spark 1.3 · **minimal** | Short, low-stakes output; keep it cheap |
| `explain_pipeline` — stage explanations | Spark 1.2–1.3 | Spark 1.3 · **low** | One text-only, facts-grounded call explains the completed stages |
| `analyst_chat` — grounded Q&A | Wonder, Spark 1.2–1.3 | Spark 1.3 · **balanced** | Can escalate to Wonder for hard questions |

**Reasoning effort** (`minimal → low → balanced → high → max`) maps to Meta's `reasoning_effort` parameter: higher effort spends more tokens for better quality on hard calls; lower effort is cheaper and faster for high-volume perception. **Cost mode** is `standard` (normal price, content never trained on) or `contributor` (heavily discounted in exchange for Meta training on your content; rate-limited, no `max` effort — never for sensitive data). Admins pick per task so capability and spend are tuned where it matters, not globally.

### Media handling & cost optimization

The seven stages are unchanged; what's optimized is *how bytes reach the models*, per the Meta docs (50 MB inline, 1 GiB Files-API upload, 50-image VLM budget, SAM billed per frame). `pipeline/media.py` + `frames.py` apply:

- **Sample, don't stream every frame.** Stage 1 samples at the configured 2–4 fps and applies `max_sampled_frames` (60 by default), rather than sending every source frame to SAM. SAM is billed per frame, so sampling is a major cost lever.
- **Upload once, reuse the `file_id`.** A clip above ~8 MB is uploaded to the Files API once and referenced by id across per-clip vision calls; the bytes travel once, not once per model. Smaller clips go inline to skip the round-trip; clips over 1 GiB are rejected with `413`.
- **Few, downscaled keyframes for the VLM.** OCR and classification get a handful of evenly-spaced keyframes (far under the 50-image budget), each downscaled to a 1024 px longest edge so the base64 payload — and the input-token cost — stays small.
- **Content-hash cache + budget caps** mean repeats cost nothing and a volume spike can't run away. ([Full notes → LEARNINGS.md §5](./LEARNINGS.md))

### The $0-to-run seam

Each clip is content-hashed; the hash keys both the result cache and the fixture lookup. A **mock AI client** (`ai/mock.py`) replays recorded fixtures keyed by that hash, so the whole stack runs end-to-end with `MOCK_AI=true` at **zero credits and no network** — then flips to the live Meta Model API with one env var (`ai/factory.py` selects the client). The mock also steers scenarios by a filename prefix (`no-truck__clip.mp4`, `uncertified-truck__clip.mp4`, …) so each positive/negative path is demoable on demand.

---

## 🛠️ Architecture

### System architecture (current implementation)

This view shows the active application services and their data paths. Upload processing is synchronous in FastAPI today; the ARQ/Redis worker is a scale-out seam. Supabase JWT/RLS is an integration path, while the standard local app uses LoadTruth sessions and API role checks.

```mermaid
flowchart LR
    user[Monitor, reviewer<br/>and administrator]

    subgraph frontend[Frontend · Next.js]
        ui[Review console, pipeline,<br/>reports, billing and admin]
        client[Auth gates + typed API client]
        ui --> client
    end

    subgraph backend[Backend · FastAPI]
        api[API routers]
        identity[Users, sessions,<br/>roles and tenant context]
        domain[Tickets, events,<br/>trucks and sources]
        ingest[Ingest + pipeline orchestrator]
        subgraph ai[AI and measurement services]
            adapter[AIClient: live or fixture]
            sam[SAM 3.1<br/>truck/load tracking evidence]
            muse[Muse Spark<br/>fill frames, OCR, debris class]
            median[Median fill estimate]
            value[CY + dollar valuation<br/>deterministic Decimal]
            rules[Compliance rules]
        end
        reporting[Reports + CSV<br/>audit packet]
        billing[Billing roll-up<br/>+ invoice]
        analyst[Grounded analyst chat]
        api --> identity
        api --> domain
        api --> ingest
        api --> reporting
        api --> billing
        api --> analyst
        ingest --> adapter
        adapter --> sam
        adapter --> muse
        muse --> median
        median --> value
        domain --> value
        value --> rules
    end

    subgraph persistence[Persistence and cache]
        db[(SQL database<br/>users, tenants, tickets, traces)]
        stagecache[(Persistent AI-stage cache)]
        resultcache[(Process-local pipeline cache)]
        evidence[(Evidence media store)]
        redis[(Redis / ARQ<br/>optional worker seam)]
    end

    meta[Meta Model API<br/>SAM + Muse]
    supabase[Supabase JWT / Postgres RLS<br/>optional integration]

    user --> frontend
    client -->|HTTPS API| api
    identity --> db
    domain --> db
    ingest --> stagecache
    ingest --> resultcache
    ingest --> evidence
    ingest --> db
    reporting --> db
    billing --> db
    analyst --> db
    sam --> meta
    muse --> meta
    identity -. optional auth/RLS .-> supabase
    ingest -. planned background jobs .-> redis

    classDef actor fill:#eef2ff,stroke:#6366f1,color:#1e1b4b
    classDef frontendNode fill:#ecfeff,stroke:#0891b2,color:#164e63
    classDef backendNode fill:#eff6ff,stroke:#2563eb,color:#172554
    classDef aiNode fill:#f5f3ff,stroke:#7c3aed,color:#2e1065
    classDef store fill:#f0fdf4,stroke:#16a34a,color:#14532d
    classDef integration fill:#fff7ed,stroke:#ea580c,color:#7c2d12
    class user actor
    class ui,client frontendNode
    class api,identity,domain,ingest,reporting,billing,analyst backendNode
    class adapter,sam,muse,median,value,rules aiNode
    class db,stagecache,resultcache,evidence,redis store
    class meta,supabase integration
```

The database defaults to SQLite on the host and uses Postgres in the Compose stack. AI-stage results persist in SQL; the whole-pipeline cache and live progress store are process-local. Evidence media and redacted model logs use local artifacts by default. Fixture mode routes SAM/Muse calls to recorded scenarios without external model requests. Supabase and Redis are optional integration seams, not the primary local ingest path.

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
│   │   ├── geometry.py      #   Legacy estimator for reproducing historical SAM-based tickets
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
│   └── api/                 # auth/users, events, tickets, ingest, sources, billing, reports, chat, system
│                            # (ARQ worker for off-request video is the planned next seam)
├── frontend/                # Next.js 16 operator console (overview, review, pipeline, reports, admin)
└── infra/rbac/              # Postgres schema + row-level-security policies
```

**Stack:** Python 3.12 · FastAPI · SQLAlchemy (async) · pydantic-settings · ARQ/Redis worker seam · SQLite for local host and Postgres in Compose/production · Next.js 16 · Meta Model API (`sam-3.1`, `muse-spark-1.3`, `muse-wonder-1.0`).

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
- **AI-stage results are cached by content hash**; whole-pipeline results are cached in-process.
- **No model decides pricing or compliance rules** — Muse supplies visual fill estimates, deterministic code takes their median and calculates cubic yards/dollars, and plain rules handle compliance checks.
- **The ingest path is synchronous today.** Redis/ARQ background execution is planned, not active.

### API surface (implemented)

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + whether the Model API key is configured |
| `GET` | `/auth/directory`, `/auth/me` | Demo member directory and current session member |
| `POST` | `/auth/login`, `/auth/logout` | Email-based session login and logout |
| `GET`/`POST`/`PATCH`/`DELETE` | `/users…` | Tenant-scoped member administration with role checks |
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
| `GET` | `/events/{id}/reports/summary` | Event report aggregates |
| `GET` | `/events/{id}/export.csv` | Event tickets as CSV |
| `GET` | `/events/{id}/audit-packet.html` | Standalone HTML evidence packet for auditors |
| `GET` | `/events/{id}/billing`, `/billing` | Event and tenant billing roll-ups |
| `GET` | `/events/{id}/invoice.html`, `/billing/invoice.html` | Printable event or combined invoice |
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

## 👁️ Review and operational workflow

Every model-generated measurement remains a draft tied to its source clip, SAM tracking evidence, Muse frame estimates and pipeline trace. Monitors retain authority to confirm, correct or dispute the record. The visual pipeline reports estimated cubic yards, not weight; actual weight requires an independent scale integration.

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
