<div align="center">

# 🚛 LoadTruth

### Video-verified load tickets for hauling that gets paid by the cubic yard.

**A phone replaces a $50K laser gantry. SAM 3.1 + Muse Spark turn tower video into an auditable load ticket — and flag the overbilling a tired human monitor can't.**

Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) · Oct 26 – Nov 4, 2026
**Track:** Indie Developer · **Theme:** Push the Frontier
[Event notes, waiver & judging criteria →](./Hackathon.md) · [Deep research & case studies →](./Research.md)

</div>

---

## 📌 TL;DR for judges

> After a hurricane, a human in a tower eyeballs how full each dump truck is. That guess — often in 10% increments — becomes a **load ticket**, and the ticket decides how many federal dollars the hauler is paid. It is subjective, prosecutable, and audited years later.
>
> **LoadTruth points a camera at the tower instead.** SAM 3.1 tracks and segments each truck's bed and load; Muse Spark reads the truck's ID placard and classifies the debris; a **deterministic geometry engine** converts the masks into a fill % that traces back to pixels, not a model's opinion; and a **rules engine** flags overbilling, impossible cycle times, and hollow "fluffed" loads. Every number links to its evidence frame, and a human confirms or overrides each call.
>
> The output is a FEMA-format ticket plus a dashboard showing the **dollar gap between the monitor's call and what LoadTruth measured** — the money story, on one screen.

---

## 💥 The problem (and why it's worth real money)

Local governments hire contractors to haul storm debris, paid **per cubic yard**. A short-term "tower monitor" looks down into each truck and estimates its fill percentage. That estimate is the invoice. FEMA reimburses the government afterward — and can claw the money back years later if the paperwork doesn't hold up.

Four things go wrong:

| Problem | What it means |
|---|---|
| **Subjective** | A fatigued surge hire's eyeball guess can't be reproduced or re-checked. |
| **Fraud-prone** | The load ticket *is* the unit of fraud: inflated fill, fake slips, bribed monitors. |
| **Audited late** | FEMA deobligations take funding back **after** it's spent, when evidence is gone. |
| **Labor-heavy** | Armies of monitors, billed hourly, for a job that is a measurement problem. |

### The scale — this is a multi-billion-dollar line item

<div align="center">

