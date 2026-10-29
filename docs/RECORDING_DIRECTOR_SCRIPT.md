# LoadTruth Live 4K Recording & Director Script

This document directs the agent (or human presenter) step-by-step through recording a **live, end-to-end 4K product walkthrough** for the **Hackathon Winner Demo Video**.

---

## 🛠️ 1. Technical Setup & Pre-Flight

| Parameter | Recommended Value | Notes |
|---|---|---|
| **Resolution** | 3840 × 2160 (4K UHD) | Or 1920 × 1080 @ 200% OS Retina scaling for ultra-crisp UI text. |
| **Framerate** | 60 FPS | Smooth mouse motion and video background playback. |
| **Browser** | Google Chrome (Clean Profile / Incognito) | Zoom: 100% or 110% for high readability. |
| **Base URL** | `https://loadtruth.tiwabhay800.workers.dev` | Live production Cloudflare Worker. |
| **Demo Clip to Upload** | `data_tests/clean-partial-veg__haul.mp4` (or `hollow-load__haul.mp4`) | Available in the repository root. |
| **Audio** | Dedicated microphone, low background noise | Natural, energetic voiceover (~135 words/min). |

---

## 🎬 2. Step-by-Step Director Cue Sheet

---

### SCENE 1: The Public Showcase (`/showcase`)
- **URL:** `https://loadtruth.tiwabhay800.workers.dev/showcase`
- **Duration on Screen:** ~25 seconds
- **Pacing:** Engaging, sets up the multi-billion-dollar problem.

#### Action & Mouse Choreography:
1. Start directly at the top of the Showcase page.
2. Smoothly scroll down past the **Hero Statement**: *"Every debris load ticket is a number nobody can reproduce."*
3. Pause for 2 seconds over the **Sourced Case Studies Grid** (highlighting the **107M CY**, **$190M Miami-Dade**, and **$716K DOJ Clawback** cards).
4. Scroll to the **7-Stage AI Pipeline Anatomy** diagram showing `sam-3.1` and `muse-spark-1.3`.
5. Scroll back up and click the top-right button: **"Explore benchmarked videos"** or click **Sign In** to navigate to `/login`.

#### Voiceover Script:
> *"After a hurricane or natural disaster, debris cleanup is a multi-billion-dollar operation. Yet right now, millions of cubic yards are billed based on a guess: a human monitor in a tower looking down at a dump truck for three seconds.*
>
> *When federal FEMA auditors arrive two years later, those ungrounded calls fail review, leading to clawbacks and audit lawsuits.*
>
> *LoadTruth solves this with Meta AI: turning subjective eyeballing into verifiable geometric proof."*

---

### SCENE 2: The Login Screen (`/login`)
- **URL:** `https://loadtruth.tiwabhay800.workers.dev/login`
- **Duration on Screen:** ~15 seconds
- **Pacing:** Fast-paced, highlighting enterprise role-based security.

#### Action & Mouse Choreography:
1. The login screen loads with the **dark-mode truck scanner video background** playing in 4K.
2. Hover over the persona list:
   - Highlight **"County Admin"** (`admin@pinellas.gov`).
   - Briefly hover over **"Field Monitor"** (`monitor1@gulfresponse.org`) to show role differentiation.
3. Select **"County Admin"** (blue focus ring activates).
4. Click **"Continue"** with a single confident click.

#### Voiceover Script:
> *"LoadTruth is built for multi-agency disaster operations. Role-based capabilities are enforced cryptographically server-side. Today, we'll sign in as the County Admin."*

---

### SCENE 3: The Event Overview Dashboard (`/`)
- **URL:** `https://loadtruth.tiwabhay800.workers.dev/`
- **Duration on Screen:** ~20 seconds
- **Pacing:** High-level executive confidence.

#### Action & Mouse Choreography:
1. Dashboard animates in: *"Good evening, County"*.
2. Move mouse to the **Top-Bar Event Switcher** (`Camp Fire Recovery 2026`).
3. Click the dropdown:
   - Show the expanded, wide popover displaying full event names (*Hurricane Debris Recovery*, *Winter Storm Uri*).
   - Point to the active badges: `Judge benchmarked` and `Meta processed`.
