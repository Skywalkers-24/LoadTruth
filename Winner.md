# Winner.md: taking LoadTruth from "strong" to 9.9

Written 2026-10-28 (day 3 of 10). Submission closes **Nov 4, 9:00 PM ET**, so there are about seven working days left.

This document reviews the project the way the judges and the automated code check will review it, persona by persona, then lists the changes that move each score. It is grounded in the repo as it stands today, not the plan. Where this file and `PLAN.md` disagree, this file reflects newer evidence.

---

## 0. Implementation backlog (the single list to work from)

Every change recommended anywhere in this file, in one place, with its status checked against the repo on 2026-10-28. The sections below explain the *why*; this table is the *what*. Update the Status column as items land, and mirror each item into `docs/PROGRESS.md` when it starts.

**Priority:** P0 = the submission is weak without it. P1 = visible score gain, do after P0. P2 = only if a day finishes early.
**Status:** ⬜ not started · 🟨 partly exists · ✅ exists, needs only polish or wiring into the demo.

### 0.1 Build items

| ID | Pri | Item | Status today (evidence) | Files to touch | Done when | Day | Ref |
|---|---|---|---|---|---|---|---|
| B1 | P0 | **Known-volume benchmark harness**: `ground_truth.csv` (`clip, true_fill_pct, material, angle, lighting`), runner, results JSON, per-condition error | ✅ Harness built (`backend/app/bench/{harness,run}.py`), `data_bench/ground_truth.csv`, `scripts/benchmark.sh`, 5 tests. Reports MAE/RMSE/within-10/by-condition. Needs B2 clips to produce a real `results.json` | new `scripts/benchmark.sh`, new `backend/app/bench/`, new `data_bench/ground_truth.csv`, `scripts/README.md` | Prints MAE, % within ±10, error by material and angle for 50+ clips; results JSON committed | 3 to 7 | §3 Blocker 1 |
| B2 | P0 | **Scale-model rig + filming**: model truck with measured bed, measured fills 0 to 100% plus heaped, 2 to 3 angles, 2 lighting, each with a 3-second sweep. Plus 10 to 20 real loads bought by the cubic yard | ⬜ | `data_bench/` (clips gitignored, CSV committed) | 50+ clips with ground truth on disk | 3 to 7 | §3 Blocker 1 |
| B3 | P0 | **Rename the circular metric** to "Agreement with monitor" everywhere; benchmark accuracy shown separately | ✅ Relabeled in overview, audit packet, analyst, assistant, guide, each clarifying it is agreement with the reviewer, not benchmark accuracy. Internal field name kept; vestigial seed keys removed | `tickets/repository.py`, `tickets/schemas.py`, `tickets/export.py`, `frontend/src/components/reports/*`, `frontend/src/lib/api.ts` | No UI string calls monitor agreement "accuracy" | 5 | §3 Blocker 1 |
| B4 | P0 | **Live Muse Spark tool-calling analyst** with the number guard (every number in the answer must appear in a tool result, else retry), tool calls shown in the chat; keyword router kept only for `MOCK_AI` | 🟨 Tools exist (`ai/analyst.py`); answers come from keyword routing (`ai/agent.py::_mentions`), docstring says "mock" | `backend/app/ai/agent.py`, `backend/app/ai/live.py`, `backend/app/api/chat.py`, `frontend/src/components/ai/assistant-chat.tsx` | 5 fixed questions answered with correct tool calls and no ungrounded numbers; go/no-go Nov 1 | 4, 7 | §3 Blocker 2 |
| B5 | P0 | **Evidence receipt + Re-verify**: SHA-256 over clip hash, SAM response hash, measured inputs, result, model versions, config; QR on ticket and packet; Re-verify recomputes fill % from stored masks | ✅ `pipeline/receipt.py` + `POST /tickets/{id}/reverify` (replays Stage-5 geometry over stored masks) + `reproducibility-card.tsx`; 7 tests. (QR on the packet not yet added; the hash is shown in the console) | new `backend/app/pipeline/receipt.py`, `backend/app/api/tickets.py` (`POST /tickets/{id}/reverify`), `tickets/export.py`, `frontend/src/components/console/ticket-metadata.tsx` | Re-verify returns the identical fill % and a matching receipt hash | 6 | §4.3 |
| B6 | P0 | **Public `/showcase` page** (no login): story, demo video with run chips, 7-stage anatomy, two personas, "constraints we hit," stats band, benchmark card, Where it stands | ✅ `app/showcase/page.tsx` + `AuthGate` public allow-list, linked from the login screen. Now also carries a **product-features** section (multi-tenant, money frame, reporting/exports, billing/invoicing, grounded analyst, evidence receipt) and a **sourced case-studies** grid (107M CY, $190M Miami-Dade, 500%+ Katrina, $716K DOJ fraud, 15M CY Sandy, $2B FL) with primary-source links, plus colorful stat/feature accents. Story, stats band, 7-stage anatomy, two personas, benchmark card, constraint, Working/In-progress/Roadmap. (Demo video embed waits on N2) | new `frontend/src/app/showcase/page.tsx`, auth middleware allow-list | Loads logged out on mobile and desktop; every stat traces to code or a cited source | 8 | §2b #1 |
| B7 | P0 | **Judge mode**: `NEXT_PUBLIC_APP_MODE=judge` opens on the pinned $43.20 ticket; "Run live" re-ingests the same clip; "bypass cache" toggle proves it is live | ✅ `lib/app-mode.ts`; console opens on the highest-delta ticket (or pinned id), Run live re-ingests the stored clip, `?bypass_cache=true` skips both caches. Dockerfile/compose build args | `frontend/src/app/console/page.tsx`, `backend/app/api/ingest.py`, `.env.example` | Judge lands on the pinned ticket; Run live returns the same number | 8 | §2b #2 |
| B8 | P0 | **Persistent demo cache**: result cache survives container rebuilds (file or Redis), every demo clip pre-cached, demo runs with network off | ✅ Durable DB-backed AI-stage cache (`AIStageResult`) on the Postgres `db_data` volume + host-mounted evidence already survive rebuilds; `scripts/precache-demo.sh` added. Needs real demo clips to pre-cache | `backend/app/pipeline/cache.py`, `docker-compose.yml`, new `scripts/precache-demo.sh` | Rebuild backend, network off, full demo arc runs | 8 | §6.4 |
| B9 | P0 | **Claim-drift sweep**: README, showcase, deck, and docstrings match the code (analyst, "five distinct jobs," adapters, queue) | ✅ README hollow-load refs + accuracy label reworded; "five distinct AI calls" verified against the catalog (5 tasks); analyst docstring already honest. Deck is N3 (human) | `Readme.md`, `backend/app/ai/agent.py`, `PLAN.md` header note | Every claim has a code path or is reworded | 8 | §2b #10, §4.8 |
| B10 | P0 | **Code check clean**: `scripts/eval.sh` with no new findings; npm 2 critical + 1 high resolved; secrets check (`git ls-files .env` empty, scan `logs/meta_api.jsonl`) | 🟨 Backend ruff+format+mypy+pytest (271) clean; secrets check clean (`.env` untracked, only `.env.example`, no keys). Remaining baseline: 51 pre-existing frontend prettier files (not from this change) + `npm audit` findings | `frontend/package.json`, `scripts/eval.sh` | eval.sh passes; no secrets in tracked files | 8 | §4.8 |
| B11 | P1 | **SAM 3.1 + VGGT 3D volume** (Stage 5b on Modal): lift masks to 3D, plane-fit floor and rails, scale from registry bed dimensions, height-field integration | ⬜ Registry has capacity, not inside bed length/width | new `backend/app/pipeline/volume3d.py`, new `infra/modal/vggt_app.py`, `db/models.py` (bed dims on trucks), `ai/base.py` | 2D vs 3D error rows in the benchmark; **kill switch Sat Oct 31 noon** | 3 to 6 | §5b |
| B12 | P1 | **three.js point-cloud view** in the review console from a stored, downsampled cloud | ⬜ | new `frontend/src/components/console/load-pointcloud.tsx` | Renders from cache in under 1 s | 6 | §5b |
| B13 | P1 | **Per-load confidence interval** from frame-to-frame variance, shown as `62% ± 4` on ticket and packet | ⬜ Per-frame areas exist (`ai/sam_measure.py`); no spread computed | `backend/app/pipeline/geometry.py`, `tickets/schemas.py`, `money-frame.tsx` | Every ticket shows `± N` | 5 | §4.2 |
| B14 | P1 | **FEMA rule citation on every anomaly** (or the flag is not shown); "Verify" marker on low confidence | ⬜ Anomalies carry text only (`pipeline/anomalies.py`) | new `backend/app/pipeline/fema_rules.py`, `pipeline/anomalies.py`, anomaly card component | Each flag card shows its rule and source section | 6 | §2b #3 |
| B15 | P1 | **Muse Voice Transcribe monitor call**: spoken call → transcript → Spark strict parse → `monitor_call_fill_pct` + debris class | ⬜ Monitor call is typed only (`PATCH /tickets/{id}/monitor-call`) | `backend/app/ai/live.py`, new `backend/app/api/voice.py`, `frontend/src/components/console/review-actions.tsx` | Spoken "Truck 3391, eighty percent" fills the field | 7 | §5 |
| B16 | P1 | **Rename hollow-load rule** to what it detects ("surface high, measured depth low") | ✅ `HOLLOW_LOAD` → `SURFACE_DEPTH_MISMATCH` across enum, rule text (em dash removed), mock, fixture, seed x3, FE type map + fallback, README | `pipeline/anomalies.py`, UI copy, fixtures | No claim of seeing interior voids | 5 | §3 Blocker 3 |
| B17 | P1 | **Streamed stage feed** during ingest: `[3/7] Reading placard…` plus "still working, 0:12 since last update" | 🟨 Stage trace exists after the run (`components/ai/pipeline-trace.tsx`); jobs store is in memory | `backend/app/api/system.py` (SSE), `pipeline-trace.tsx` | Stages appear live during a run | 7 | §2b #4 |
| B18 | P1 | **Cost-per-ticket and cache-hit card** from the ledger on dashboard and showcase | 🟨 Ledger exists (`pipeline/ledger.py`), no endpoint (PROGRESS In progress) | `backend/app/api/system.py`, dashboard component | Shows cost per ticket (about $0.03) and hit rate | 8 | §6.5 |
| B19 | P2 | **Spark second reader**: independent fill estimate from video; large disagreement raises review flag | ⬜ | `ai/live.py`, `pipeline/anomalies.py` | Ticket shows geometry vs Spark | 7 | §5 |
| B20 | P2 | **Constrained Spark ticket draft + validator retry** (max 3, each logged) | ⬜ | new `backend/app/pipeline/validate_draft.py`, `ai/live.py` | Invalid drafts retried with errors; attempts in the ledger | any | §2b #5 |
| B21 | P2 | **Plain-language rule panel** ("Flag if and only if …") generated from rule constants | ⬜ | `pipeline/anomalies.py`, guide or admin screen | Text changes when a constant changes | any | §2b #6 |
| B22 | P2 | **Play evidence** button on every flag and field (seek to frame range) | 🟨 Evidence frames stored; no seek action | `components/console/evidence-canvas.tsx` | Click seeks the viewer | any | §2b #7 |
| B23 | P2 | **"Strictly visual evidence" prompt guard** + required `explanation` shown as "AI analysis" | ⬜ | `ai/live.py` prompts | Explanation visible on ticket | any | §2b #8 |
| B24 | P2 | **Fireworks analyst eval**: about 300 generated questions, grounding and refusal rates committed | ⬜ | new `scripts/analyst-eval.sh`, `backend/app/bench/analyst_eval.py` | Grounding rate in README | 7 | §5a |
| B25 | P2 | **Baseten mirror of VGGT endpoint** for demo-day redundancy | ⬜ | `infra/baseten/` | Failover tested once | 8 | §5a |
| B26 | P2 | **Density signal** (dump-event collapse or suspension sag) on at least one clip | ⬜ | `ai/sam_measure.py`, `pipeline/anomalies.py` | Flag fires with physical evidence frames | 7 | §3 Blocker 3 |
| B27 | P2 | **Fake live camera** via go2rtc loop into the `rtsp` adapter for one demo shot | ⬜ Adapter validates config only (`pipeline/sources.py`) | `pipeline/sources.py`, `docker-compose.yml` | One shot shows a "live" feed | 9 | §2b #9 |
| B28 | P2 | **Glimmer offline narrator** (site-box story) | ⬜ | `infra/baseten/` | Runs, or stays a roadmap line | stretch | §5 |