| Figure | Source |
|---|---|
| **~107 million cubic yards** of debris cleared in the 2024 season alone | [FEMA](https://www.fema.gov/press-release/20250926/recovery-continues-after-historic-2024-hurricane-season) |
| **~$2.0 billion** obligated to Florida for Helene/Milton debris & recovery | [FEMA](https://www.fema.gov/fact-sheet/florida-helene-and-milton-recovery-fact-sheet-076) |
| **$190,070,000** — a single county's 5-year debris-*monitoring* contract (Miami-Dade) | [Miami-Dade County](https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf) |
| **~$604,615** — one small city's monitoring bill for a single season (Dunedin, FL) | [City of Dunedin](https://d2kbkoa27fdvtw.cloudfront.net/dunedin/1d89f73d26bf5fa9422ada2d1efa65480.pdf) |
| **15M+ cubic yards** removed after Hurricane Sandy | [FEMA](https://news.va.gov/wp-content/uploads/sites/3/2013/10/FEMA-Sandy-One-Year-Fact-Sheet.pdf) |

</div>

### The failure mode LoadTruth is built to catch — real cases

- **Trucks logged at 500%+ of capacity.** A DHS OIG audit questioned **$5.5M** in Katrina debris costs in Kenner, LA after finding trucks recorded well over 95% full — some documented above **500% of certified capacity**. This is *exactly* the "estimated fullness" gap LoadTruth measures against the bed rails. [NOLA.com](https://www.nola.com/news/audit-questions-5-5-million-in-katrina-debris-removal-costs-paid-to-kenner-by-fema/article_0b34e794-cfc9-5d5e-95e3-141c0df20869.html) · [DHS OIG](https://www.oig.dhs.gov/sites/default/files/assets/GrantReports/OIG_DD-09-04_Jan09.pdf)
- **Fake load slips & bribed monitors.** DOJ prosecuted a conspiracy over **$716,677** in false debris load slips, and separately charged a subcontractor with **bribing a monitor to write tickets for debris never dumped**. [DOJ](https://www.justice.gov/criminal/disasters/pr/2007/may/05-18-07akitto-sent.pdf) · [DoD/DOJ](https://media.defense.gov/2005/Dec/06/2001711424/-1/-1/1/katrinafraudrelease5.pdf)
- **"Little to no oversight."** A DHS OIG alert on Hurricane Irma warned of fraud risk across **~$1.5B** in debris costs, noting overstated loads turn into ineligible reimbursement requests. [DHS OIG](https://www.oig.dhs.gov/sites/default/files/assets/2018-10/OIG-18-85-Sep18.pdf) · [House Oversight](https://oversightdemocrats.house.gov/news/press-releases/new-report-exposes-fema-s-inadequate-oversight-of-contractors-after-hurricane)

> The common thread in every case: **a quantity on a ticket that nobody could independently verify.** LoadTruth makes it verifiable. ([Full case studies with 11 sourced examples →](./Research.md))

---

## ✅ The solution

A phone or pole camera at the tower records every truck. LoadTruth turns that video into a verified load ticket in seven stages:

```
┌─────────┐   ┌──────────────┐   ┌─────────────┐   ┌───────────────┐
│ 0–1     │   │ 2  SAM 3.1   │   │ 3  Muse     │   │ 4  Registry   │
│ Ingest  │──▶│ track + seg  │──▶│ Spark OCR   │──▶│ capacity      │
│ + hash  │   │ truck/bed/   │   │ read placard│   │ lookup (fuzzy)│
│ (cache) │   │ debris/plcard│   │             │   │               │
└─────────┘   └──────────────┘   └─────────────┘   └───────┬───────┘
                                                            │
     ┌──────────────────────────────────────────────────────┘
     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────┐   ┌──────────────┐
│ 5  Geometry   │   │ 5b Muse Spark │   │ 6  Anomaly rules  │   │ 7  Ticket +  │
│ fill %        │──▶│ classify      │──▶│ (deterministic)   │──▶│ dashboard +  │
│ (DETERMINISTIC│   │ debris class  │   │ overbill/cycle/   │   │ CSV + audit  │
│  from masks)  │   │               │   │ hollow/uncertified│   │ packet       │
└───────────────┘   └───────────────┘   └───────────────────┘   └──────────────┘
                                                                        │
                                                        ┌───────────────┘
                                                        ▼  Human confirms / overrides
```

1. **Track & identify** — SAM 3.1 tracks each truck across frames and segments `dump truck`, `truck bed`, `debris pile`, `placard`. Muse Spark OCRs the placard.
2. **Look up capacity** — the OCR'd ID is matched to the certified-truck registry with **fuzzy matching** (exact → normalized → edit-distance) so OCR noise doesn't silently guess wrong.
3. **Estimate fill %** — a **deterministic geometry engine** turns the bed and load masks into planar coverage × depth factor (body-type prior) → a fill % that is *reproducible and auditable*.
4. **Classify debris** — Muse Spark sorts the load into vegetative / construction & demolition / white goods / hazardous; each pays a different rate.
5. **Flag anomalies** — plain-Python rules (no model decides) raise: `capacity_exceeded`, `impossible_cycle`, `hollow_load`, `uncertified_truck`, `duplicate_truck`, `identity_unreadable`, `low_confidence`. Muse Spark only *narrates* a flag the rules already raised.
6. **Human in the loop** — the monitor confirms or overrides; every decision keeps its evidence frames.
7. **Export** — FEMA-format ticket, event CSV, and a standalone HTML **audit packet** — plus a dashboard comparing the monitor's call with LoadTruth's estimate in **dollars**.

---

## 🧠 Why this is the strongest version of the idea

**The AI measures, but the money math is deterministic.** The fill % comes from a ratio of segmentation-mask pixels (`geometry.py`), not a model saying "looks 80% full." Cubic yards and dollars use exact `Decimal` arithmetic (`money.py`). Anomalies are plain-Python decisions (`anomalies.py`). This means **a model mistake can never silently redefine a payment** — the number always traces to pixels and a rule a human can read. That design choice is the whole pitch: *verifiable, not vibes.*

**The delta is the demo.** Every ticket carries a signed `monitor − LoadTruth` delta in cubic yards and dollars. Sum it across an event and the dashboard shows, in one number, how much a county was over- or under-billed. That's the screen that wins the room.

**$0-to-run architecture.** Each clip is content-hashed; the hash is the cache key for every AI call, and a **mock AI client** replays recorded fixtures. The entire stack runs end-to-end with `MOCK_AI=true` for **zero credits** — critical on a $150 budget — then flips to live Meta Model API with one env var.

---

## 🛠️ Architecture

```
loadtruth/
├── backend/app/
│   ├── main.py              # FastAPI app: lifespan, CORS, routers, /health
│   ├── config.py            # pydantic-settings; MOCK_AI, spend caps, model names
│   ├── ai/                  # ── the AI seam ──
│   │   ├── base.py          #   AIClient Protocol + normalized result types
│   │   ├── factory.py       #   picks Mock vs Live from config
│   │   ├── mock.py          #   fixture replay ($0, deterministic, demo-safe)
│   │   └── live.py          #   real Meta Model API (SAM 3.1 + Muse Spark)
│   ├── pipeline/            # ── the 7-stage pipeline ──
│   │   ├── ingest.py        #   Stage 0–1: normalize + SHA-256 content hash
│   │   ├── registry.py      #   Stage 4: fuzzy certified-capacity lookup
│   │   ├── geometry.py      #   Stage 5: DETERMINISTIC fill-% from masks
│   │   └── anomalies.py     #   Stage 6: DETERMINISTIC rule engine
│   ├── tickets/
│   │   └── money.py         #   exact Decimal CY/$ math + monitor-vs-estimate delta
│   ├── db/                  # SQLAlchemy models, multi-tenant, SQLite→Postgres
│   └── api/                 # events, tickets, trucks, sources, ingest, reports
└── infra/rbac/              # Postgres schema + row-level-security policies
```

**Stack:** Python 3.12 · FastAPI · SQLAlchemy (async) · pydantic-settings · ARQ worker (heavy video off the request path) · SQLite for dev → Supabase/Postgres with RLS for multi-tenant prod · Meta Model API (`sam-3.1`, `muse-spark-1.3`).

### API surface (real, implemented endpoints)

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + whether the Model API key is configured |
| `GET`/`POST`/`PATCH` | `/events…` | Manage disaster events & per-class rate tables |
| `POST` | `/events/{id}/ingest` | Run a clip through the pipeline → a draft ticket |
| `GET` | `/tickets`, `/tickets/{id}` | List/fetch tickets with valuation + evidence frames |
| `PATCH` | `/tickets/{id}/monitor-call` | Record the monitor's call → computes the delta |
| `PATCH` | `/tickets/{id}/status` | Confirm / override / resolve a ticket |
| `GET`/`POST`/… | `/trucks…` | Certified-truck registry (unique per tenant) |
| `GET`/`POST`/… | `/events/{id}/sources…` | Connected evidence sources (upload, RTSP, bucket) |
| `GET` | `/events/{id}/dashboard` | Summed dollar-delta, review progress, anomalies, accuracy |
| `GET` | `/events/{id}/export.csv` | Event tickets as CSV |
| `GET` | `/events/{id}/audit-packet.html` | Standalone HTML evidence packet for auditors |

---

## 🤖 Meta AI stack

| Model | Role in LoadTruth |
|---|---|
| **SAM 3.1** (Responses API) | Text-prompted multi-object tracking + segmentation of `dump truck`, `truck bed`, `debris pile`, `placard` across video frames. Returns per-instance boxes + one-bit masks (see [LEARNINGS.md](./LEARNINGS.md) for how the response is decoded). |
| **Muse Spark 1.3** | Placard OCR, debris classification, and one-line human narration of anomalies the rules raised. Billed per token; native image/video reasoning. |

> SAM gives **where and how much** (pixels). Spark gives **what and who** (class, ID, narrative). The deterministic engine turns that into **dollars**.

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
```

To run against the **live Meta Model API**, set `MODEL_API_KEY` in `.env` and remove `MOCK_AI=true`. The factory (`ai/factory.py`) switches clients automatically; the content-hash cache keeps repeat runs free.

```bash
# run the test suite (money math + record matching + rules)
cd backend && uv run pytest
```

---

## 🎯 10-day MVP plan

| Days | Deliverable |
|---|---|
| 1–2 | Collect clips (public storm-cleanup footage + phone video of haul trucks); ingest + SAM 3.1 tracking |
| 3–5 | Deterministic fill-% estimator (bed rails vs. load-surface mask + depth prior); fuzzy capacity lookup |
| 6–7 | Debris classification; anomaly rule engine; confirm/override review UI |
| 8–9 | FEMA-format ticket export; county dashboard; accuracy benchmark on 50+ clips |
| 10 | Demo video: truck passes the tower → ticket with evidence → a dispute resolved in one click |

**Success metric:** fill-% estimates within **±10%** of careful human measurement.

---

## 💰 Market, customers & moat

**First customer:** a small/mid-size debris-monitoring firm competing with Tetra Tech in county bids that wants an "AI-verified monitoring" edge to win fixed-fee work with fewer people.
**Also:** county finance & emergency-management directors burned by a FEMA deobligation; haulers disputing low calls.

**Expansion:** automate truck certification → all disaster debris (wildfire, tornado, flood) → year-round volume hauling (construction haul-off, landfill/transfer-station gates, snow, mulch, dredge spoils) → same-day settlement against verified loads → ground-truth volume data for insurers & parametric programs.

**Moat:** a cross-disaster registry of certified trucks (haulers follow the storms); a dataset of truck bodies × load states × debris types linked to audit outcomes; becoming the neutral evidence standard written into state ticket templates.

### Closest alternatives

| Product | Gap LoadTruth fills |
|---|---|
| **Loadscan** (laser gantry) | Expensive hardware, slow to deploy at temporary sites that open in 72h |
| **Ticketpros** (paper-ticket OCR) | Digitizes the human's guess; doesn't measure |
| In-house monitoring apps | Digital forms, no measurement |
| Rice DebrisHeightNet (research) | Aerial forecasting before hauling, not per-load verification |

---

## ⚠️ Honest risks

- **Buyer incentives** — monitoring firms bill hourly for the labor this replaces. *Mitigation:* sell to challenger firms chasing fixed-fee bids.
- **Accuracy** — irregular vegetative loads are hard to measure. *Mitigation:* the human-confirm step, confidence scoring, and the ±10% benchmark.
- **Policy** — a proposed parametric FEMA formula could weaken documentation needs. *Mitigation:* year-round, non-disaster hauling use cases.
- **Not a compliance guarantee** — LoadTruth produces auditable evidence and flags; the responsible monitor retains authority over the official record. It is not FEMA-certified and does not guarantee reimbursement.

---

## 📣 The pitch

> **Loadscan accuracy for the price of a phone** — video-verified tickets for every truck paid by the yard, with the overbilling gap shown in dollars.

---

## 📚 Sources & further reading

- **Project docs:** [Research.md](./Research.md) (design + 11 sourced case studies) · [Hackathon.md](./Hackathon.md) (event/judging) · [LEARNINGS.md](./LEARNINGS.md) (Meta model usage notes)
- **Meta models:** [SAM 3.1](https://ai.meta.com/blog/segment-anything-model-3/) · [Muse Spark](https://dev.meta.ai/resources/blog/build-with-muse-spark)
- **FEMA debris volumes (2024):** https://www.fema.gov/press-release/20250926/recovery-continues-after-historic-2024-hurricane-season
- **DHS OIG debris-monitoring alert (Irma):** https://www.oig.dhs.gov/sites/default/files/assets/2018-10/OIG-18-85-Sep18.pdf
- **Miami-Dade $190M monitoring contract:** https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf
- **FEMA Debris Monitoring Guide:** https://www.fema.gov/sites/default/files/documents/fema_debris-monitoring-guide_sop_3-01-2021.pdf
- **Loadscan (incumbent):** https://www.loadscan.com/debris-monitoring-technology-conference/

<div align="center">

*Dollar figures and quantities are paraphrased from government reports (FEMA, DHS OIG, GAO, DOJ) and news coverage linked inline; they establish the problem's scale, not any claim of certification. Content rephrased for compliance with licensing restrictions.*

</div>
