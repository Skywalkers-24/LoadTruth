# LoadTruth — product demo recording script (2:50)

Updated 2026-10-29. **Direction: show the product journey, from incoming video to an automatically drafted ticket.** Showcase and login establish the experience; overview establishes the county's task; upload and pipeline analysis demonstrate Meta AI; the review console shows the automatically estimated quantity, draft value, and supporting evidence. Re-verify is excluded from this recording.

**Runtime:** 2:50 including the end card, with ten seconds below three minutes. Billing, reports, and settings are optional substitutions, not extra scenes. The main cut should feel like one clip becoming a structured, evidence-backed ticket, with clear results at each step.

## Master cut and spoken script

Read only blockquotes aloud. Director instructions and overlays are not narration. Use the actual selected clip and its resulting ticket throughout the central demonstration. Aim for a calm 125–140 words per minute, with pauses for viewers to read the screen.

### 00:00–00:13 — showcase: make the problem immediate

**Screen:** `/showcase`, starting on the hero. Keep the LoadTruth name and headline readable. Make one short scroll to the problem/case-study section; hold on a single relevant card with its source visible. Use only a sourced statistic you have checked; the default narration needs no large headline number. No full-page scroll or opening logo animation.

**Overlay:** `A truck. A fill estimate. A public payment.`

> After a hurricane, debris haulers are paid by the cubic yard. A monitor estimates how full each truck is. LoadTruth gives that payment decision a video evidence trail.

### 00:13–00:20 — login: enter as the user

**Screen:** Cut to `/login`. Show the truck-scanner background and the actual persona selector. Select County Admin if available and continue. Trim authentication waiting. Keep credentials out of the frame. If the deployed login differs, show its real flow without inventing a persona interaction.

**Overlay:** `County reviewer`

> Let's follow an incoming truck, from video capture to an automatically drafted ticket.

### 00:20–00:35 — overview: establish the task

**Screen:** `/`. Show the active event name, the review queue, and the dollar-discrepancy summary. Briefly open the event switcher, close it, then click Ticket/New Ticket. Hold the queue long enough to see what needs attention. Label demo/seed data; do not describe it as money actually recovered.

**Overlay:** `One event. A prioritized review queue.`

> The overview brings the event's tickets, debris mix, and flagged exceptions together. Now let's see how an incoming truck becomes a ticket automatically.

### 00:35–00:53 — upload: start the real workflow

**Screen:** `/add`. Drop the chosen clip into the upload area. Show the actual live pipeline flow while it processes, then the **Ticket drafted** result. Keep this result tied to the same clip used in the remaining scenes. Copy its ticket ID and identify its pipeline job during rehearsal.

**Overlay:** `Truck video → AI analysis → draft ticket`

> Upload a short truck clip. LoadTruth analyzes the footage, identifies the vehicle and debris, estimates fill, and drafts a ticket. The evidence is attached automatically.

**Editing:** Shorten processing waits with a visible `Processing wait shortened` caption. Label cached footage `Previously processed with Meta AI`; label mocks `Illustrative fixture`. Do not promise a processing time unless measured.

### 00:53–01:25 — Pipeline Runs: show how the result was produced

**Screen:** `/pipeline`. Select this upload's job in **Run history**. Show all seven actual stage rows in **Stage analysis**. Then use two readable detail shots: **Read placard** and **Measure fill**. Expand them to show **AI analysis**, model, status, confidence where reported, duration, and output facts. Keep the truck ID consistent with the draft. Finish by clicking **Open ticket in Review Console**.

**Narration:**

> Here is the analysis behind that ticket. SAM 3.1 tracks and segments the truck, bed, and load. Muse Spark reads the placard and classifies the debris. The registry supplies certified capacity; deterministic code estimates fill and calculates value. Each stage opens into its analysis, model, timing, and output facts, making the automated result traceable to its inputs.

**Detailed choreography within these 32 seconds:**

| Time | Action / viewer takeaway |
|---|---|
| 00:53–00:59 | Select the correct job; show its truck, debris, value, flags, and complete stage list. |
| 00:59–01:08 | Expand **Read placard**; hold the extracted ID and model details. |
| 01:08–01:19 | Collapse that row and expand **Measure fill**; hold inputs, result, and analysis. |
| 01:19–01:25 | Show remaining stage summaries, then open the linked ticket. |

**Stage coverage:** All seven stages appear; two receive readable expanded inspection. Opening every stage would leave too little time to understand any one. Do not present AI-authored explanatory prose as hidden model reasoning or as independent proof of correctness.

