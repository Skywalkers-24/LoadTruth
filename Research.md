# LoadTruth: System design based on FEMA debris monitoring

The most important takeaway from FEMA’s guidance is this: debris monitoring is a chain-of-custody and quantity-verification process, not just a truck-detection problem.

A valid record connects the approved debris-removal operation, a certified truck, the load collected, the receiving/disposal site, and the documented quantity. FEMA’s [Debris Monitoring Guide (PDF)](https://www.fema.gov/sites/default/files/documents/fema_debris-monitoring-guide_sop_3-01-2021.pdf?utm_source=chatgpt.com) provides sample ticket forms and monitoring procedures. Esri’s [Emergency Debris Management workflow](https://doc.arcgis.com/en/arcgis-solutions/11.3/reference/use-emergency-debris-management.htm?utm_source=chatgpt.com) illustrates how truck certification, loading tickets, unloading tickets, and audit records work together.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.fema.gov\&sz=32)

fema.gov

+1



## 1. Model the real-world process first

1\. Register and certify truck

Truck ID, license plate, contractor, driver, measured capacity

2\. Observe loading

Capture load ticket, debris type, time, location and truck evidence

3\. LoadTruth analyzes evidence

Detect truck, read candidate ID, extract timestamps and estimate visible fullness

4\. Match unloading record

Confirm ticket, receiving site, unloading time and reported quantity

5\. Human review and audit

Resolve mismatches, approve corrections and export evidence-backed records

FEMA’s workflow describes a loading monitor initiating the ticket and an unloading monitor completing the chain of custody when the truck reaches the debris management site or landfill. Trucks should have certified capacities documented before hauling.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://doc.arcgis.com\&sz=32)

Documentation

+1



## 2. What a load ticket should contain

The 2021 FEMA guide's sample load ticket gives you a useful starting schema.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.fema.gov\&sz=32)

fema.gov



| Section        | Fields to store                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Identification | Unique ticket number, incident, municipality/applicant                                                               |
| Contractor     | Prime contractor, subcontractor                                                                                      |
| Truck          | Truck ID, license plate, certified capacity in cubic yards, driver                                                   |
| Loading        | Date/time, monitor, address or GPS location                                                                          |
| Debris         | Classification such as vegetation, construction and demolition, white goods, hazardous household materials, or other |
| Unloading      | Date/time, monitor, debris management site / disposal location                                                       |
| Quantity       | Estimated percentage full, calculated volume in cubic yards, or actual weight where applicable                       |
| Evidence       | Photos/videos, source timestamps, ticket attachments and reviewer notes                                              |
| Verification   | Monitor confirmation, review status, corrections and audit history                                                   |

Treat these as separate data fields, not a single AI-generated paragraph. Keep original observations distinct from corrected or human-confirmed values.

## 3. Quantity calculation and its limitations

A common volume estimate in the documented workflow is:

\\[ \text{Estimated volume (CY)} = \text{Certified capacity (CY)} \times \frac{\text{Estimated fullness (\\%)}}{100} \\]

For example, a truck certified at 20 cubic yards and assessed as 75% full produces:

\\[ 20 \times 0.75 = 15\text{ CY} \\]

That is an estimated credited volume, not a physical measurement of the debris. The documented Esri workflow uses truck capacity and an entered visual fullness percentage to populate load size.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://doc.arcgis.com\&sz=32)

Documentation



For LoadTruth, record whether the percentage came from a field monitor or AI assistance. Do not silently replace the monitor's value with a vision estimate. A video may show only one side of a truck or an obstructed bed, and a single view cannot reliably establish exact volume.

## 4. The AI features worth building

Organize the AI into six focused tasks rather than asking one model to make the whole decision.

A. Truck detection and tracking

Detect trucks across video frames, assign temporary track IDs, and estimate when each truck enters, loads, and leaves the scene. A track ID is not the same as a verified vehicle identity.

B. Placard and license plate OCR

Extract candidate text, preserve the source image crop, and store the OCR confidence. Require review when the text is unreadable or conflicting.

C. Load-state estimation

Identify debris in the truck bed and estimate visible fullness as a range. Save the frame and any masking or segmentation output used to generate the estimate.

D. Timeline extraction

Create timestamped events such as truck first seen, candidate ID visible, loading observed, loaded truck departs, and unloading observed—only when supported by footage.

E. Ticket reconciliation

Compare the video evidence with the recorded truck, certified capacity, loading and unloading records, site, debris category and quantity. Missing evidence should remain marked as missing.

F. Evidence-backed report generation

Produce a reviewable load ticket, a linked evidence timeline, and a PDF or CSV export for auditors. Every AI-generated finding should link back to its underlying evidence.

## 5. Build a rule-based anomaly engine

Your differentiator should be a system that tells an auditor what deserves attention and why, not a model that declares a contractor guilty.

| Rule                            | Example alert                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| Uncertified truck               | Ticket refers to a truck without an active certification                                |
| Truck identity mismatch         | Video OCR and recorded truck ID disagree                                                |
| Missing unload record           | A load ticket has no matching unloading ticket                                          |
| Inconsistent capacity           | Ticket capacity differs from the certified truck record                                 |
| Implausible quantity            | Recorded volume exceeds certified capacity without an applicable documented explanation |
| Timeline anomaly                | Recorded event times conflict with the observed video sequence                          |
| Duplicate or suspicious tickets | Repeated identifiers, overlapping records, or unusually similar evidence                |
| Unclear evidence                | Placard or loading state cannot be established confidently                              |

These are proposed software checks inspired by the documented monitoring workflow, not a list of official FEMA-defined fraud rules. An anomaly is a prompt for review, not proof of misconduct.

## 6. Minimum database design

Use PostgreSQL for structured records and object storage or a local file store for the source media and evidence frames.

| Table           | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `incidents`     | Disaster, jurisdiction and applicable monitoring configuration              |
| `contractors`   | Prime/subcontractor and removal-provider information                        |
| `trucks`        | Truck ID, license plate, capacity, certification dates and status           |
| `tickets`       | Load ticket, haulout type, timestamps, locations, debris class and quantity |
| `ticket_events` | Loading, departure, arrival, unloading and other timestamped events         |
| `media_assets`  | Original video, metadata, checksum and access information                   |
| `evidence`      | Source timestamp, frame reference, OCR output, detection and confidence     |
| `anomaly_flags` | Rule triggered, supporting evidence, severity and review state              |
| `reviews`       | Human decisions, corrections, reviewer identity, timestamp and reason       |

Every ticket should have a stable ID. Link the unloading record to the original ticket instead of creating an unrelated record. Keep an append-only audit history of edits and decisions.

## 7. What the main dashboard should answer

A manager should be able to understand the operation without inspecting every video.

Ticket status

Total tickets, matched load/unload records, pending reviews

Truck activity

Certified trucks, unique trucks, trips and repeat activity

Reported volume

Estimated cubic yards by contractor, debris type and site

Review queue

Missing tickets, conflicts, low-confidence observations and unresolved flags

Make every chart drill down to its actual tickets, evidence frames and review history. Esri's existing solution already offers ticket records, site and provider views, volume charts and exportable logs, so LoadTruth should focus on adding automated video evidence and reconciliation rather than simply duplicating those reporting features.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://doc.arcgis.com\&sz=32)

Documentation

+1



## 8. The fastest realistic MVP

Build in this order:

1. Ticket data model and upload: upload videos, create a ticket record, extract timestamped frames.
2. Evidence detection: detect the truck, OCR the placard where possible, and identify candidate loading events.
3. Human review: show each AI finding beside its source frame, allowing the reviewer to confirm or correct it.
4. Reconciliation: compare certified capacity and recorded tickets, matching loading and unloading records.
5. Audit report: export a PDF with the ticket fields, evidence thumbnails, timestamps, uncertainty and review history.

Do not start with automated fraud detection or exact three-dimensional volume estimation. Those can come after you have reliable evidence collection and representative, annotated footage.

### System prompt for your coding AI

Build LoadTruth, a video-assisted disaster debris monitoring and audit system informed by FEMA's Debris Monitoring Guide and the documented load-ticket workflow.

The system must:

1. Store incident, contractor, certified truck, load-ticket, unload-ticket, source-media, evidence, anomaly and review records.
2. Let a user upload real video and extract timestamped frames.
3. Detect trucks, track them across frames when possible, run placard OCR, and identify candidate loading/unloading events.
4. Save every AI finding with its source video, timestamp, frame reference, confidence, and review status.
5. Generate a reviewable load ticket using certified truck capacity and recorded monitoring information. Keep AI estimates separate from monitor-confirmed values.
6. Match loading and unloading records by ticket identity, truck, time, location and other available evidence. Do not automatically match records when the evidence is ambiguous.
7. Flag missing records, uncertified trucks, identity or capacity conflicts, duplicate records, timeline inconsistencies and low-confidence evidence.
8. Provide a dashboard with ticket status, truck activity, reported volume, anomaly counts and a review queue.
9. Generate downloadable PDF and CSV reports containing ticket information, source timestamps, evidence references, human decisions and an audit trail.
10. Never invent truck identities, locations, ticket fields, observed events or quantities. Represent missing information as unknown. Never treat an anomaly as proof of fraud.
11. Use PostgreSQL for structured data and local or object storage for media. Implement a working end-to-end vertical slice before adding advanced features.

Deliver a runnable MVP with a clean interface, realistic clearly-labelled sample data, tests for quantity calculation and record matching, and documented setup instructions.

The product principle to preserve: LoadTruth should make each reported debris load easier to verify, explain, and audit. The AI produces evidence and flags inconsistencies; the responsible monitor or reviewer retains authority over the official record. This is a design aligned with the monitoring concepts in the cited guidance, not a claim that the software itself is FEMA-certified or guarantees reimbursement compliance.

---

# Why this matters: real-world case studies

Debris monitoring is a multi-billion-dollar problem where the quantity written on a load ticket is the quantity the taxpayer pays for. The cases below — all from government reports, court records, and news coverage — show the scale of the money, the recurring failure mode (overstated truck loads and weak oversight), and why automated, evidence-backed verification like LoadTruth is valuable. Figures are paraphrased from the cited sources; see each link for the primary statement. *Content rephrased for compliance with licensing restrictions.*

## The scale of the problem

**1. The 2024 hurricane season — ~107 million cubic yards of debris.**
After Hurricanes Helene and Milton, FEMA reported that more than 107 million cubic yards of debris were cleared across the Southeast, with billions obligated to speed removal. Every one of those cubic yards flows through a load-ticket count that someone has to verify. Source: [FEMA — Recovery Efforts One Year After Helene and Milton](https://www.fema.gov/blog/recovery-efforts-continue-one-year-after-hurricanes-helene-and-milton) and [FEMA — Recovery Continues After Historic 2024 Hurricane Season](https://www.fema.gov/press-release/20250926/recovery-continues-after-historic-2024-hurricane-season).

**2. Florida's Helene/Milton debris reimbursement — ~$2 billion.**
FEMA reported nearly $2.0 billion obligated to Florida communities to reimburse debris removal, infrastructure repair, and emergency work after the 2024 storms. Source: [FEMA — Florida Helene and Milton Recovery Fact Sheet 076](https://www.fema.gov/fact-sheet/florida-helene-and-milton-recovery-fact-sheet-076).

**3. Hurricane Ian (2022) — millions of cubic yards, tens of millions per city.**
Florida reported that more than four million cubic yards of upland debris and nearly 931,000 cubic yards of wet debris were removed statewide after Ian ([FL Governor's Office](https://www.flgov.com/eog/news/press/2023/florida-provides-updates-hurricane-ian-recovery-efforts-one-year-after-landfall)). FEMA approved $40.1 million for just two cities — including $33.9 million to North Port for roughly 89,316 cubic yards of vegetative debris. Source: [FEMA approves $40M for Ian debris removal (PDF)](https://www.fortmyersbeach.org/wp-content/uploads/2023/05/DR-4673-FL-NR096_FEMA-Approves-40-Million-for-Hurricane-Ian-Debris-Removal-in-Fort-Myers-Beach-North-Port.pdf).

**4. Hurricane Sandy (2012) — 15+ million cubic yards; $25.5B recovery.**
FEMA supported removal of more than 15 million cubic yards of debris after Sandy; the New York City area alone handled over two million cubic yards, and the Army Corps cleared 5.25 million cubic yards in New York — described as enough to fill the Empire State Building three times. Source: [FEMA Sandy One-Year Fact Sheet (PDF)](https://news.va.gov/wp-content/uploads/sites/3/2013/10/FEMA-Sandy-One-Year-Fact-Sheet.pdf), [NYC debris disposal release](https://a860-gpp.nyc.gov/downloads/6m311r35q?locale=en), and [US Army Corps — NY debris mission](https://www.nan.usace.army.mil/Media/News-Stories/Story-Article-View/Article/488040/recovery-field-office-completes-mammoth-new-york-debris-removal-mission/).

## The cost of monitoring (why buyers already pay for this)

**5. Miami-Dade — a single $190 million debris-monitoring contract.**
Miami-Dade County recommended awarding a disaster debris removal *monitoring* services contract worth $190,070,000 for an initial five-year term (with a five-year renewal option). That is monitoring alone — not the removal itself — which shows how much governments already spend just to verify that loads are real and correctly counted. Source: [Miami-Dade County agenda item (PDF)](https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf).

**6. Dunedin, FL — ~$600K to monitor one season's cleanup.**
One small city budgeted an estimated $604,615 for contracted debris-monitoring hours for a single hurricane season, against roughly $4+ million in collection costs. Even small jurisdictions carry real monitoring bills. Source: [City of Dunedin agenda cover (PDF)](https://d2kbkoa27fdvtw.cloudfront.net/dunedin/1d89f73d26bf5fa9422ada2d1efa65480.pdf) and [Dunedin — Hurricane Debris Collection Completed](https://www.dunedin.gov/News-articles/2024/Hurricane-Debris-Collection-Completed).

## The failure mode LoadTruth targets: overstated loads and weak oversight

**7. Hurricane Katrina — trucks logged at over 500% of capacity.**
A DHS Inspector General audit of Kenner, Louisiana questioned $5.5 million in Katrina debris costs after finding trucks recorded as more than 95% full — and, per city documents, some loads measured at more than 500% of certified capacity. This is exactly the "estimated fullness" integrity gap LoadTruth is built to catch. Source: [NOLA.com — audit questions $5.5M in Kenner](https://www.nola.com/news/audit-questions-5-5-million-in-katrina-debris-removal-costs-paid-to-kenner-by-fema/article_0b34e794-cfc9-5d5e-95e3-141c0df20869.html) and [DHS OIG DD-09-04 (PDF)](https://www.oig.dhs.gov/sites/default/files/assets/GrantReports/OIG_DD-09-04_Jan09.pdf).

**8. Katrina — fake load slips and bribes for tickets never dumped.**
The Department of Justice prosecuted a conspiracy built on false debris-removal load slips totaling $716,677, and separately charged a subcontractor with bribing a monitor to create false load tickets for debris that was never actually dumped. Load tickets are the fraud surface; verifying them against evidence is the defense. Source: [DOJ — Katrina load-slip fraud sentencing (PDF)](https://www.justice.gov/criminal/disasters/pr/2007/may/05-18-07akitto-sent.pdf) and [DOJ/DoD — false load ticket bribery charge (PDF)](https://media.defense.gov/2005/Dec/06/2001711424/-1/-1/1/katrinafraudrelease5.pdf).

**9. Katrina — a $63B operation flagged for double-billing and inflated loads.**
A U.S. House committee report found contractors overbilled on the Katrina recovery: debris was mixed improperly to inflate prices, the same loads were billed twice, and mileage was overstated in more than half of the sampled trips to collect extra per-cubic-yard haul fees. A top prime, AshBritt, was paid about $23 per cubic yard while subcontractors down the chain were paid a fraction of that. Source: [CBS News — Report: Katrina Cleanup Too Expensive](https://www.cbsnews.com/news/report-katrina-cleanup-too-expensive/).

**10. Hurricane Irma (2017) — ~$1.5B in debris costs with "little to no oversight."**
A DHS OIG management alert warned that after Irma, officials provided little to no oversight of debris contractors, leaving the door open to fraud, with Florida/Georgia debris costs projected near $1.5 billion. The oversight report also noted that when haulers overstate loads or collect unauthorized debris, local governments end up requesting reimbursement for unreasonable or ineligible costs. Source: [DHS OIG-18-85 (PDF)](https://www.oig.dhs.gov/sites/default/files/assets/2018-10/OIG-18-85-Sep18.pdf), [Miami Herald coverage](https://www.miamiherald.com/news/local/community/florida-keys/article219425795.html), and [House Oversight release](https://oversightdemocrats.house.gov/news/press-releases/new-report-exposes-fema-s-inadequate-oversight-of-contractors-after-hurricane).

**11. Detroit (2022) — falsified "dirt tickets" on demolition hauls.**
Beyond hurricanes, a Detroit OIG investigation examined a complaint that a contractor supervisor directed staff to put addresses on load tickets that did not match where trucks actually went — the same ticket-integrity problem in a non-disaster context. Source: [Detroit OIG investigation memo (PDF)](https://detroitmi.gov/sites/detroitmi.localhost/files/2026-02/Memo_RTC%20Investigation_22-0018-INV_27Sept23_THG.pdf).

## What the cases tell us (the pitch)

- **The money is enormous and recurring.** A single season now produces ~107M cubic yards of debris and billions in reimbursement; even a single county's *monitoring* contract runs to $190M.
- **The unit of fraud is the load ticket.** Every documented abuse — 500%-full trucks, double-billed loads, fake slips, mismatched addresses — comes down to a quantity or identity on a ticket that nobody could independently verify.
- **Oversight is the known weak point.** Federal watchdogs repeatedly cite "little to no oversight" and warn that overstated loads turn into ineligible reimbursement requests.
- **LoadTruth's angle:** attach independent video evidence to each ticket, estimate visible fullness, and flag identity/quantity/timeline conflicts for a human reviewer — turning the load ticket from an honor-system claim into an auditable, evidence-backed record.

> Sourcing note: dollar figures and quantities above are paraphrased from government reports (FEMA, DHS OIG, GAO, DOJ), county/city records, and contemporaneous news coverage linked inline. They establish the problem's scale and the recurring overstated-load failure mode; they are not a claim that LoadTruth is FEMA-certified or that any named party's conduct is representative.