4. Close dropdown and hover over the **Total Dollar Delta ($1,402 overbilled)** and **Debris Classification Breakdown** bars.
5. In the left navigation rail, click **"Ticket"** (`/add`).

#### Voiceover Script:
> *"Our Overview dashboard tracks event-wide haul integrity in real time. Across our active disaster zone, LoadTruth has already flagged thousands in over-billed volume differences.*
>
> *Let's capture and verify a brand-new truck incoming at the gate."*

---

### SCENE 4: New Ticket Upload & AI Pipeline Ingestion (`/add`)
- **URL:** `https://loadtruth.tiwabhay800.workers.dev/add`
- **Duration on Screen:** ~30 seconds (post-cut)
- **Pacing:** High technical credibility.

#### Action & Mouse Choreography:
1. The "Capture a new ticket" dropzone is visible.
2. Drag and drop `clean-partial-veg__haul.mp4` (or click and select from file dialog).
3. The upload bar fills.
4. The **Live 7-Stage Pipeline Trace** activates:
   - *Stage 1: Frame Sampling*
   - *Stage 2: Muse Spark Vehicle OCR & Placard Extraction*
   - *Stage 3: Debris Classification*
   - *Stage 4: Registry Lookup*
   - *Stage 5: SAM 3.1 Multi-Concept Video Segmentation*
   - *Stage 6: Anomaly Detection*
   - *Stage 7: FEMA Valuation Draft*
5. The **"Ticket drafted"** green card appears with ticket ID and dollar valuation.
6. Click **"Open ticket"** (or click the row in the recent table below) to enter the Review Console.

> ✂️ **POST-PRODUCTION CUT POINT 1:**
> During filming, let the pipeline run live. In editing, speed up or jump-cut the processing wait to **4–6 seconds** so the viewer sees the stages check off in rapid succession!

#### Voiceover Script:
> *"When a loaded hauler reaches the monitoring tower, the gate camera stream is ingested.*
>
> *Instantly, our 7-stage Meta AI pipeline executes: Meta Muse Spark 1.3 extracts the vehicle placard with zero-shot video OCR and classifies the vegetative debris. In parallel, Meta SAM 3.1 runs spatio-temporal video tracking across the truck bed and load volume.*
>
> *Within seconds, a fully audited ticket is drafted."*

---

### SCENE 5: The Review Console & Evidence Canvas (`/console`)
- **URL:** `https://loadtruth.tiwabhay800.workers.dev/console?ticket=...`
- **Duration on Screen:** ~40 seconds
- **Pacing:** The technical centerpiece.

#### Action & Mouse Choreography:
1. Arrive on the Review Console.
2. Center stage is the **Evidence Canvas**:
   - Point out that **Body** (amber), **Bed** (blue), and **Load** (green) are **all checked by default**.
   - Scrub or play the video clip: show the SAM 3.1 segmentation masks clinging to the moving load.
   - Click the **Body** toggle off and on to show the isolated dump truck tailgate.
   - Click the **Fullscreen** icon on the viewer, let it play for 3 seconds, then hit ESC.
3. Direct attention to the **Money Frame (Dollar Difference Hero)** on the right:
   - Point to the **Monitor Call (80%)** vs **LoadTruth Estimate (62%)**.
   - Highlight the **Signed Dollar Delta (-$43.20 Overbilled)**.
4. Scroll down slightly to show the **Itemized Anomaly Flags** (e.g. *Fluffed load / hollow interior* with evidence frame).

#### Voiceover Script:
> *"Here in the Review Console, we see the real power of Meta AI:*
>
> *Unlike naive detection apps, SAM 3.1 measures real physical volume. By tracking the calibrated truck bed geometry against the segmented debris surface across every video frame, we get an empirical fill percentage.*
>
> *Here, the human tower monitor called this truck at eighty percent. SAM 3.1 measured sixty-two percent. That single truck was overbilled by forty-three dollars and twenty cents.*
>
> *Every anomaly is backed by exact video timestamp frames."*