### 01:25–01:47 — review console: make segmentation tangible

**Screen:** The same ticket in `/console?ticket=<actual-id>`. Play the evidence clip. Toggle the bed and load layers available in the current deployment. Show masks over the moving footage, then point to estimated fill and any real quality warning. Use one steady crop rather than multiple fullscreen transitions.

**Overlay:** `Bed opening + load coverage → estimated fill`

> In the review console, the masks stay with the moving footage. The fill estimate comes from segmented coverage of the bed opening, then certified capacity converts it to cubic yards. This is a two-dimensional estimate; camera angle and occlusion matter.

### 01:47–02:04 — ticket value: connect the estimate to the payment

**Screen:** Hold on the ticket's estimated fill, cubic yards, debris class, and dollar value. Show the certified capacity and applied rate where available. Do not enter a monitor call. If comparison fields are empty, frame the estimated values rather than the “Awaiting inspector call” message.

**Overlay:** `Estimated fill × certified capacity × rate → draft value`

> The ticket brings together the truck identity, debris class, estimated quantity, and value at the event's rate. The footage stays alongside the estimate, so a reviewer can check the basis for the payment.

Use the actual ticket's values. A monitor call is optional comparison data, not a prerequisite for this demonstration. Without that comparison, do not claim a dollar discrepancy, overbilling, or savings.

### 02:04–02:20 — automated output: show what the platform has completed

**Screen:** Hold on the newly drafted ticket's ID, truck identity, debris class, estimated quantity, value, and attached video. Then show it in the event's ticket list. No manual confirm, override, or dispute interaction is required for this scene. Keep the actual **Draft** status visible.

**Overlay:** `Video in → structured ticket + valuation + evidence out`

> The pipeline has created the ticket, calculated its draft value, and attached the evidence automatically. Review controls are available for exceptions, such as a flagged measurement or a disputed estimate.

This is the automation payoff. Do not imply the draft is an approved invoice, an authorized payment, or independently validated physical volume. Optional review controls can remain visible without becoming a separate demonstration.

### 02:20–02:38 — analyst: move from one truck to event oversight

**Screen:** Open the analyst widget or `/assistant` in the same event. Submit a rehearsed, supported query, such as `Summarize this event`. Show the tool results and a readable completed answer. Highlight one answer figure against its corresponding tool result. A recorded completed response is acceptable with a clear label; do not fabricate typing or results.

**Overlay:** `Ask about the event. Inspect the supporting data.`

> For the wider operation, the analyst summarizes recorded event data and shows the tool results behind its answer. County teams can move from one truck to the event's operational priorities in the same workspace.

**Fallback:** If analyst output is unreliable, return to the overview and show the newly created ticket in the event queue. Say: “Back in the overview, the team can see which tickets need follow-up and continue through the event's review queue. The workflow connects incoming footage, an estimated quantity, and an automatically drafted ticket.” Keep the same 18-second allocation.

### 02:38–02:50 — close with the complete transformation

**Screen:** Return to the same ticket showing truck footage, estimated quantity and value, and draft status. A small caption reads `Current method: 2D estimate · independent volume validation next` unless a real completed benchmark supports a stronger statement. At 02:44 cut to the end card; hold through 02:50. Show the tested demo URL, actual repository URL, and `Built with Meta SAM 3.1 + Muse Spark` when those models appear in the recorded run.

> LoadTruth turns truck video into an evidence-backed load ticket automatically. From incoming footage to a traceable quantity and draft value, in one workflow.

## What appears, and what earns optional time

| Surface | Main cut | Purpose |
|---|---|---|
| Showcase | 13 seconds | Problem, branding, first impression |
| Login | 7 seconds | Persona and entry into the product |
| Overview | 15 seconds | Event context and work queue |
| New Ticket | 18 seconds | Working video-to-draft transformation |
| Pipeline Runs | 32 seconds | All seven summaries; two expanded analyses |
| Review Console | 22 seconds | Moving masks and measurement explanation |
| Ticket value | 17 seconds | Estimated quantity, applied rate, and draft value |
| Automated output | 16 seconds | Created ticket, draft valuation, attached evidence |
| Analyst | 18 seconds | Event-level usefulness |
| Close | 12 seconds | Outcome and links |
| Billing, reports, settings | Optional replacements only | Secondary breadth |

The core cut already uses 170 seconds. Do not append pages just because they exist. If a secondary feature is especially strong, replace the **entire 02:20–02:38 analyst slot** with one of these sequences; keep the timeline unchanged:

- **Reports, strongest alternative:** 6 seconds on report filters, 6 seconds clicking **Audit packet**, 6 seconds on the actual HTML artifact. Narration: “The reporting view turns reviewed tickets into an audit packet, with quantities and evidence links together. Teams can also export CSV for downstream reconciliation.”
- **Billing:** Show actual invoice or reconciliation functionality available in the deployed UI. Narrate only the completed behavior; do not equate a displayed discrepancy with a collected refund. Prefer this only when the billing workflow is a stronger finished result than the analyst.
- **Settings:** Show the real AI/model controls and one task's configuration. Narration: “Model configuration is task-specific, so operators can inspect the selected model and adjust supported reasoning and cost settings.” Avoid changing production configuration just for the take.

Do not squeeze all three into a rapid montage. A viewer should be able to understand the outcome of each screen shown.

## Match the real pipeline

The trace implementation exposes these stages. Use the labels in the running deployment, not the older script's invented stage names:

| Stage | What to show / explain |
|---|---|
| Track and segment | SAM masks across frames |
| Read placard | Muse Spark's extracted truck ID and confidence when reported |
| Capacity lookup | Certified capacity from the registry |
| Measure fill | Deterministic geometry inputs and estimate |
| Classify debris | Muse Spark's material classification |
| Flag anomalies | Rule-derived findings and model narration, if present |
| Value the load | Deterministic quantity/rate arithmetic |

Stage labels and ownership were checked in `backend/app/pipeline/orchestrator.py`. Expanded UI details live in `frontend/src/components/ai/pipeline-trace.tsx`. The **AI analysis** text can be model-authored or a composed fallback. A full result-cache hit may expose only a cache trace: choose a genuine full-stage run for the analysis scene. Do not relabel a cache-only trace as seven fresh model stages.

## Recording preparation

Fill this manifest before the take:

```text
Recording origin:
Tenant / writable event:
Persona / login route:
Clip path / content hash:
Mode: fresh Meta run / previously processed Meta result / mock fixture
Pipeline job / actual models:
Resulting ticket ID / console URL:
Capacity / estimated fill / estimated cubic yards / rate / draft value:
Expected generated ticket and draft status:
Analyst query or replacement scene:
Verified demo URL / repository URL:
```

1. Choose a real playable clip and a writable event; read-only showcase events cannot accept uploads. `data_tests/README.md` lists example filenames, but the corresponding videos were absent from this checkout during review. Locate the actual clip before scheduling the take.
2. Rehearse showcase → login → overview → upload → matching pipeline job → linked ticket → automated output → analyst. Use the same event throughout. Keep a continuous source recording of the central run.
3. Check masks, truck identity, estimated fill, capacity, rate, and draft-value math. No monitor call is needed. If an existing comparison appears incidentally, distinguish it from the estimate and do not describe the difference as proven savings.
4. Warm the backend. Check stored media playback and full-stage job availability immediately before capture; free-host files may be ephemeral and job telemetry is process-local. A database ticket alone does not guarantee its video or trace is still available.
5. Record an uninterrupted successful run before filming close-up takes. Record fresh inference separately from cached results and label whichever appears. Shorten waits transparently; preserve the matching action and result.
6. Use a supported analyst question with the actual event's data. Check the answer against tool results; the analyst routes intents and may use live model composition, so avoid claims of autonomous tool choice or zero hallucinations.

## Picture, sound, and pacing

- Record at 4K if stable, or clean 1080p; stable 30 fps is sufficient. Enlarge UI text until the exported key figures are legible on a phone.
- Keep one theme and a clean browser. Show login intentionally in its seven-second scene; authenticate ahead of time only for retakes of later scenes.
- Use steady cursor movements and direct cuts. Hold after clicks so the viewer sees results; cut loading and navigation dead time.
- Record narration separately if needed. Aim for 125–140 words/minute with a clear, conversational delivery; do not accelerate the voice to rescue an overlong edit.
- Correct captions manually, especially Meta model names, percentages, and currency. Keep them away from the evidence and money frame. Music is optional and should never compete with speech.
- Allocate at least three seconds to read the estimated quantity and value and a visible pause on the automatically generated ticket. No decorative transitions or additional title sequence.
- The whole export, including fades and end-card hold, targets **2:50**. If behind schedule, remove an optional page or extra scroll before trimming core evidence or the generated ticket.

## Claim accuracy and final rehearsal

