"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";

const TOPICS = [
  ["start", "Start here"],
  ["demo", "Review a demo"],
  ["upload", "Upload your own footage"],
  ["review", "Review a ticket"],
  ["values", "Understand the numbers"],
  ["screens", "Screens & tools"],
  ["analysis", "How the analysis works"],
  ["flags", "Understand flags"],
  ["roles", "Your role & permissions"],
  ["glossary", "Glossary"],
  ["shortcuts", "Keyboard shortcuts"],
  ["help", "If something looks wrong"],
] as const;

const SCREENS = [
  [
    "Overview",
    "/",
    "See ticket totals, review progress, load value, and tickets that need attention.",
  ],
  [
    "Review queue",
    "/console",
    "Watch a ticket’s footage, check its details, and record a decision.",
  ],
  ["Add footage", "/add", "Upload a video or image for analysis in an event that allows changes."],
  [
    "Video library",
    "/demos",
    "Browse demo clips, play the original, view AI outlines, and open the related ticket.",
  ],
  [
    "AI Processing",
    "/pipeline",
    "See recent analysis runs and open each step’s result, model, and processing time.",
  ],
  [
    "AI Analyst",
    "/assistant",
    "Ask questions about the selected event in plain language. Check the supporting records before acting on an answer.",
  ],
  [
    "All tickets",
    "/tickets",
    "Browse and filter the event’s ticket records, including tickets already reviewed.",
  ],
  [
    "Trucks",
    "/trucks",
    "Look up or manage truck IDs and their registered carrying capacity, if your role allows it.",
  ],
  [
    "Reports",
    "/reports",
    "Review totals and breakdowns by status, material, and flag level. Export records as CSV or an audit packet.",
  ],
  [
    "Billing",
    "/billing",
    "Review load values and the event’s billing records and available exports.",
  ],
  [
    "Settings",
    "/admin",
    "Manage events, prices, connected footage sources, members, and AI settings. Available controls depend on your role.",
  ],
] as const;

const TERMS = [
  [
    "Event",
    "A cleanup operation that groups its trucks, prices, footage, and tickets. Choose the event in the top bar.",
  ],
  [
    "Ticket",
    "The record for one load: truck, footage, estimated fill, material, value, flags, and review status.",
  ],
  [
    "Fill percentage",
    "How full the truck bed appears, from 0% (empty) to 100% (full to its rails). It is an estimate from the footage.",
  ],
  [
    "Certified capacity",
    "The truck’s registered bed volume. This comes from the truck registry, not from the video.",
  ],
  [
    "CY / cubic yard",
    "A unit of volume. Truck capacity and load volume are measured in cubic yards.",
  ],
  [
    "Load volume",
    "Truck capacity multiplied by estimated fill. A 20-cubic-yard truck at 50% fill carries an estimated 10 cubic yards.",
  ],
  ["Rate / unit price", "The event’s price for one cubic yard of a particular material."],
  [
    "Inspector call / monitor call",
    "The on-site person’s estimate of how full the truck is. You can enter it to compare with the video estimate.",
  ],
  [
    "Difference / delta",
    "The value based on the inspector’s estimate minus the value based on the AI estimate. It can be positive or negative.",
  ],
  [
    "Over-call / under-call",
    "An inspector estimate above / below the AI estimate. These describe a comparison, not a final review decision.",
  ],
  [
    "Flagged exposure",
    "The total positive dollar differences on tickets with an over-call. It highlights amounts to review.",
  ],
  [
    "Percentage points (pp)",
    "The difference between two percentages. The gap between 80% and 62% is 18 percentage points.",
  ],
  [
    "SAM",
    "The Meta model that follows the truck and draws outlines around the bed and load. It does not calculate fill percentage.",
  ],
  [
    "Muse Spark",
    "The Meta model that reads the truck ID, identifies the material, and estimates fill from sampled video frames.",
  ],
  [
    "Mask / outline / segmentation",
    "The colored shapes drawn over a video to highlight objects. They are a visual aid for review.",
  ],
  [
    "Frame",
    "One still image from a video. The analysis checks multiple frames rather than relying on a single picture.",
  ],
  [
    "Confidence",
    "A model’s reported certainty about a result, such as a truck ID. A 95% confidence label is not a 95% fill estimate.",
  ],
  ["Placard", "The identifying number painted or displayed on the truck."],
  [
    "Truck registry",
    "The list of known trucks and their registered capacities and certification details.",
  ],
  [
    "Material / debris class",
    "The type of load used to select a price. C&D means construction and demolition debris; white goods means appliances. Other categories include vegetation, hazardous material, and other.",
  ],
  [
    "Flag / anomaly",
    "A reason to inspect a ticket more closely, such as an unreadable truck ID or a possible duplicate load.",
  ],
  ["Read only", "You can inspect the records, but the event or your role does not allow changes."],
  [
    "Cached / reused result",
    "A saved analysis result shown again instead of running the same analysis from scratch. A new or forced analysis may use paid model calls.",
  ],
  [
    "Recalculate saved estimate",
    "Check the saved calculation using stored evidence and inputs, without making a new AI call.",
  ],
  [
    "FEMA",
    "The US Federal Emergency Management Agency. Cleanup records and audit exports can support disaster-debris record review.",
  ],
] as const;