**Already built, use as is in the demo (no new work):** dollar delta and money frame (`tickets/money.py`, `money-frame.tsx`), event roll-up and dashboard, HTML audit packet and CSV export (`tickets/export.py`), monitor call + confirm/override/dispute (`api/tickets.py`), live SAM 3.1 two-concept tracking with `meta-sam-parser` and Spark video OCR/classify with strict JSON (`ai/live.py`, `ai/sam_measure.py`), per-stage trace with model details (`pipeline/trace.py`), budget caps (`pipeline/ledger.py`), tenant isolation (`infra/rbac/`, `db/tenant.py`).

### 0.2 Non-code items

| ID | Pri | Item | Status | Done when | Day |
|---|---|---|---|---|---|
| N1 | P0 | **Outreach**: 40 messages to monitoring-firm ops leads, county EM/finance staff (FL, LA, Carolinas, TX), FEMA PA consultants, debris contractors | ⬜ Tracker empty (`docs/OUTREACH.md`) | At least one role-attributed quote; tracker filled | 3, follow up daily |
| N2 | P0 | **Demo video** (under 3:00, captions) + 30-second vertical cut | ⬜ | Both files exported; script in §7 followed | 9 |
| N3 | P0 | **6-slide deck**: one truck, how it measures, the money, the benchmark, the buyer quote, what's next | ⬜ | Every number matches code or a cited source | 9 |
| N4 | P0 | **Fresh-clone test** with `MOCK_AI=true docker compose up` | ⬜ | Clean clone runs end to end | 9 |
| N5 | P0 | **Submit by 6:00 PM ET Nov 4** | ⬜ | Confirmation received | 10 |

### 0.3 Documents to update when items land