The current measurement is a **2D coverage-based estimate**, not independently established physical volume. Do not claim hidden-void detection, FEMA approval, immutable evidence, guaranteed funding protection, proven savings, or a fixed three-cent operating cost. Use independent benchmark metrics, buyer quotes, and uncached latency/cost figures only when supporting artifacts exist. The benchmark manifest's example rows alone do not establish accuracy. Clearly distinguish mocks, prior Meta processing, and fresh inference.

- [ ] Showcase and login establish the product without delaying upload past 00:35.
- [ ] The selected event is consistent across overview, upload, pipeline, console, and analyst.
- [ ] One clip reaches its actual ticket; the pipeline trace belongs to that run.
- [ ] Seven stage summaries are visible and two expanded analyses are readable.
- [ ] Moving masks, fill estimate, capacity, rate, and draft value agree with the manifest.
- [ ] Fixture/demo values and shortened waits have clear labels.
- [ ] The generated ticket, draft valuation, and attached evidence are visible without a manual approval step.
- [ ] The analyst or one chosen replacement demonstrates a readable result.
- [ ] Final links work; captions and all numeric claims match the captured run.
- [ ] A new viewer can explain what goes in, what is automated, and what comes out.
- [ ] Watch the export muted, then listen without watching. Verify the uploaded runtime and current submission requirements.

Independent known-volume validation and feedback from actual county/monitoring users remain the strongest ways to improve the submission's substance. The recording should make the implemented workflow clear and memorable.

## Research: what to borrow from winners

These are selected winners and organizer/judge guidance, **not a statistical claim about most winning videos**. Winner status and workflows were checked through organizer recaps and project pages. Linked YouTube pages did not expose usable playback/transcripts consistently; their durations and second-by-second editing could not be verified. Do not describe them as verified under-three-minute examples.

| Primary source / example | Supported observation | Direction for this recording |
|---|---|---|
| [Devpost submission-video guidance](https://googlevertexai.devpost.com/updates/30990-expert-tips-for-creating-your-hackathon-submission-video) | Reviewers emphasize a concise pitch, project requirements, and real user interactions. | Explain the problem over actual footage; show upload, review, and a result. |
| [Devpost interviews with five judges](https://info.devpost.com/blog/hackathon-judging-tips) | Video shapes the first impression; storytelling and the rest of the submission must support each other. | Make the opening understandable without reading the README. Keep every spoken claim consistent with the code. |
| [CrossBeam, first place — organizer recap](https://claude.com/resources/articles/meet-the-winners-of-our-built-with-opus-4-6-claude-code-hackathon) · [linked presentation](https://www.youtube.com/watch?v=jHwBkFSvyk0) | A specific permitting bottleneck becomes a document-in, action-plan-out workflow with municipal interest reported. | Show a county reviewer, one truck, and the audit artifact. Use buyer testimony only when actually obtained. |
| [OrgLens, first place — Meta recap](https://ai.meta.com/blog/llamacon-hackathon/) · [linked presentation](https://www.youtube.com/watch?v=8OmMnODOyLw) | Enterprise records become an expert-matching application. | Tie technical work to a recognizable operational decision. |
| [Llama CCTV Operator, third place — Meta recap](https://ai.meta.com/blog/llamacon-hackathon/) · [linked presentation](https://www.youtube.com/watch?v=4YaZe4Gbt1g) | Video understanding surfaces operator-defined events. | Put moving evidence and the review decision on screen together. |
| [Geo-ML, best API usage — Meta recap](https://ai.meta.com/blog/llamacon-hackathon/) · [linked presentation](https://www.youtube.com/watch?v=U1fDn1C3DJA) | Geological reports become domain-specific 3D output. | Show exactly what the model contributes and what the deterministic code computes. |
| [OpenGlass, first place — Meta recap](https://ai.meta.com/blog/llama-3-hackathon-recap-cerebral-valley/) · [project and embedded demo](https://devpost.com/software/openglass) | A low-cost wearable connects AI to a tangible physical use case. | Start with a real truck and an understandable task. |

**Our editorial inference:** problem → visible transformation → automated output → evidence → wider usefulness → memorable close. These examples motivate that structure; they do not establish a universal winning formula.

[Current official event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) confirms the Meta tooling and physical-system theme. `Hackathon.md` records submission weights of impact 30%, Meta tooling 25%, execution 20%, demo 25%; those weights and a video limit were not exposed on the fetched public overview. Check the submission portal's current instructions before export. Under three minutes is the brief for this recording regardless.
