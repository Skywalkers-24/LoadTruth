# Meta Global AI Developer Hackathon: Event Notes

These are my working notes on the event, the application, the waiver and the judging criteria, summarized from the event page. This is **not legal advice**. Read the full waiver and the Official Rules (published before Oct 26) before agreeing.

- Event page: https://cerebralvalley.ai/e/meta-ai-developer-hackathon
- Apply: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/apply
- Submit project: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit
- Our project: [README.md](./README.md) (LoadTruth)

---

## Key dates (ET)

| Date | Milestone |
|---|---|
| Oct 13, 9:00 AM | Applications open (rolling review) |
| **Oct 25, 11:59 PM** | **Application deadline**, or earlier if all 20,000 spots fill |
| Oct 26, 9:00 AM | Approval notifications |
| Oct 26 | Kickoff livestream |
| Oct 26 – Nov 4 | Workshops and Discord office hours |
| **Nov 4, 9:00 PM** | **Project submission deadline** |
| Nov 4 – Nov 8 | Judging |
| Nov 9 | Closing ceremony and winners |
| ~Nov 10 | Bonus/public-vote prizes announced |

## What we get

- Access to Meta AI products: Muse Spark, Glimmer, SAM 3 / 3.1, plus anything else listed on the event page.
- **$150 in Meta Model API credits** for the 10-day build.
- Partner credits for select participants: Baseten ($100), Modal ($100), Fireworks ($25).
- Virtual participation only.

## Tracks and prizes

You can pick one track only, and a project can be entered in one track only.

| | Indie Developer | Startup |
|---|---|---|
| Who | Individuals and students, **teams of up to 4** | Technical founders building a product |
| 1st | $150,000 | $250,000 |
| 2nd | $100,000 | $150,000 |
| 3rd | $75,000 | $75,000 |
| 4th | $50,000 | $50,000 |
| 5th | $25,000 | $25,000 |
| Total | $400,000 | $550,000 |

Up to $50,000 more goes to bonus prizes (community vote, most viral, etc.). The total pool is $1M.

**Our choice: Indie Developer track.**

## Project themes

1. **Build for Your World:** solve a problem you know firsthand in your own domain.
2. **Push the Frontier:** software, robotics, manufacturing, energy, materials; give a machine a new capability, or understand and control a physical system. **LoadTruth fits this theme.**

---

## How applications are scored

Reviewers score only what's on the form. Two criteria, weighted equally:

1. **Project idea (50%):** is it clear and feasible, and does it fit a theme?
2. **Technical skill (50%):** what you built in a recent AI project and the techniques you used. GitHub, LinkedIn or a shipped product help verify this but aren't required.

Applications above the score cut-off are accepted automatically, up to 20,000 spots. Questions 13–16 (Meta API usage and opinion, how you heard about the event) **don't affect selection**.

## Application checklist

