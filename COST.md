# LoadTruth — AI Pipeline Cost & Reasoning Effort Guide

A plain-language guide to how much LoadTruth costs to run, how each pipeline stage is priced, and when to use different AI reasoning effort levels (Low, Medium, High).

---

## 1. Quick Summary

- **Cost per video run:** **~$0.03 to $0.04** (about **3 to 4 cents** per verified ticket).
- **Cost per photo run:** **~$0.01** (about **1 cent** per verified ticket).
- **Repeat / cached runs:** **$0.00** (duplicate clips are recognized instantly and cost nothing).
- **Human inspection comparison:** Manual tower monitors cost **$5.00 to $12.00+ per ticket** with a 15–20% human error rate. LoadTruth cuts cost by over **99%** while providing photographic evidence that stands up to FEMA audits.

---

## 2. Cost Breakdown per Pipeline Run (Video)

Every incoming truck clip runs through 7 stages. Only the stages that call Meta AI models incur cost; all math, rules, and database lookups run locally at zero cost ($0.00).

| Stage | What Happens (Plain English) | Tool / Model | Cost per Run |
| :--- | :--- | :--- | :--- |
| **1. Track & Segment** | Identifies the truck bed, tailgate rim, and debris pile in the video to track movement across frames. | **Meta Muse Spark 1.3**<br>+ **Meta SAM 3.1** | **~$0.025 – $0.030** |
| **2. Read Placard** | Reads the certified truck ID number printed on the vehicle's side or tailgate. | **Meta Muse Spark 1.3** | **~$0.002** *(0.2¢)* |
| **3. Capacity Lookup** | Matches the truck ID against the official county hauler registry to get certified bed volume. | **County Database** *(Local)* | **$0.00** *(Free)* |
| **4. Measure Fill** | Computes how full the truck is (e.g. 65%) by checking debris height against the truck bed rim. | **Geometry Math** *(Local)* | **$0.00** *(Free)* |
| **5. Classify Debris** | Determines debris category (Trees/Vegetative, Construction, Appliances, or Hazardous). | **Meta Muse Spark 1.3** | **~$0.003** *(0.3¢)* |
| **6. Flag Anomalies** | Checks for issues (truck overfilled past safety limits, mismatched placards, waterlogged loads). | **Rules Engine** *(Local)* | **$0.00** *(Free)*<br>*(~$0.0005 if explanation needed)* |
| **7. Value the Load** | Multiplies certified volume × fill % × contract rate to compute exact dollar payout. | **Audit Math** *(Local)* | **$0.00** *(Free)* |
| **TOTAL** | **Full end-to-end verification and receipt** | **All 7 Stages** | **~$0.03 – $0.04** |

---

## 3. Reasoning Effort Guide (Low, Medium, High)

### What is Reasoning Effort?
Reasoning effort controls **how long the AI "thinks" through details before giving an answer**. 
- **Higher effort** gives the AI more time to double-check complex clues, which is useful when videos are blurry or debris is mixed together.
- **Lower effort** provides quick, straightforward answers for simple tasks, saving time and money.

### Comparison Table

| Effort Level | What It Does | Best When... | Typical Pipeline Task | Speed & Cost Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Low** *(Minimal / Low)* | Reads information directly with no second-guessing. Direct visual reading. | • Daylight videos with clear views.<br>• Clean, readable placards.<br>• Routine truck arrivals. | • **Reading Placards (OCR)**<br>• **Naming obvious loads** (e.g., tree branches)<br>• **Short flag notes** | **Fastest & Cheapest**<br>• ~1 second response<br>• Uses the fewest tokens |
| **Medium** *(Balanced)*<br>*(Recommended Default)* | Looks at visual evidence and cross-checks context before deciding. | • Standard daily field operations.<br>• Normal weather or light dust.<br>• Routine debris mix. | • **Debris Classification**<br>• **Standard Pipeline Analysis**<br>• **Auditor Q&A Chat** | **Balanced**<br>• 2–3 second response<br>• Optimal accuracy-to-cost ratio |
| **High** *(High / Max)* | Explores edge cases, checks for contradictions, and reasons through conflicting visual cues. | • Heavy rain, night lighting, or dusty cameras.<br>• Dirty, dented, or partially hidden placards.<br>• Contested audit tickets or contractor appeals. | • **Contested Audits**<br>• **Hard Analyst Questions**<br>• **Heavily Mixed Debris** | **Most Thorough**<br>• 4–8 second response<br>• Costs ~2× more tokens (still < $0.01 per call) |

---

## 4. Real-World Scenarios: When to Change Effort

### Scenario A: High-Volume Intake on Clear Days
- **Situation:** Daytime at the landfill; hundreds of trucks arriving per hour carrying clean, separated tree debris from road clearing.
- **Recommended Effort:** **Low**
- **Why:** The truck numbers are clean and easily readable; debris is clearly vegetative branches. Running at Low effort ensures maximum throughput and minimum latency while keeping cost under 3¢ per truck.

### Scenario B: Standard Daily Field Operations *(Default)*
- **Situation:** Standard disaster recovery operations across multiple debris sites with varying truck body styles.
- **Recommended Effort:** **Medium (Balanced)**
- **Why:** Reliably handles slight camera angles, partial shade, and mixed loads without needing manual adjustments.

### Scenario C: Stormy Conditions, Night Ops, or Disputed Tickets
- **Situation:** A contractor is appealing a rejected ticket, or camera footage was recorded in rain or dusk with mud splattered across the truck's certification placard.
- **Recommended Effort:** **High**
- **Why:** The AI spends extra reasoning tokens examining subtle edge markings, screw placements, and shape outlines to confirm the exact truck identity and separate debris from shadows. Even at High effort, the call costs only a fraction of a cent more.

---

## 5. Cost Modes: Standard vs. Contributor

In Admin Settings (`/admin`), you can choose between two billing modes:

| Mode | Token Discount | Data Policy | Recommended Use |
| :--- | :--- | :--- | :--- |
| **Standard Mode** *(Default)* | Published API rates | Completely private; never used for model training. | Production county deployments and official FEMA reimbursement submissions. |
| **Contributor Mode** | **Up to 90% discount** | Inputs/outputs may help train future models. | Staging, practice drills, volunteer training, and hackathons. |

---

## 6. How LoadTruth Compares to Alternatives

| Solution | Cost per Load | Accuracy & Audit Trail | Setup Time | Equipment Needed |
| :--- | :--- | :--- | :--- | :--- |
| **Manual Human Monitor** | **$5.00 – $12.00+** | Subjective visual guess (15–20% error rate). No digital evidence. | Days (hire and train monitors). | Scaffold towers, clipboards, safety gear. |
| **Laser Gantry Scanner** | **$1.50 – $3.00** | Good 3D volume, but cannot classify debris type or read small placards. | Weeks to months. | $50,000+ fixed overhead gantry frame & concrete pad. |
| **LoadTruth AI** | **~$0.03** | **Exact SAM segmentation mask + OCR verification + photo receipt**. | **< 1 hour**. | Standard smartphone or existing security camera. |