---

### SCENE 6: Cryptographic Evidence Receipt & 1-Click Re-Verify
- **Component:** Reproducibility Card (in center column below metadata)
- **Duration on Screen:** ~25 seconds
- **Pacing:** Deliver with deliberate authority.

#### Action & Mouse Choreography:
1. Scroll down to the **Reproducibility Card**.
2. Hover over the **SHA-256 Receipt Hash**: `sha256:...`.
3. Click the **"Re-verify"** button:
   - The button pulses / shows a re-verification check.
   - The green checkmark appears confirming deterministic replay.
4. In the decision bar at the bottom, click **"Confirm"** or **"Override"** to show supervisor review actions.

#### Voiceover Script:
> *"Now for the feature FEMA auditors love: Every ticket is bound to an immutable cryptographic Evidence Receipt.*
>
> *Two years from now, an auditor can hit 'Re-verify'. LoadTruth deterministically replays the geometry equations over the stored SAM 3.1 masks and recalculates the exact same fill percentage down to the decimal.*
>
> *No more lost FEMA funding."*

---

### SCENE 7: Grounded AI Analyst & Cost Ledger (`/assistant` or `/pipeline`)
- **URL:** Floating Assistant Widget or `/assistant`
- **Duration on Screen:** ~25 seconds
- **Pacing:** Closes on production readiness and efficiency.

#### Action & Mouse Choreography:
1. Open the floating **AI Analyst Widget** in the bottom-right corner.
2. Prompt: *"Which trucks had overbilling discrepancies above 20% this week?"*
3. Watch the assistant output tool-calls and return a strictly grounded answer with zero hallucinations.
4. Navigate to `/pipeline` to show the **Cost Ledger**:
   - Highlight: **Cost per ticket: ~$0.033** (3.3 cents).
   - Point to the **Render Key Value cache hit rate**.

#### Voiceover Script:
> *"Our AI Analyst is powered by Muse Spark with tool-calling. Every single figure in its answers is grounded in live database queries—guaranteed zero hallucinations.*
>
> *And thanks to intelligent Render Key Value caching and token-budgeted prompts, running LoadTruth costs just three cents per verified load."*

---

### SCENE 8: Closing Logo & Call to Action (Outro)
- **Duration on Screen:** ~10 seconds
- **Pacing:** Punchy finish.

#### Action & Mouse Choreography:
1. Return to the Showcase page or display clean closing slide.
2. Display: **LoadTruth — Verifiable Disaster Debris Auditing**.
3. Display GitHub repository URL and Meta AI Hackathon badge.

#### Voiceover Script:
> *"LoadTruth: AI measures, humans decide, and FEMA gets an audit trail nobody can question.*
>
> *Built with Meta SAM 3.1 and Muse Spark. Thank you."*

---

## ✂️ 3. Post-Production Editing Checklist

1. **Total Runtime:** Cut strictly between **2:40 and 2:58** (must never exceed 3:00).
2. **Speed-Ramps:**
   - Ingest / Upload wait time: Speed up 400% or jump-cut with a smooth subtle dip/whoosh.
   - Page transitions: Keep transitions instant (1 frame cut).
3. **Audio Levels:**
   - Voiceover: Peak at **-3 dB**.
   - Background Music: Subtle ambient tech/synth track sitting at **-24 dB** (drops to **-28 dB** during voiceover).
4. **Captions:**
   - Burn in bold, center-bottom subtitles (e.g. *Montserrat* or *Inter*, white with slight black drop shadow).
5. **Zoom Ins:**
   - 120% subtle punch-in on the **SAM 3.1 toggle pills** (*Body*, *Bed*, *Load*).
   - 120% punch-in on the **Dollar Difference ($43.20)**.
   - 120% punch-in on the **Re-verify** green check.