export default function GuidePage() {
  return (
    <AppShell section="Guide" fluid>
      <div className="lt-scroll min-h-0 flex-1 overflow-y-auto pb-8">
        <header className="mb-7 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">Using LoadTruth</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Turn footage of a truckload into a ticket, then check the estimate before recording a
            decision. New here? Start with a demo.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <a
              href="#demo"
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground"
            >
              Review a demo
              <ArrowRightIcon className="size-4" />
            </a>
            <a
              href="#glossary"
              className="min-h-10 content-center text-[var(--color-brand)] underline-offset-4 hover:underline"
            >
              Look up a term
            </a>
          </div>
        </header>

        <details className="mb-6 rounded-lg border border-border bg-card px-4 lg:hidden">
          <summary className="cursor-pointer py-3 text-sm font-medium">On this page</summary>
          <Contents mobile />
        </details>

        <div className="grid items-start gap-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-12">
          <aside
            className="sticky top-0 hidden max-h-[calc(100dvh-10rem)] overflow-y-auto pr-2 lg:block"
            aria-label="Guide contents"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              On this page
            </p>
            <Contents />
          </aside>

          <article className="min-w-0 max-w-[880px] space-y-9 text-sm leading-7">
            <GuideSection id="start" title="1. Start here">
              <Steps
                items={[
                  <>
                    <strong>Choose an event</strong> in the top bar. The name and location tell you
                    which cleanup operation you are viewing.
                  </>,
                  <>
                    <strong>Check the tags.</strong> A benchmark or processed tag describes the
                    sample data. <strong>Read only</strong> means that event is for viewing, not
                    editing.
                  </>,
                  <>
                    <strong>Choose what you want to do:</strong> explore sample footage in{" "}
                    <Screen href="/demos">Video library</Screen>, check an existing load in{" "}
                    <Screen href="/console">Review queue</Screen>, or analyze a new clip in{" "}
                    <Screen href="/add">Add footage</Screen>.
                  </>,
                ]}
              />
              <p>
                Your account role controls which actions are available. If you can view a record but
                cannot change it, check both your role and the event’s Read only tag.
              </p>
            </GuideSection>

            <GuideSection id="demo" title="2. Review a demo">
              <Steps
                items={[
                  <>
                    For the packaged demo, choose the event tagged{" "}
                    <strong>50-video benchmark</strong> in the top bar. Open{" "}
                    <Screen href="/demos">Video library</Screen> and select{" "}
                    <strong>Latest batch</strong>. Pick a clip from the list, or use the clip
                    selector on a phone. Search by clip number, truck ID, or material.
                  </>,
                  <>
                    Press <strong>Play</strong> to watch the original footage. Use the timeline to
                    move to a specific moment. <strong>Replay</strong> starts the clip again from
                    the beginning.
                  </>,
                  <>
                    Select <strong>With masks</strong> to see AI outlines. Select{" "}
                    <strong>Compare</strong> to play the original and outlined versions together.
                    Bed, Load, and Truck body controls show or hide each layer.
                  </>,
                  <>
                    Check the estimated fill, material, and load value. If the truck capacity is
                    missing, the value cannot be fully calculated.
                  </>,
                  <>
                    Select <strong>Review ticket</strong> to open that load in the review console.
                    Inspect <strong>Load & pricing details</strong>, the footage, and{" "}
                    <strong>Analysis & checks</strong>.
                  </>,
                  <>
                    You can explore a read-only demo without submitting a decision. To practice
                    uploading or saving decisions, use an event and role that allow changes.
                  </>,
                ]}
              />
              <p>
                <strong>Clips without a result:</strong> Unprocessed means the clip has not been
                analyzed. Result pending means a completed result has not been saved. No truck
                detected means the recorded run did not create a load ticket. You can still watch
                the original footage.
              </p>
            </GuideSection>

            <GuideSection id="upload" title="3. Upload your own footage">
              <Steps
                items={[
                  <>
                    Sign in through Administrator login and select the Live Demonstration event.
                    Open <Screen href="/add">Add footage</Screen>.
                  </>,
                  <>
                    Choose a video or image showing the loaded truck bed. Follow the file types and
                    size limit displayed on the upload screen.
                  </>,
                  <>
                    Start the analysis and wait for the run to finish.{" "}
                    <Screen href="/pipeline">AI Processing</Screen> shows recent runs and their
                    results.
                  </>,
                  <>
                    If a truckload is detected, open the resulting ticket. Check its truck ID,
                    material, capacity, and fill estimate before recording a decision.
                  </>,
                ]}
              />
              <p>
                <strong>Administrators:</strong> select{" "}
                <strong>Run fresh analysis (bypass cache)</strong> before choosing the file if you
                want new AI results. It is off by default, takes longer, and may add model usage
                charges. File and storage validation still run.
              </p>
              <p>
                <strong>Keep footage for later replay</strong> is on by default. Turn it off to skip
                permanent footage storage. The ticket and analysis still save to the database;
                footage stays in server memory for up to seven days and may expire earlier on
                restart or when memory is full. An expired video cannot be replayed, but its ticket
                remains.
              </p>
              <p>
                <strong>Practice without AI credits:</strong> everyone can open the Practice
                Playground, choose a saved video result on Add footage, and create a separate
                practice ticket. Review it, edit it, or reset the practice review to try again. The
                two Read only events preserve their original records. The Live Demonstration event
                is visible to everyone; only the Administrator login can change it or run AI.
              </p>
            </GuideSection>

            <GuideSection id="review" title="4. Review a ticket">
              <Steps
                items={[
                  <>
                    Open <Screen href="/console">Review queue</Screen> and select a truck or ticket.
                    Search covers tickets in the selected event and status. Use{" "}
                    <strong>Filter</strong> to change the status or sorting.
                  </>,
                  <>
                    <strong>Watch the footage.</strong> Compare the visible load with the estimated
                    fill. Pause, seek, or use Full screen. Select <strong>Show outlines</strong> if
                    you want the colored visual aid.
                  </>,
                  <>
                    <strong>Check Load & pricing details.</strong> Verify the truck ID, material,
                    truck capacity, and price. If your role allows editing, use the editable fields
                    to correct the truck or material; the related value is recalculated.
                  </>,
                  <>
                    <strong>Check issues and analysis.</strong> Review any flags before confirming.
                    Select a step in Analysis details, or use View steps, to see its result and
                    supporting information. Check saved calculation recalculates the stored estimate
                    without a new AI call.
                  </>,
                  <>
                    <strong>Add an inspector fill call if you have one.</strong> This is optional.
                    Enter the on-site estimate and save it separately. Save or clear unsaved input
                    before recording a decision.
                  </>,
                  <>
                    <strong>Record a decision</strong> using the choices below, then select another
                    ticket from the queue. Changes are available only when the event and your role
                    permit them.
                  </>,
                ]}
              />
              <ReferenceTable
                label="Ticket decisions"
                headers={["Action", "When to use it"]}
                rows={[
                  [
                    "Confirm estimate",
                    "The footage and ticket details support the estimate. Confirm in the dialog to save the decision.",
                  ],
                  [
                    "Other decisions → Override ticket",
                    "Mark the ticket as manually overridden after review. Enter a reason when prompted. This status change does not itself enter a replacement fill percentage.",
                  ],
                  [
                    "Other decisions → Dispute ticket",
                    "The ticket needs resolution, for example because the evidence or load details are in question. Enter a reason when prompted.",
                  ],
                ]}
              />
              <p>
                A ticket with an existing decision can show a warning that another decision will
                replace it. Read the confirmation dialog before continuing.
              </p>
            </GuideSection>

            <GuideSection id="values" title="5. Understand the numbers">
              <p>
                Load value comes from the truck’s registered capacity, the estimated fill, and the
                event’s price for that material.
              </p>
              <div className="rounded-lg border border-border bg-card px-5 py-4 font-medium leading-7">
                <p>Truck capacity × fill percentage = estimated load volume</p>
                <p>Estimated load volume × price per cubic yard = estimated load value</p>
              </div>
              <p>
                <strong>Example:</strong> A 25-cubic-yard truck at 48% fill contains an estimated 12
                cubic yards. At $8.50 per cubic yard, its estimated value is{" "}
                <strong>$102.00</strong>.
              </p>
              <p>
                If the inspector calls that same load 90% full, their estimate is 22.5 cubic yards,
                worth $191.25. The difference is <strong>+$89.25</strong>: inspector value minus
                AI-estimated value.
              </p>
              <ReferenceTable
                label="Comparing inspector and AI estimates"
                headers={["Number", "What it means"]}
                rows={[
                  [
                    "Positive difference / over-call",
                    "The inspector’s estimate is higher than the AI estimate. Review the amount; the comparison is not a final decision.",
                  ],
                  [
                    "Negative difference / under-call",
                    "The inspector’s estimate is lower than the AI estimate.",
                  ],
                  [
                    "No inspector estimate",
                    "There is no human estimate to compare yet. This is not the same as a zero difference.",
                  ],
                  [
                    "Flagged exposure",
                    "The sum of positive dollar differences on over-called tickets.",
                  ],
                  [
                    "Agreement with monitor",
                    "The share of compared tickets whose AI fill estimate is within 10 percentage points of the inspector’s estimate. This measures agreement, not accuracy against a known load volume.",
                  ],
                ]}
              />
            </GuideSection>

            <GuideSection id="screens" title="6. Screens & tools">
              <dl className="divide-y divide-border">
                {SCREENS.map(([name, href, description]) => (
                  <div
                    key={href}
                    className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[145px_minmax(0,1fr)] sm:gap-5"
                  >
                    <dt className="font-medium">
                      <Screen href={href}>{name}</Screen>
                    </dt>
                    <dd className="text-muted-foreground">{description}</dd>
                  </div>
                ))}
              </dl>
            </GuideSection>

            <GuideSection id="analysis" title="7. How the analysis works">
              <p>
                Analysis details and AI Processing show these seven steps. Select a step to see its
                result, reported confidence, model, and time taken.
              </p>
              <Steps
                items={[
                  <>
                    <strong>Outline truck and load.</strong> SAM follows the truck and draws
                    outlines around the bed and debris across video frames.
                  </>,
                  <>
                    <strong>Read truck ID.</strong> Muse Spark reads the number shown on the truck.
                    An unclear reading needs a person to check it.
                  </>,
                  <>
                    <strong>Find truck capacity.</strong> The truck ID is matched to the registry to
                    find its certified bed volume.
                  </>,
                  <>
                    <strong>Estimate fill level.</strong> Muse Spark estimates how full the bed
                    looks in sampled frames. The system uses the middle estimate when the frame
                    estimates are sorted.
                  </>,
                  <>
                    <strong>Identify load material.</strong> Muse Spark classifies the debris so the
                    correct event price can be selected.
                  </>,
                  <>
                    <strong>Check for issues.</strong> Rules look for identity, certification,
                    capacity, and trip-timing problems.
                  </>,
                  <>
                    <strong>Calculate load value.</strong> The system multiplies the registered
                    capacity, fill percentage, and price. If an inspector estimate is available, it
                    also calculates the difference.
                  </>,
                ]}
              />
              <p>
                <strong>Outlines and fill are separate.</strong> SAM’s colored masks help you
                inspect the footage. They do not calculate the fill percentage. Capacity comes from
                records; prices come from the event; volume and value use those numbers in a
                calculation.
              </p>
            </GuideSection>

            <GuideSection id="flags" title="8. Understand flags">
              <p>
                A flag asks you to look closer; it is not a review decision. Automatic checks cover
                the issues below. You still need to judge the visible load yourself—fill quality is
                not automatically flagged.
              </p>
              <ReferenceTable
                label="Flags and what to check"
                headers={["Flag", "What to check"]}
                rows={[
                  [
                    "High · Uncertified truck",
                    "The truck has no active certification in the registry. Verify its ID and certification before approving.",
                  ],
                  [
                    "High · Capacity exceeded",
                    "The estimated load is above the registered capacity. Check for an overfilled bed, a wrong truck ID, or incorrect capacity.",
                  ],
                  [
                    "High · Impossible cycle",
                    "The same truck appears to have recorded two loads too close together for a round trip. Check for duplicate records or a wrong ID.",
                  ],
                  [
                    "Warning · Placard unreadable",
                    "The truck number could not be read confidently. Inspect the footage and identify the truck manually.",
                  ],
                ]}
              />
            </GuideSection>

            <GuideSection id="roles" title="9. Your role & permissions">
              <p>
                Your role is shown below your name in the sidebar. It controls available actions. An
                event marked Read only can restrict changes even when your role normally allows
                them.
              </p>
              <ReferenceTable
                label="Account roles"
                headers={["Role", "Available work"]}
                rows={[
                  [
                    "Field Monitor",
                    "Review tickets, record inspector estimates, and confirm, override, or dispute tickets where changes are allowed. Use saved examples in the Practice Playground.",
                  ],
                  [
                    "Auditor",
                    "View records and export CSV files and audit packets. Cannot change tickets or settings.",
                  ],
                  [
                    "Supervisor",
                    "Review like a monitor and manage the truck registry where permitted. New AI uploads require Administrator login.",
                  ],
                  [
                    "County Admin",
                    "Manage review work, events, prices, sources, and members within the account’s allowed permissions.",
                  ],
                  ["System Owner", "Manage the full workspace, members, events, and demo uploads."],
                ]}
              />
            </GuideSection>

            <GuideSection id="glossary" title="10. Glossary">
              <dl className="divide-y divide-border">
                {[...TERMS]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([term, definition]) => (
                    <div key={term} className="py-3 first:pt-0">
                      <dt className="font-semibold">{term}</dt>
                      <dd className="mt-1 text-muted-foreground">{definition}</dd>
                    </div>
                  ))}
              </dl>
            </GuideSection>

            <GuideSection id="shortcuts" title="11. Keyboard shortcuts">
              <ReferenceTable
                label="Keyboard shortcuts"
                headers={["Keys", "Action"]}
                rows={[
                  [
                    <Key key="jk">J / K</Key>,
                    "Move to the next / previous ticket in the review queue.",
                  ],
                  [
                    <Key key="arrows">↓ / ↑</Key>,
                    "Move through the review queue, or through the focused footage list.",
                  ],
                  [<Key key="search">/</Key>, "Focus the review queue search."],
                  [
                    <Key key="confirm">C</Key>,
                    "Open the confirmation dialog for the selected ticket.",
                  ],
                  [<Key key="override">O</Key>, "Open the override dialog."],
                  [<Key key="dispute">D</Key>, "Open the dispute dialog."],
                  [<Key key="palette">⌘K / Ctrl+K</Key>, "Open workspace search and navigation."],
                  [<Key key="escape">Esc</Key>, "Close the current dialog or expanded video view."],
                ]}
              />
              <p>
                Review shortcuts do not run while you are typing in a field or while a dialog is
                open.
              </p>
            </GuideSection>

            <GuideSection id="help" title="12. If something looks wrong">
              <dl className="space-y-4">
                <Help
                  question="The video will not play"
                  answer="Try Play or Replay. If a loading error appears, use Retry footage. In Video library, switch to Original to inspect the footage without waiting for outlines."
                />
                <Help
                  question="There are no colored outlines"
                  answer="Use Show outlines in review, or With masks in Video library. Some frames or clips have no saved masks. Missing masks do not mean the fill estimate is zero."
                />
                <Help
                  question="The truck capacity or value is missing"
                  answer="Check the truck ID and its registry entry. A fill percentage alone is not enough to calculate load volume and value."
                />
                <Help
                  question="I cannot upload or save a decision"
                  answer="Check the event’s Read only tag and your account role. Ask your workspace administrator if you need different access."
                />
                <Help
                  question="Confirm estimate is disabled after I entered a number"
                  answer="Save or clear the inspector estimate first. Use a percentage between 0 and 100."
                />
                <Help
                  question="The result does not match what I see"
                  answer="Inspect several moments in the original video, check the truck and material, and review flags and analysis steps. Use the appropriate override or dispute action if changes are allowed."
                />
              </dl>
            </GuideSection>
          </article>
        </div>
      </div>
    </AppShell>
  );
}