- [ ] LinkedIn URL *(required)*
- [ ] Twitter/X *(optional)*
- [ ] GitHub URL, with 2–3 AI repos pinned
- [ ] City, State, Country *(required)*
- [ ] Track: **Indie Developer**
- [ ] "What do you want to build?" Use the LoadTruth answer below.
- [ ] "Recent AI project": must be real work (see the template below)
- [ ] Used Meta Model API before? *(answer honestly)*
- [ ] Likelihood to build with it: Very likely
- [ ] Opinion of Meta Model API *(answer honestly)*
- [ ] How you heard about it *(answer honestly)*
- [ ] Marketing email consent *(personal choice, doesn't affect selection)*
- [ ] Read and accept the Event Waiver

### Answer: "What do you want to build?"

> LoadTruth turns video into verified load tickets for hauling paid by the cubic yard, starting with disaster-debris removal. Today, after a hurricane, a monitor in a tower eyeballs each dump truck's fill percentage, and that guess decides federal payments. It's subjective, prone to fraud (DOJ has prosecuted fake load slips), and audited years later. Miami-Dade alone just signed a $190M debris-monitoring contract.
>
> I'll use SAM 3.1 on Meta Model API to track each truck through the frames and segment its bed and load. Muse Spark will read the truck's ID placard, look up its certified capacity, classify the debris (vegetative, construction and demolition, white goods), and flag anomalies such as duplicate trucks, impossible cycle times or hollow loads. The output is a FEMA-format load ticket with evidence frames, which the human monitor confirms or overrides. A phone or pole camera replaces $50K+ laser gantries, so it can be set up at a temporary disposal site in hours.
>
> My 10-day goal is a working video-to-ticket pipeline, benchmarked against careful human measurement on 50+ real clips. Theme: Push the Frontier.

### Answer: "Recent AI project" (Holdfast; fill in the [brackets] and confirm every claim is true)

> I built **Holdfast** [link], a GitLab-native supply-chain security gate that asks a different question than vulnerability scanners: not "does this dependency have a CVE?" but "is this still the package and publisher my team trusted?" A hijacked package can have zero CVEs, so the threat is the change in custody.
>
> **How it works:** A deterministic custody check runs in GitLab CI against a committed trust ledger and covers 8 package ecosystems. When a dependency's custody changes (e.g., a takeover that adds a hidden install script), the release is blocked. No AI makes that call. Then six GitLab Duo agents (review, security, test, fixer, evidence, readiness) investigate, revert to the last trusted version, write an evidence report and re-run the pipeline. Agents can't merge or edit the trust ledger. Only a human approves.
>
> **Key design choice:** AI operates only after a deterministic security boundary, so a model mistake can't redefine trust.
>
> **Stack:** [languages, GitLab CI, Duo agent flows, hosting]. **Results:** [e.g., detects/remediates simulated takeover in N min; X ecosystems; hackathon placement].

### Template: "Recent AI project" (backup)

> **What it was:** I built [project], which [does X for Y / solves Z]. [Link]
> **Techniques:** [models used]; [RAG / agents / CV pipeline / etc.]; [how hard parts were handled: evals, latency, structured output].
> **Stack:** [languages, frameworks, infra, deployment].
> **Results:** [a real metric: accuracy, latency, users, cost, hours saved].
> **What I learned:** [one technical tradeoff].

Candidates: BrowerImgConverer, pdfconverter, Holdfast. *(Details needed.)*

---

## Waiver: clauses worth knowing

| Clause | What it means for us |
|---|---|
| **Accuracy of information** | Every field must be true. False or incomplete information means disqualification, so nothing on the form can be made up. |
| **Eligibility** | 18+ and the age of majority where you live. Not in a sanctioned country or region. Not an employee, contractor or intern of Meta or Cerebral Valley. **Not "government-affiliated"**, which also covers immediate family and anyone in your household. The term isn't defined, so check if this might apply to you. |
| **Materials are non-confidential** | Ideas, pitches and code you share during the event aren't confidential. Organizers get a perpetual, irrevocable, royalty-free license to use them. **Don't share anything you want to keep secret** (customer names, pricing, private data sources). |
| **Submission IP** | You keep ownership. Organizers get a perpetual, **non-exclusive** license to use, modify and publicize the submission. |
| **Original work** | The submission must be your own work. Open source is allowed if you follow its license and build meaningfully on top of it. Contracted help is allowed if you own the result. |
| **Recording consent** | Your name, likeness, voice, chat messages and screen shares can be used in promotion forever, without pay. |
| **Data sharing** | Your name and email may be shared with sponsors for marketing, separately from the Meta email opt-in. |
| **Release and indemnity** | You waive most claims against the organizers (except gross negligence and willful misconduct) and indemnify them for third-party claims arising from your conduct. California law applies, with courts in San Francisco. |
| **Prizes and taxes** | Paid only after eligibility checks. Winners pay their own taxes and fees and may need a W-9 or W-8BEN. |
| **Conduct** | Professional and respectful behavior in all event spaces. Organizers can remove anyone at their discretion. |
| **Changes** | Organizers can change the terms or the event at any time. The Official Rules must be accepted separately. |

---

## Project judging criteria (applies to the submission, not the application)

| Criterion | Weight | How LoadTruth covers it |
|---|---|---|
| **Impact** | 30% | Federal debris spending, documented load-ticket fraud, clear paying buyers (monitoring firms, counties) |
| **Use of Meta AI tooling** | 25% | Go beyond a basic integration: SAM 3.1 multi-object video tracking and segmentation, combined with Muse Spark reasoning over video and documents. Look for unexpected capabilities (e.g., Glimmer). |
| **Technical depth & execution** | 20% | A sound pipeline, an accuracy benchmark against careful human measurement, and anomaly detection |
| **Demo** | 25% | Works live: a truck clip becomes a verified ticket with evidence frames, and a dispute is resolved in one click. Plus a polished demo video. |

## Build constraints

- **Budget:** $150 in credits. Sample video at 2–4 fps, cache SAM results, and only send Muse Spark the keyframes it needs.
- **Time:** 10 days, Oct 26 – Nov 4 at 9:00 PM ET.
- **Repo:** assume anything pushed publicly is visible to everyone.
- **TODO:** look into Glimmer once accepted.