| Document | Update | Trigger |
|---|---|---|
| `Readme.md` | Rewrite the top: 3-line pitch, demo GIF, benchmark table, one-command run. Add "What we learned about the Meta API" (from `LEARNINGS.md` §2a), adversarial-cases table, "Models we chose not to use" (Contributor mode, Muse Image, SAM 3D Objects), Meta model count that matches code | B1, B4, B9, B11 |
| `PLAN.md` | Add a header note that `Winner.md` §0 supersedes §8a for the remaining days | now |
| `docs/PROGRESS.md` | Replace "Next" with the P0 IDs from §0.1; move each to In progress and Done as it lands | each item |
| `docs/ARCHITECTURE_MAP.md` | Rows for `bench/`, `receipt.py`, `volume3d.py`, `fema_rules.py`, `/showcase`, judge mode, Modal app | B1, B5, B6, B7, B11, B14 |
| `scripts/README.md` | Document `benchmark.sh`, `precache-demo.sh`, `analyst-eval.sh` | B1, B8, B24 |
| `CHANGELOG.md` | One entry per item | each item |
| `docs/LESSONS.md` | Anything that takes more than one attempt (VGGT scale, Modal cold starts, Spark tool-call format) | as it happens |
| `.env.example` | `NEXT_PUBLIC_APP_MODE`, Modal and Baseten endpoint URLs and tokens (placeholders only) | B7, B11, B25 |

### 0.4 Do not build (cut list)

ARQ worker wiring, more source adapters (beyond B27), RBAC or invite screens, more themes, more billing features, Muse Image in evidence, SAM 3D Objects for measurement, self-hosted replacements for SAM 3.1 or Muse Spark.

---

## 1. Honest scorecard today

| Axis | Weight | Idea score | As built today | Why the gap exists |
|---|---|---|---|---|
| Impact | 30% | 9.0 | 8.0 | Sourced problem and a dollar delta on screen. No buyer quote yet (`docs/OUTREACH.md` tracker is empty). |
| Use of Meta AI | 25% | 9.0 | 7.0 | SAM 3.1 + Spark OCR/classify are live and verified. The "AI Analyst" is a keyword router (`app/ai/agent.py`, `_mentions(...)`), and its own docstring says "mock Muse Spark analyst". A judge reading code will find it. |
| Technical depth | 20% | 9.0 | 7.0 | Clean deterministic core, 256 tests. The accuracy metric compares the estimate to the **monitor's call** (`_accuracy_counts` in `tickets/repository.py`), which is the number the product says is unreliable. There is no independent ground truth and only 7 test clips. |
| Demo | 25% | 9.0 | 8.0 | The console is polished. No scripted, pre-cached, filmed arc exists yet. |
| **Weighted** | | **9.0** | **~7.5** | |

The idea is a 9. The build is a 7.5 because three claims are not yet backed: the analyst is not AI, the accuracy number is circular, and the benchmark does not exist. Everything below targets those first.

---

## 2. The competitive field

With up to 20,000 builders, the field will cluster into a few shapes. Knowing them tells you what judges will be tired of by the time they reach LoadTruth.

| What most entries will be | How judges will feel about it by day 3 of judging | LoadTruth's position |
|---|---|---|
| Chat or agent wrappers over Muse Spark (assistants, copilots, RAG over docs) | Fatigued. Hundreds look alike. | Avoid looking like one. The chat is the weakest, most generic part of LoadTruth. |
| SAM "segment and count" demos (people, cars, crops, shelves, wildlife) | Impressed once, then repetitive. Counting is SAM's headline feature. | LoadTruth must visibly **measure** (a ratio of pixels against a physical reference), not count. That is the separator. |
| Glasses, voice, or accessibility apps | Emotionally strong, often thin technically. | Borrow the emotional move: the money and the fraud, told in one truck. |
| Robotics and physical-system entries (the same theme) | Hardware demos are hard to film and often break. | LoadTruth is a physical-system measurement with no hardware to break. Lean on that. |

**Known prior art a judge may raise:** drone stockpile volumetrics (photogrammetry) and laser load-scanning gantries already exist. Your answer is cost and setup time: one phone on a tower, set up in an hour at a site that exists for 72 hours, versus a $50K+ gantry. Put that comparison on one slide.

**The one-sentence positioning to repeat everywhere:**
> Every debris load ticket is a number nobody can reproduce. LoadTruth makes it a number anyone can reproduce, from the video, in one click.

The word "reproduce" carries the pitch. It sets up the reproducibility demo in §7 and answers the auditor, the CV skeptic, and the Meta judge at once.

---

## 2a. What past winners have in common