function Contents({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav aria-label={mobile ? "Guide topics" : "On this page"} className="flex flex-col gap-1 pb-3">
      {TOPICS.map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={
            mobile ? (e) => e.currentTarget.closest("details")?.removeAttribute("open") : undefined
          }
          className="rounded-md px-2 py-1.5 text-[13px] leading-5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
function GuideSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-4 space-y-4 border-b border-border pb-8 last:border-0"
    >
      <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-[var(--brand)]">
      {items.map((item, index) => (
        <li key={index} className="pl-1">
          {item}
        </li>
      ))}
    </ol>
  );
}
function Screen({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-[var(--color-brand)] underline decoration-current/40 underline-offset-4 hover:decoration-current"
    >
      {children}
    </Link>
  );
}
function ReferenceTable({
  label,
  headers,
  rows,
}: {
  label: string;
  headers: [string, string];
  rows: [ReactNode, ReactNode][];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table aria-label={label} className="w-full table-fixed text-left text-sm leading-6">
        <thead className="bg-secondary/60">
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={
                  index === 0
                    ? "w-[34%] px-4 py-3 font-semibold sm:w-[30%]"
                    : "px-4 py-3 font-semibold"
                }
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([name, description], index) => (
            <tr key={index}>
              <th scope="row" className="break-words px-4 py-3 align-top font-medium">
                {name}
              </th>
              <td className="break-words px-4 py-3 align-top text-muted-foreground">
                {description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}
function Help({ question, answer }: { question: string; answer: string }) {
  return (
    <div>
      <dt className="font-semibold">{question}</dt>
      <dd className="mt-1 text-muted-foreground">{answer}</dd>
    </div>
  );
}
