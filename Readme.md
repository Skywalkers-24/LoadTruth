# LoadTruth

**Video-verified load tickets for hauling that gets paid by the cubic yard. It starts with disaster-debris removal.**

Built for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) (Oct 26 – Nov 4, 2026).
Track: Indie developer · Theme: Push the Frontier · Event notes, waiver summary & judging criteria: [HACKATHON.md](./HACKATHON.md)

---

## The problem

After a hurricane, wildfire or tornado, local governments hire contractors to haul away debris. Those contractors are paid **per cubic yard**. The cubic yards are decided by a human "tower monitor" who looks down into each dump truck and estimates how full it is, usually in 10% increments. That estimate goes on a load ticket, and the ticket is the basis for payment. FEMA reimburses the government afterward.

What goes wrong today:

- **Subjective.** The estimate can't be reproduced or checked later. Monitors are short-term surge hires who get tired.
- **Fraud-prone.** DOJ has prosecuted cases of fake load slips and bribed monitors. Load-ticket accounting is a documented source of billing fraud, and DHS OIG has warned FEMA about the risk.
- **Audited years later.** When documentation can't be defended, FEMA can take funding back after it has been paid (a "deobligation").
- **Large and labor-heavy.** The 2024 season produced about 107M cubic yards of debris. Miami-Dade just awarded a $190M, five-year debris-monitoring contract. One small city (Dunedin, FL) spent about $600K on monitoring for a single season.

The only automated alternative today is a laser-scanning gantry (e.g., Loadscan). Gantries are expensive and slow to set up at temporary debris sites that open within 72 hours of a storm.

## The solution

A phone or pole camera at the tower records every truck. LoadTruth turns that video into a verified load ticket:

1. **Track and identify the truck.** SAM 3.1 tracks each truck through the frames. Muse Spark reads the truck's ID placard.
2. **Look up its capacity.** The truck number is matched to the truck's certified capacity.
3. **Estimate fill %.** SAM 3.1 segments the truck bed and the debris on top. A fill estimate comes from the load surface measured against the bed rails, plus depth, using one or two camera views.
4. **Classify the debris.** Muse Spark sorts it into vegetative, construction and demolition, or white goods. Each type is paid at a different rate.
5. **Flag anomalies.** Duplicate trucks, cycle times that are physically impossible, and hollow or "fluffed" loads.
6. **Keep a human in the loop.** The monitor confirms or overrides each call, and every decision keeps its evidence frames.
7. **Export.** Tickets come out as FEMA/FROC-format PDF or CSV, plus a county dashboard comparing the monitor's calls with LoadTruth's estimates.

## Why now

- **SAM 3.1** (March 2026) does text-prompted segmentation and tracking across video. It tracks up to 16 objects in one forward pass, at about 32 FPS on a single H100.
- **Muse Spark** reasons natively over images and video, with a 1M-token context, at $1.25 / $4.25 per million input/output tokens.
- **FEMA is shifting costs to states**, so local governments increasingly carry the risk with their own money.
- **Five years ago** this would have needed laser gantries or custom detectors trained for each truck type.

## Meta stack

| Component | Use |
|---|---|
| `sam-3.1` (Meta Model API, Responses API) | Segment and track "dump truck", "truck bed", "debris pile", "truck placard" |
| Muse Spark | Placard OCR, debris classification, anomaly reasoning, ticket drafting |
| Muse Code | Speed up the build |

## MVP scope (10 days)

| Days | Deliverable |
|---|---|
| 1–2 | Collect clips (public storm-cleanup footage plus phone video of local haul trucks); ingest pipeline; SAM 3.1 tracking |
| 3–5 | Fill-% estimator (bed rails vs. load-surface mask, plus depth); capacity lookup |
| 6–7 | Debris classification; anomaly rules; confirm/override UI for the monitor |
| 8–9 | FEMA/FROC-format ticket export; county dashboard; accuracy benchmark on 50+ clips |
| 10 | Demo video: a truck passes the tower → a ticket with evidence → a dispute resolved in one click |

**Success metric:** fill-% estimates within ±10% of careful human measurement.

## Customers

- **First customer:** a small or mid-size debris-monitoring firm that competes with Tetra Tech in county bids and wants an "AI-verified monitoring" edge.
- **Also:** county finance and emergency-management directors who've been hit by a FEMA deobligation, and haulers disputing low calls.

## Expansion path

1. Automate truck certification.
2. Cover all disaster debris: hurricane, wildfire, tornado, flood.
3. Move to year-round hauling paid by volume: construction haul-off, landfill and transfer-station gates, snow removal, mulch, dredge spoils.
4. Settlement layer: pay haulers the same day against verified loads.
5. Ground-truth debris-volume data for insurers and parametric disaster programs.

## Moat

- A registry of certified trucks that spans disasters (haulers follow the storms).
- A dataset of truck bodies × load states × debris types, linked to audit outcomes.
- Becoming the neutral evidence standard written into state ticket templates.

## Closest alternatives

| Product | Gap |
|---|---|
| Loadscan | Laser gantry hardware: expensive, slow to deploy at temporary sites |
| Ticketpros | OCR of paper tickets, which just digitizes the human's guess |
| In-house apps at monitoring firms | Digital forms, no measurement |
| Rice DebrisHeightNet (research) | Aerial forecasting before hauling, not per-load verification |

## Risks

- **Buyer incentives.** Monitoring firms bill by the hour for the labor this replaces. Mitigation: sell to challenger firms that want to win fixed-fee bids with fewer people.
- **Policy.** The FEMA Review Council has proposed replacing Public Assistance with a parametric formula, which could weaken documentation requirements.
- **Accuracy.** Irregular vegetative loads are hard to measure. The human-confirm step and the accuracy benchmark address this.
- **Seasonality.** Mitigated by expanding to year-round construction and waste hauling.

## 7-day validation plan

- Interview 15 monitoring-firm ops managers and 10 county emergency-management or finance contacts (find them through Legistar contract records and the DRCA).
- Ask how many load-call disputes they see per event, and the dollar value of their last deobligation.
- Get 50+ real tower clips and benchmark LoadTruth against the monitors' calls.
- Goal: 2 letters of intent or design partners.

## Pitch

> Loadscan accuracy for the price of a phone: video-verified tickets for every truck paid by the yard.

---

## Sources

- YC Requests for Startups: https://www.ycombinator.com/rfs
- SAM 3.1: https://ai.meta.com/blog/segment-anything-model-3/ · https://dev.meta.ai/docs/media-segmentation
- Muse Spark: https://dev.meta.ai/resources/blog/build-with-muse-spark
- FEMA debris volumes (2024 season): https://www.fema.gov/press-release/20250926/recovery-continues-after-historic-2024-hurricane-season
- Florida load-ticket guidance: https://portal.floridadisaster.org/projects/FROC/Discussion%20Documents/Debris%20Load%20Ticket%20Guidance%20and%20Sample.pdf
- DHS OIG debris-monitoring alert: https://www.oig.dhs.gov/sites/default/files/assets/2018-10/OIG-18-85-Sep18.pdf
- Load-ticket fraud & debris volume research: https://arxiv.org/html/2608.17165
- Miami-Dade monitoring contract: https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf
- Loadscan: https://www.loadscan.com/debris-monitoring-technology-conference/
- FEMA Review Council proposal: https://static1.squarespace.com/static/686be575553547662d43d559/t/6a297a99ac7a950ec972ced9/1781103279338/2026_FEMA+Review+Council_Report.pdf