Researched 2026-10-28. Sources: [LlamaCon Hackathon winners (Meta)](https://ai.meta.com/blog/llamacon-hackathon/), [Llama 3 Hackathon recap (Meta x Cerebral Valley)](https://ai.meta.com/blog/llama-3-hackathon-recap-cerebral-valley/), [Built with Opus 4.6 winners (Anthropic x Cerebral Valley)](https://claude.com/resources/articles/meet-the-winners-of-our-built-with-opus-4-6-claude-code-hackathon), and the Cerebral Valley galleries ([AI Engineer World's Fair 2026](https://cerebralvalley.ai/e/aiewf-hackathon-2026/hackathon/gallery), [MongoDB NYC](https://cerebralvalley.ai/e/mongodb-nyc-hackathon/hackathon/gallery/55)). Content was rephrased for compliance with licensing restrictions.

| Winner | What it did | The lesson for LoadTruth |
|---|---|---|
| **CrossBeam** (1st, Opus 4.6, Cerebral Valley) | A personal-injury lawyer built a tool for California housing-permit corrections. A city (Buena Park) was reported to be looking at adopting it. | The closest analogue to LoadTruth: government paperwork, a concrete dollar cost per failure, and **a named public body showing interest**. That adopter line did more than any feature. Get your county quote. |
| **OrgLens** (1st, LlamaCon) | Expert matching over Jira, GitHub, and documents. | Practical enterprise value beats novelty when the demo is crisp. |
| **Compliance Wizards** (2nd, LlamaCon) | Fraud detection on transactions, with voice reporting. | Fraud plus voice placed second at a Meta event. LoadTruth already has fraud. Voice capture of the monitor's call (§5) borrows the rest. |
| **Llama CCTV Operator** (3rd, LlamaCon) | Plain-language video events over CCTV, no fine-tuning. | Video understanding for operators places at Meta events. LoadTruth is the same shape with a measurement and money attached. |
| **Geo-ML** (Best Llama API usage, LlamaCon) | A geologist turned 400-page reports into 3D subsurface models. | **"Best use of the API" went to a domain expert producing 3D output.** A 3D load reconstruction (§5b) is exactly this signal. |
| **OpenGlass** (1st, Llama 3 hackathon) | $20 smart glasses that describe what you see. | Cheap physical capture beats expensive hardware. "One phone replaces a $50K gantry" is the same story. |
| **SplatForge** (AI Engineer World's Fair 2026 gallery) | A robot agent trained inside worlds it reconstructs. | 3D reconstruction from video is a current frontier theme judges respond to. |
| **Evolve** (MongoDB NYC gallery) | Deterministic gates, not the model, pick the winning change; reports p95 latency numbers. | Judges reward "the model proposes, deterministic code decides" when it comes with hard numbers. That is LoadTruth's core rule. Show the numbers. |

**The pattern across winners:**
1. **A domain problem with a named cost, and ideally a named adopter.** Four of five Opus 4.6 winners were not professional developers; domain authenticity won.
2. **One visual moment a judge retells.** Glasses that see, a 3D subsurface model, a permit plan in 20 minutes.
3. **Hard numbers.** Latency, accuracy, dollars, time saved.
4. **The model in a bounded role.** Winners that use AI inside a checked process read as trustworthy.

LoadTruth already has 1 (minus the adopter), 3 (once the benchmark exists), and 4. The missing piece is 2: a moment the judge retells. The strongest candidate is the 3D reconstruction of the load in §5b.

---

## 2b. Code teardown of three winners

Cloned 2026-10-28 into `scratch/winners/` (gitignored, read-only reference): [cc-crossbeam](https://github.com/mikeOnBreeze/cc-crossbeam) (commit `cc5591e`), [llamacon-hackathon-2025-sf](https://github.com/torayeff/llamacon-hackathon-2025-sf) (`3875f78`), [geo-lm](https://github.com/williamjsdavis/geo-lm) (`e3907b3`). Compliance Wizards (LlamaCon 2nd) has no public repo we could find. CrossBeam's public showcase page is [cc-crossbeam.vercel.app](https://cc-crossbeam.vercel.app/).

### The finding that matters most: winners were not the most rigorous code

| | CrossBeam (1st, Opus 4.6) | Llama CCTV Operator (3rd, LlamaCon) | Geo-ML (Best Llama API, LlamaCon) | LoadTruth today |
|---|---|---|---|---|
| Real code size | ~10k LOC TS/TSX + ~70k lines of skill markdown | ~2.6k LOC | Hackathon build was mostly LLM-written CSVs; the ~7k LOC v2 came later | Much larger: 256 backend tests, full console |
| Tests / CI | No unit tests, no CI checks; paid live end-to-end scripts only | None | 48 tests added in the later v2 | 256 pytest + vitest, CI green |
| Accuracy measured | No | No precision/recall | No extraction accuracy | Not yet against ground truth (Blocker 1) |
| Claims vs code | "480+ cities" hero stat, 2 onboarded in `server/src/utils/config.ts`; upload "coming soon" in real mode; Flow 2 absent | Clean, small claims | Multimodal claim not implemented; 3D geometry synthesized from rules and noise (`gempy/spatial.py`) | Analyst docstring says "mock" while README says five AI jobs |
| Security | Cloud Run worker unauthenticated, agent runs `bypassPermissions` | `/video?filepath=` path traversal, CORS `*` | n/a | Tenant-scoped, JWT, RLS layer |

**What this means for LoadTruth:** you already beat all three on engineering. They won on **story, a visible output, and a demo that felt finished**. Engineering depth is 20% of the score; the other 80% is impact, Meta usage, and demo. Do not spend the remaining days on more code quality. Spend them on the things below, which all three winners had and LoadTruth lacks.

### What each winner did that LoadTruth should copy

**CrossBeam: the presentation layer.**
- **A public showcase page** that is the submission's front door, separate from the app. Its order: a real person's story ("a builder friend got a 14-item corrections letter") → embedded demo video with run chips (about 15 min, about 50 agent turns, about $3) → four-stage "anatomy" diagram → two named personas on opposite sides (the builder and Buena Park's mayor) → "the constraint we hit and how we pivoted" (35 min to 15 min via targeted viewing) → a stats band → an honest **Where It Stands** list (Working / In progress / Roadmap) → "built in 7 days, solo." LoadTruth has no public page; `/` is the signed-in overview.
- **Judge-demo mode.** `lib/app-mode.ts` has dev, judge-demo, and real modes. In judge mode the project opens on a **pinned curated result** (`showcaseOutputId` in `project-detail-client.tsx`), with a "Run Live" button that resets and runs for real. The judge sees a perfect result first and can still verify it is live.
- **One status-driven screen.** The project page is a single state machine (ready → processing → awaiting answers → completed or failed), with exactly one large call to action in the ready state and a retry in every failure state.
- **Live activity feed with a stale timer** (`components/agent-stream.tsx`): realtime events with role icons, an event count, and "Agent is thinking… (m:ss since last activity)" after 90 seconds, so a long step never looks frozen.
- **Typed human-in-the-loop questions** (`contractor-questions-form.tsx`): text, number, measurement, or choice inputs, each with a "why we ask" line.
- **Model constraints written as rules in the prompt** (`server/src/utils/config.ts`): every correction needs a code citation or it is dropped ("no false positives"), `[VERIFY]` on low-confidence findings, `[REVIEWER: …]` blanks for judgment calls, and per-flow budget caps.
- **Domain knowledge as a routed skill** (`server/skills/california-adu/SKILL.md`): 28 reference files, and a decision tree loads only 3 to 5 per question.
- **Avoid its mistakes:** a hero stat the code contradicts, a progress stepper that only advances from dev tools, `catch {}` swallowing errors.

**Llama CCTV Operator: plain-language rules and evidence clips.**
- Events are defined by the operator as plain-language triplets (code, description, "detected if and only if …"), sent verbatim to the model with a strict JSON schema `{event_code, detected, explanation}` (`backend/video_event_detector.py`).
- The system prompt limits the model to visual evidence: decide "based strictly on visual and contextual evidence" and "do not infer or assume beyond what is clearly supported."
- Every detection card shows an "AI analysis" explanation and a **View video** button that plays the exact 5-second clip.
- The demo felt live without hardware: a looped real MP4 served as a fake RTSP camera through go2rtc (`streamer/`).
- **Avoid its mistakes:** no dedupe (the same idle event fires every 5 seconds), no accuracy numbers, no cost logging.

**Geo-ML: a constrained intermediate the model writes and code checks.**
- The model writes a small closed-vocabulary language defined by a formal grammar (`geo_lm/parsers/dsl/grammar.lark`: ROCK, DEPOSITION, EROSION, INTRUSION with fixed enums).
- A semantic validator (`parsers/dsl/validator.py`) checks references, cycles, and time consistency, and its errors list the valid options.
- On failure, a retry loop sends the previous output plus the exact validator errors back to the model, capped at 5 attempts (`graphs/document.py`, `DSL_RETRY_PROMPT`).
- The UI exposes that intermediate: a live-validating editor (`web/src/components/DSLEditor.tsx`) where "Build 3D model" only enables once the input is valid, then a three.js viewer (`ModelViewer.tsx`).
- **Avoid its mistakes:** its 3D geometry is synthesized by rules and random noise, not measured, and in v2 Llama is the last fallback behind Anthropic and OpenAI (`ai/models.py`). LoadTruth's 3D in §5b is measured from pixels; say so explicitly, because a judge who saw Geo-ML will ask.

### Changes to LoadTruth from this teardown

Ranked by score moved per hour. Each maps to an existing LoadTruth file or a new one.

| # | Change | Copied from | Where in LoadTruth | Effort | Axis |
|---|---|---|---|---|---|
| 1 | **Public showcase page** at `/showcase` (no login): Tower monitor story → demo video with run chips (seconds, model calls, cost per ticket from the ledger) → 7-stage anatomy → two personas (tower monitor and county finance director, "both sides of one ticket") → "the constraint we hit" (SAM takes one concept per request; reasoning tokens eat `max_output_tokens`; masks are base85, all from `LEARNINGS.md` §2a) → stats band (107M CY, $190M contract, 500% over capacity) → benchmark card → **Where it stands** (Working / In progress / Roadmap, every line true) → "Built in 10 days, solo." | CrossBeam | new `frontend/src/app/showcase/page.tsx` | 0.5 day | Demo, Impact |
| 2 | **Judge mode**: `NEXT_PUBLIC_APP_MODE=judge` opens the console on a pinned, pre-cached ticket (the $43.20 truck) with a "Run live" button that re-ingests the same clip through the real pipeline and lands on the same number (the cache makes it instant and free; a "bypass cache" toggle proves it is live). | CrossBeam | `frontend/src/app/console/page.tsx`, `backend/app/api/ingest.py` | 0.5 day | Demo |
| 3 | **Every anomaly cites a FEMA rule** or it is not shown. Encode the FEMA Debris Monitoring Guide rules LoadTruth enforces (truck certification, measurement, load-ticket fields, eligibility by debris class) as a small reference table with section citations, attach the citation to each `Anomaly`, and show it on the flag card. Low-confidence flags get a visible "Verify" marker. | CrossBeam ("no false positives", code citations, `[VERIFY]`) | `backend/app/pipeline/anomalies.py`, new `backend/app/pipeline/fema_rules.py`, the anomaly card in `frontend/src/components/console/` | 0.5 day | Depth, Impact |
| 4 | **Live pipeline feed with a stale timer**: numbered stage events `[3/7] Reading placard…` streamed to the console during ingest, with "still working, 0:12 since last update." The AI Pipeline page already has the stage trace; make it stream during the run rather than appear after. | CrossBeam | `frontend/src/components/ai/pipeline-trace.tsx`, `backend/app/api/system.py` | 0.5 day | Demo |
| 5 | **Muse Spark writes a constrained ticket draft, code validates, retry with errors.** Spark returns a strict schema for the non-numeric fields (truck id, debris class, evidence frame refs, narrative). A semantic validator checks that the truck exists in the registry, frame refs are in range, and the debris class is in the rate table; errors with valid options go back to Spark, max 3 retries, each attempt logged to the ledger. Spark never emits a quantity. | Geo-ML | `backend/app/ai/live.py`, new `backend/app/pipeline/validate_draft.py` | 0.5 day | Meta usage, Depth |
| 6 | **Plain-language anomaly rules shown to the operator**: each rule rendered as "Flag if and only if …" in the console's rule panel, with the threshold values from code (for example "same truck within 20 minutes"). The rules stay deterministic; the text is generated from the constants, so it cannot drift. | Llama CCTV | `backend/app/pipeline/anomalies.py` (export rule text), admin or guide screen | 2 hours | Depth, Demo |
| 7 | **"Play evidence" on every flag and field**: a button that seeks the evidence viewer to the exact frame range behind that value. | Llama CCTV | `frontend/src/components/console/evidence-canvas.tsx` | 2 hours | Demo |
| 8 | **"Strictly visual evidence" guard** in the OCR and classify prompts, plus a required `explanation` field shown as "AI analysis" on the ticket. | Llama CCTV | `backend/app/ai/live.py` prompts | 1 hour | Meta usage |
| 9 | **Live-camera feel without hardware**: loop a real haul clip through go2rtc as a fake RTSP source and point the existing `rtsp` source adapter at it for one demo shot. Only if days 8 to 9 have slack; it touches the cut list. | Llama CCTV | `backend/app/pipeline/sources.py` | 0.5 day | Demo |
| 10 | **Fix LoadTruth's own claim drift before submitting**, because every winner had some and a code-reading judge will look: analyst docstring vs README, "five distinct jobs," any stat on the showcase page without code behind it. | All three (negative lesson) | `backend/app/ai/agent.py`, `Readme.md` | 1 hour | Depth |

Items 1, 2, 3, and 10 are must-do. Items 4 to 8 are cheap and visible. Item 9 is optional.

---

## 3. The five blockers (fix these before anything else)

Ranked by how much score each one holds hostage.

### Blocker 1. The accuracy number is circular

`accuracy_within_10pct` measures agreement with the monitor's call. The pitch says the monitor's call is the unreliable part. A sharp judge will say "so you measured how well you agree with the thing you replace."

**Fix: build an independent ground-truth benchmark with known volumes.** Two tracks, both this week:

1. **Controlled scale-model benchmark (fast, 50+ clips in one afternoon).** A toy or 3D-printed dump truck with a measured bed volume. Fill it with measured volumes of gravel, mulch, or crumpled paper (for loose vegetative loads) at 0, 20, 40, 60, 80, 100%, plus heaped loads. Film each from the tower angle on a phone, 2 to 3 angles and 2 lighting conditions. Ground truth is the measuring cup, not a human eye. Name it honestly in the pitch: "controlled benchmark, known volumes."
2. **Real-world anchor set (10 to 20 clips).** Landscape suppliers sell mulch and soil by the cubic yard and load it into pickups and trailers with a known volume. Film those loads. Any public storm-cleanup footage where a ticket value is visible goes in a separate "field" set.

Add `backend/app/bench/` (or `scripts/benchmark.sh`) that reads a `ground_truth.csv` (`clip, true_fill_pct, material, angle, lighting`), runs the pipeline from cache, and writes per-clip error, mean absolute error, % within ±10 points, and a breakdown by material and angle. Report the monitor-agreement metric separately and rename it "agreement with monitor," never "accuracy."

**If the numbers come back worse than ±10%:** publish them anyway, broken down by condition (for example "±6 on C&D from the side, ±14 on loose vegetative"). An honest, segmented result with a clear failure mode scores higher on depth than a single suspicious headline. Then the human-confirm step becomes the stated design answer for the hard cases.

### Blocker 2. The AI Analyst is not AI

`app/ai/agent.py` routes by substring match. `muse-spark-1.3` has native tool calling (`models_cost.yaml`). The tools already exist in `app/ai/analyst.py`.

**Fix (about half a day):** add a live analyst path that sends the question plus the tool schemas (`query_tickets`, `query_anomalies`, `event_summary`, `accuracy_stats`, `disputes`) to Muse Spark, executes the tool calls it requests against the tenant-scoped repo, and streams the final answer. Keep the keyword router only as the `MOCK_AI` fallback, and update the docstring. Show the tool calls in the chat UI ("Called query_anomalies(type=impossible_cycle)") so the judge sees grounding, not just prose. Add a guard: any number in the answer must appear in a tool result, otherwise the answer is rejected and retried. That guard is a depth point by itself.

If it cannot be made reliable by Nov 1, cut the chat from the demo (the plan's own day-8 rule) and keep it off the submission's claims list.

### Blocker 3. The hollow-load rule cannot see what it claims

The rule fires on `planar_coverage >= 0.80 and est_fill_pct <= 45`. From a side or elevated view, a monocular camera sees the surface, not the interior void. A CV judge will ask how you know it is hollow.

**Fix:** rename it to what it actually detects ("surface high, measured depth low: possible fluffed or bridged load") and add one physical signal that does see density. Options, in order of feasibility:

- **Dump-event check:** when the bed tips at the disposal cell, SAM tracks the debris pile as it leaves. A fluffed load collapses; the post-dump pile height relative to the bed is lower than the pre-dump surface implied. Needs one extra clip segment per load.
- **Suspension sag (experimental):** SAM segments the wheel and the body; the tire-to-fender gap against the empty-truck baseline in the registry indicates weight. Weak signal for light vegetative loads, so label it experimental. It fits the theme's "understand and control a physical system" line exactly.

Even one of these, shown on one clip, turns the anomaly engine from rules on a ratio into physics.

### Blocker 4. No buyer has spoken

`docs/OUTREACH.md` has templates and an empty tracker. Seven days is enough for one reply if you send 40 messages today. Targets: debris-monitoring firms' ops leads on LinkedIn, county emergency-management and finance staff in Florida, Louisiana, the Carolinas, and Texas, FEMA PA consultants, and debris-contractor owners. Ask one question: "When a load call is challenged on audit, what does it cost you?" A role-attributed quote on a slide moves Impact more than any feature.

### Blocker 5. Scope creep is eating the benchmark

Since day 1, effort went into six theme systems, a billing and invoicing screen, admin CRUD, and source adapters. None of that is on the scoring rubric, and the benchmark and live analyst are still missing. **Freeze UI work now** except what the demo script in §7 needs.

---

## 4. Persona panel

Each persona is a person (or program) who will evaluate the submission. For each: what they check first, the current verdict, and the change that wins them.

### 4.1 Meta ML / DevRel judge (scores "Use of Meta AI tooling")
- **Checks:** Are SAM 3.1 and Muse Spark doing something non-obvious? Is the integration deep (video, streaming, structured output, tool calling) or a single call?
- **Today:** Strong on SAM video tracking with Meta's `meta-sam-parser` and on Spark `input_video` with `text.format` strict JSON. Weak on the analyst.
- **Wins them:** the live tool-calling analyst; showing SAM masks visibly measuring against the bed rails; one more Meta model doing a job only it can do (Muse Voice Transcribe, §5). Mention the docs-level details you got right (one concept per SAM request, base85 masks, reasoning tokens counting against `max_output_tokens`) in a short "What we learned about the Meta API" section of the README. Meta judges reward builders who clearly read and fought with their API.

### 4.2 Computer-vision skeptic (scores "Technical depth")
- **Checks:** How do you get volume from a single 2D view? Where is the error analysis?
- **Today:** Planar coverage times a body-type depth prior, plus a load-height ratio from one frame. Heuristic, uncalibrated, and the docstring says so.
- **Wins them:** the known-volume benchmark with error broken down by angle and material; a **per-load confidence interval** from frame-to-frame variance (`62% ± 4`), shown on the ticket; a calibration plot (predicted vs. true, with the ±10 band). State the failure modes before they ask.

### 4.3 FEMA auditor / Office of Inspector General reviewer (the real buyer's conscience)
- **Checks:** Can I trust this record years later? Who changed what? Can it be tampered with?
- **Today:** Append-only audit log in the schema, content hash per clip, HTML audit packet.
- **Wins them:** an **evidence receipt**. For each ticket, store a SHA-256 over (clip hash + SAM response hash + measured inputs + result + model versions + config), print it with a QR code on the ticket and the packet, and add a "Re-verify" action that recomputes the fill % from the stored masks and shows the identical number. This is the thesis of the product made visible: the number is reproducible. Also keep the human-in-the-loop line explicit: "LoadTruth drafts; the monitor of record signs."

### 4.4 County finance director (Impact)
- **Checks:** How much money does this save or protect, and would FEMA accept it?
- **Today:** Per-truck delta and event roll-up exist. Billing screen exists.
- **Wins them:** one slide that scales the demo number honestly: per-truck delta × loads per day × event days, with every input sourced or labeled as an assumption. Add the deobligation angle: FEMA claws back unsupported costs years later; evidence-linked tickets are what protects the county. Cite the DHS OIG audit already in `Research.md`.

### 4.5 Tower monitor (the daily user)
- **Checks:** Does this slow me down? Is it on my side?
- **Today:** Polished console with confirm/override and keyboard shortcuts.
- **Wins them:** voice capture of their call (§5), so they keep calling loads the way they do now and the system does the paperwork. Frame LoadTruth as protecting the monitor from blame, not replacing them.

### 4.6 Debris contractor (the adversary)
- **Checks:** How do I beat it?
- **Likely attacks:** tilt the camera angle, tarp left on, park so the bed is partly occluded, swap placards, loads bridged with large limbs over an empty bed.
- **Wins the judges, not the contractor:** an "Adversarial cases" table in the README with each attack, what LoadTruth does today (low-confidence flag, `identity_unreadable`, duplicate-truck rule, human review), and what is roadmap. Judges trust builders who red-team their own system.

### 4.7 Startup / investor-minded judge (Impact, "would this be a company")
- **Checks:** Who pays, how much, how it spreads.
- **Wins them:** buyer = monitoring firms and counties; price per ticket or per event against a monitoring contract (the $190M Miami-Dade figure is the market signal); wedge = disaster debris, expansion = every haul paid by the cubic yard (aggregates, landfill gate, construction spoil). One slide, three lines.

### 4.8 The automated "AI judge" code check
- **Checks:** lint, types, tests, security findings, TODOs, secrets, dead code, whether claims in the README match the code.
- **Today:** ruff and pytest green; `npm audit` has 2 critical and 1 high open (`PROGRESS.md` Next #10); mypy had pre-existing issues noted on 2026-10-27; the analyst docstring contradicts the README's "five distinct jobs" claim.
- **Wins it:** run `scripts/eval.sh` clean; fix or pin the npm criticals; make every README claim true (or reword it); delete or label dead adapters; confirm `.env` is not tracked (`git ls-files .env` should print nothing) and that no key appears in `logs/meta_api.jsonl` before the repo goes public.

### 4.9 Demo-video viewer and community voter (Demo axis + bonus prizes)
- **Checks:** Is it cool in the first 10 seconds?
- **Wins them:** open on real footage of a debris truck with SAM masks lighting up, then the money number. No title cards first. Captions on. Under 3 minutes. A 30-second vertical cut for social media to compete for the "most viral" bonus.

---

## 5. Meta features: add, upgrade, or deliberately skip

| Model | Status today | Recommendation | Why it scores |
|---|---|---|---|
| **SAM 3.1 (video)** | Live, two concepts per clip | **Upgrade:** add a third request, `"wheel"` or the dump-event segment, for the density signal in Blocker 3. Show per-frame masks in the overlay with the bed-rail reference line drawn. | Moves SAM from detect to measure, visibly. |
| **Muse Spark 1.3 (video OCR + classify)** | Live, strict JSON | **Upgrade:** add an independent "second reader": Spark estimates fill % from the video on its own, and the ticket shows geometry vs. Spark. Large disagreement raises a review flag. The geometry stays the number of record. | A second Meta model checking the first is a surprising, defensible use, and it fits "AI measures, code decides." |
| **Muse Spark tool calling (analyst)** | Mocked | **Must do** (Blocker 2). | Without it the "five jobs" claim is false. |
| **Muse Voice Transcribe** | Not used | **Add (about half a day).** The monitor speaks the call ("Truck 3391, eighty percent, C&D"); transcription plus a Spark structured-output parse fills `monitor_call_fill_pct` and debris class, timestamp-matched to the clip. Cost is about $0.18 per audio hour. | Matches the real workflow (monitors call loads aloud), adds a third Meta modality, and makes a memorable demo moment. |
| **Muse Spark 1.3 Contributor** | Not used | **Skip, and say why.** County and federal evidence must not be used for model training. Put this in the README's model section. | Shows data-governance judgment, which auditors and Meta reviewers both notice. |
| **Muse Image 1.0** | Not used | **Skip for evidence, and say why.** A generated image must never appear in an evidence chain. Acceptable only for non-evidence marketing art. | Same judgment signal. Using it in the ticket would cost trust. |
| **Muse Glimmer (open, single GPU)** | Not used | **Stretch only, after the blockers.** Post-hurricane sites lose connectivity. An offline mode where Glimmer runs locally (on a single site GPU, stood in for by Baseten per §5a) queues tickets and narrates flags, then syncs when the network returns. Show as a measured prototype or a roadmap slide, not a claim. | Strong story for a disaster product; only worth it if it actually runs. |
| **Muse Wonder** | Configurable | **Leave as an option** for hard analyst questions. Do not spend demo budget on it. | Cost discipline is part of the depth story. |

| **VGGT-1B-Commercial** (Meta + Oxford, open weights) | Not used | **Add, on Modal (§5b).** Turns a short phone sweep of the parked truck into a 3D point cloud with camera poses. Combined with SAM 3.1 masks, it gives the load's 3D shape and a real volume. | Fixes the biggest technical objection (single-view 2D) with a Meta model. The [VGGT repo](https://github.com/facebookresearch/vggt) won the CVPR 2025 Best Paper award, and the `-Commercial` checkpoint is licensed for commercial use except military use ([license](https://huggingface.co/facebook/VGGT-1B-Commercial)). |
| **MetaDepth / HyDen-MoGeV2 metric point maps** (Meta Reality Labs) | Not used | **Benchmark comparison only.** Single-image metric 3D points. Licensed under the FAIR Noncommercial Research License ([repo](https://github.com/facebookresearch/metadepth)), so fine for a research comparison row in the benchmark, not for the product path. | A single-frame fallback when no sweep exists, and an extra row in the benchmark table. |
| **SAM 3D Objects** | Not used | **Skip for measurement, and say why.** It is generative and completes the unseen back of an object ([paper](https://arxiv.org/html/2511.16624v1)). An invented hidden surface cannot be used as billing evidence. | Third documented "we chose not to." It shows you know where generative 3D ends and measurement begins. |
| **Llama (open weights) on Fireworks** | Not used | **Use for the analyst evaluation (§5a).** Generate a few hundred adversarial analyst questions, then score how often the Spark analyst's answers are fully grounded in tool results. | Turns "the chat works" into a measured number. |

**Count after changes:** SAM 3.1 (track, measure, density signal), VGGT (3D reconstruction), Muse Spark (OCR, classify, second-reader estimate, flag narration, tool-calling analyst), Muse Voice Transcribe (monitor call), Llama (analyst evaluation). Five Meta model families, ten distinct jobs, and three documented "we chose not to" decisions.

---

## 5a. Partner credits plan (Modal $100, Baseten $100, Fireworks $25)

The Meta Model API credits ($150) stay for SAM 3.1, Muse Spark, and Voice Transcribe, because those calls are what the "Use of Meta AI" axis scores. Partner credits pay for the open-weight Meta models and for scale.

| Provider | Credit | Spend it on | Why this provider | Budget rule |
|---|---|---|---|---|
| **Modal** | $100 | (1) VGGT-1B-Commercial GPU endpoint for 3D reconstruction. (2) The full benchmark sweep as a parallel batch (`.map` over every clip), so 60+ clips finish in minutes. | Python-native serverless GPUs, per-second billing, and parallel fan-out fit a batch benchmark. Modal also documents [GPU memory snapshots](https://modal.com/docs/examples/gpu_snapshot) that cut cold starts, and there is a public [SAM 3 on Modal](https://github.com/TheFloatingString/sam3-on-modal) example to copy the packaging from. | Develop on the smallest GPU that fits VGGT for about 32 frames. Keep `min_containers=0`. Cache every reconstruction by clip content hash, same as the Meta calls. Hard stop at $70 so $30 remains for judging week. |
| **Baseten** | $100 | **Demo-day redundancy** for the VGGT endpoint (same container, second provider). Stretch: host Muse Glimmer (Apache-2.0, single GPU) as the "site box" offline narrator. | A second, independent GPU host means a cold start or outage on one provider cannot break the live demo. | Deploy only after Modal works. Scale to zero outside rehearsals and judging. |
| **Fireworks** | $25 | Analyst evaluation: generate about 300 adversarial and ambiguous questions with an open Llama model, run them through the Spark analyst, and score grounding (every number appears in a tool result) and refusal behavior (out-of-scope or write requests). | Fast, cheap open-model inference. $25 is enough for evaluation, not for training. | One run, results committed as JSON. Do not spend it on fine-tuning; Spark already reads placards at about 0.9 confidence. |

**What not to do with partner credits:** do not replace SAM 3.1 or Muse Spark with self-hosted models to save Meta credits. That would lower the score on the axis worth 25%.

---

## 5b. The frontier upgrade: SAM 3.1 + VGGT = cubic yards from a 3-second phone sweep

This is the visual moment a judge retells, and it addresses the CV skeptic directly.

**Capture protocol.** The truck stops under the tower anyway, so the monitor can sweep a phone across the parked truck for about 3 seconds. A fixed site camera works too if two are mounted a few feet apart. The sweep gives multiple views of a stationary load, which is what multi-view reconstruction needs.

**Pipeline (new Stage 5b, behind the existing seam):**
1. **SAM 3.1** segments `truck bed` and `debris pile` on the sweep frames (already built).
2. **VGGT on Modal** takes about 16 to 32 sweep frames and returns camera poses plus per-pixel 3D point maps in one forward pass.
3. **Lift masks to 3D.** Each point is labeled bed or load from the SAM mask at its pixel.
4. **Fit the bed floor and rails.** Plane-fit the bed points to get the floor and the rail height.
5. **Metric scale from the registry.** VGGT output is up to scale. The certified truck record already gives the inside bed length and width, so the bed points set the scale. Store those dimensions in the truck registry.
6. **Integrate the volume.** Rasterize load points above the floor plane into a height field on a grid over the bed footprint and sum the cells. Volume in cubic yards, fill % = volume over certified capacity. Heaped loads above the rails count, which the 2D method approximates poorly.
7. **Deterministic after step 2.** Steps 3 to 6 are plain NumPy on stored model output, so the evidence receipt and Re-verify (§4.3) still reproduce the number exactly.

**What the judge sees:** the truck video, the SAM masks, then a rotating 3D point cloud of the load sitting in the bed with the rail plane drawn, and the volume resolving to `12.4 CY`. Render it with three.js in the review console from a stored, downsampled point cloud (a few thousand points), so it is cached and instant.

**Fallbacks, in order:** no sweep → single-frame metric points (MetaDepth, benchmark only) → current 2D geometry. The ticket shows which method produced the number. The benchmark reports all three methods side by side, which is itself a depth signal ("3D cut error from ±X to ±Y").

**Kill switch:** if VGGT is not producing sane volumes on the scale-model clips by **Sat Oct 31 noon**, stop. Keep 2D as the product number and show 3D as a "research preview" on the benchmark only. Do not let it eat demo time.

**Benchmark interaction:** the scale-model rig (Blocker 1) works for 3D too. Sweep the phone across the model truck for each known volume. One afternoon of filming feeds both methods.

---

## 6. System improvements (only the ones a judge can see or the code check will reward)

1. **Evidence receipt + Re-verify** (§4.3). Deterministic replay from stored SAM output. High value, about one day.
2. **Per-load confidence interval** from frame variance, shown as `62% ± 4` on the ticket and in the packet. Low cost.
3. **Benchmark harness** (`scripts/benchmark.sh`, `ground_truth.csv`, results JSON committed) and a dashboard card that renders the calibration plot and error by condition from that file.
4. **Persistent result cache for the demo clip.** The live path must never call the API on stage. Confirm the cache survives a container rebuild (move it to Redis or a file, not process memory).
5. **Real cost ledger on screen**: total spent, cost per ticket (about $0.033 per clip from the first live run), cache hit rate. "A verified ticket costs three cents" is a quotable line.
6. **README rewrite for the submission**: top section is a 3-line pitch, the demo GIF, the benchmark table, and "How to run in one command." Move build history and plans down. Add the adversarial-cases table and the "What we learned about the Meta API" section.
7. **Clean the code check** (§4.8).

**Do not build:** ARQ worker wiring, more source adapters, RBAC screens, more themes, more billing. They are invisible in three minutes.

---

## 7. The demo (3 minutes, pre-cached, filmed)

### The arc

| Time | On screen | Voiceover (one line each) |
|---|---|---|
| 0:00 to 0:12 | Real debris truck video at a tower. SAM masks fade in on the bed and the load. | "After a hurricane, this truck gets paid by how full a person thinks it is." |
| 0:12 to 0:25 | Monitor's voice: "Truck 3391, eighty percent." Transcript appears and fills the call field. | "The monitor calls it by eye, from a tower, all day." |
| 0:25 to 0:50 | Placard crop, OCR reads FL-DT-3391, registry match 20 CY. The phone sweep plays; the view turns into a rotating 3D point cloud of the load in the bed with the rail plane drawn. Volume resolves to `12.4 CY (62% ± 4)`. | "Muse Spark reads the truck. SAM 3.1 finds the load. VGGT rebuilds it in 3D from a three-second sweep. The number comes from geometry, not a guess." |
| 0:50 to 1:05 | Money frame: 16 CY vs 12.4 CY, **$43.20 overbilled**. Event roll-up counts up. | "One truck, forty-three dollars. Across this event, $Y." |
| 1:05 to 1:30 | A second load fires the fluffed-load flag with the dump-event evidence frames. | "This load looks full and isn't. Here's the frame that proves it." |
| 1:30 to 1:50 | Monitor overrides one field in one click; the audit log entry appears. | "The human still decides. Every change is recorded." |
| 1:50 to 2:15 | **Re-verify**: the receipt QR is scanned, the fill % is recomputed from stored masks, identical number, green check. | "Two years later, an auditor gets the same number from the same video." |
| 2:15 to 2:35 | Analyst: "Which trucks had impossible cycle times this week, and what's the exposure?" Tool calls visible, answer with numbers. | "Muse Spark answers from our data, and shows its work." |
| 2:35 to 2:55 | Benchmark card: N clips, % within ±10, error by condition. Cost per ticket. Buyer quote. | "Benchmarked against known volumes. Three cents a ticket." |
| 2:55 to 3:00 | Logo and one line. | "LoadTruth. A load ticket anyone can reproduce." |

### Production rules
- Pre-cache every clip in the script. Rehearse with the network off to prove it.
- Record the screen at 1920x1080, browser zoom so text is readable on a phone.
- Captions burned in. Background music low. Cut every pause longer than one second.
- Record a 30-second vertical cut for social.
- Have a fallback: a recorded run of the live demo, in case the live session breaks.

---

## 8. Submission package checklist

- [ ] Demo video (under 3:00) plus the 30-second cut.
- [ ] Public repo with secrets checked (`git ls-files .env`, scan `logs/`), README rewritten per §6.6.
- [ ] Benchmark results file and plot committed, with the raw `ground_truth.csv`.
- [ ] 6-slide deck: problem in one truck, how it measures, the money, the benchmark, the buyer quote, what's next.
- [ ] Live URL or one-command `docker compose up` with `MOCK_AI=true` working from a clean clone. Test it from a fresh checkout.
- [ ] Every claim in README, deck, and video matches the code (the code check and the judges both compare).

---

## 9. Seven-day plan

| Day | Date | Must finish | Exit check |
|---|---|---|---|
| 3 | Wed Oct 28 | Send 40 outreach messages. Build the scale-model rig; film the first 30 known-volume clips, each with a 3-second sweep. Write `ground_truth.csv` format and `scripts/benchmark.sh`. Deploy a hello-world VGGT container on Modal. | Messages logged in OUTREACH tracker; 30 clips on disk; VGGT returns point maps for one clip. |
| 4 | Thu Oct 29 | Run the first real benchmark (2D method). Live Muse Spark tool-calling analyst with the number guard. VGGT stage: lift masks to 3D, plane-fit, scale from the registry. | First MAE and % within ±10 printed; analyst answers 5 fixed questions with correct tool calls; first 3D volume on one clip. |
| 5 | Fri Oct 30 | 3D volume integration on all scale-model clips via a Modal batch. Tune 2D geometry. Per-load confidence interval. Rename the circular metric to "agreement with monitor." | Benchmark table shows 2D vs 3D error; ticket shows `± N`. |
| 6 | Sat Oct 31 | **Noon: VGGT kill switch (§5b).** three.js point-cloud view in the console. Evidence receipt + Re-verify. FEMA rule citation on every anomaly (§2b #3). | Point cloud renders from cache; Re-verify returns the identical number; every flag card shows its rule. |
| 7 | Sun Nov 1 | Muse Voice Transcribe monitor call. Spark second reader. **Go/no-go on analyst.** Fireworks analyst eval run. Final 50+ clip benchmark sweep. Real-world anchor clips. | Spoken call fills the field; grounding rate committed; benchmark locked. |
| 8 | Mon Nov 2 | Public `/showcase` page and judge mode with pinned ticket + "Run live" (§2b #1, #2). Claim-drift sweep (§2b #10). Code check clean (`scripts/eval.sh`, npm criticals). README rewrite. Adversarial-cases table. Pre-cache every demo clip and its point cloud. Baseten mirror of the VGGT endpoint. | Showcase loads logged out; judge mode opens on the pinned ticket; eval.sh passes; demo runs with network off. |
| 9 | Tue Nov 3 | Record and edit the demo video. Build the deck. Fresh-clone test. | Video under 3:00, captions on; clean clone runs. |
| 10 | Wed Nov 4 | Buffer. Submit by 6:00 PM ET, three hours before the deadline. | Submission confirmation received. |

If you fall behind, drop in this order: Glimmer offline mode, Baseten mirror, density signal (keep the honest rename), Fireworks eval, Spark second reader, voice capture, VGGT (fall back to "research preview" on the benchmark). Never drop: the benchmark, the live analyst (or its clean removal), the receipt, the showcase page, judge mode, the pre-cached demo, the code check.

Cheap teardown items (§2b #4 to #8: streamed stage feed, constrained Spark draft with retry, plain-language rules, play-evidence buttons, visual-evidence prompt guard) fill gaps on any day that finishes early.

---

## 10. Target scorecard after these changes

| Axis | Today | Target | What moves it |
|---|---|---|---|
| Impact | 8.0 | 9.5+ | Buyer quote, honest scaled-dollar slide, deobligation framing |
| Use of Meta AI | 7.0 | 9.7 | Live tool-calling analyst, SAM 3.1 + VGGT 3D measurement, voice capture, Spark second reader, three documented "chose not to" decisions |
| Technical depth | 7.0 | 9.7 | Known-volume benchmark comparing 2D vs 3D methods with error by condition, confidence intervals, evidence receipt with deterministic replay, measured analyst grounding rate, clean code check |
| Demo | 8.0 | 9.8 | Scripted pre-cached arc, the re-verify moment, well-filmed video |

A literal 9.9 also needs the benchmark to land near ±10% on at least the common load types and the live demo to run clean. You control the second fully (pre-cache, rehearse offline). For the first, an honest segmented result is still a 9.5 on depth. A 9.9 means a judge finishes the video and cannot name a claim you did not back with evidence. That is the test to run on every slide and every README line before you submit.
