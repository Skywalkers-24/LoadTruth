"use client";

import {
  CameraIcon,
  CircleDollarSignIcon,
  ClipboardCheckIcon,
  GaugeIcon,
  KeyboardIcon,
  ScanEyeIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
  TruckIcon,
} from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/shadcn/card";

/**
 * Guide: a practical reference for operating LoadTruth — what each screen is
 * for, how the measurement and money math work, how to review a ticket, what
 * each role can do, and the terms used across the app. Written to be read, not
 * skimmed: concrete steps and real numbers, no filler.
 */
export default function GuidePage() {
  return (
    <AppShell section="Guide">
      <div className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <header className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold tracking-tight">Operating LoadTruth</h1>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              LoadTruth turns footage of a loaded truck into a defensible payment record. It measures
              the load from the evidence, compares it against the monitor&apos;s call, and produces a
              ticket an auditor can trust. This guide covers the workflow end to end, what each role
              can do, and how to read every number on screen.
            </p>
          </header>

          {/* ── How a load becomes a ticket ─────────────────────────────── */}
          <SectionHeading>How a load becomes a ticket</SectionHeading>
          <div className="grid gap-4 md:grid-cols-3">
            <Step
              n={1}
              icon={<CameraIcon className="size-5" />}
              title="Capture evidence"
              body="A clip or image of the loaded bed is captured — uploaded on New Ticket, or pulled from a connected source. Each capture is content-hashed so re-running it is free and never double-charges the AI."
            />
            <Step
              n={2}
              icon={<GaugeIcon className="size-5" />}
              title="Measure the fill"
              body="Meta SAM 3.1 segments the bed and the debris; the geometry estimator turns those masks into a fill percentage, then applies the truck's certified capacity to get cubic yards."
            />
            <Step
              n={3}
              icon={<CircleDollarSignIcon className="size-5" />}
              title="Value and draft"
              body="Cubic yards × the event rate for that debris class gives the measured dollar value. A draft ticket is created with the evidence, the stage trace, and any anomaly flags attached."
            />
          </div>

          {/* ── The AI pipeline ─────────────────────────────────────────── */}
          <Section icon={<SparklesIcon className="size-[18px]" />} title="What the AI does (the 7-stage pipeline)">
            <p>
              Every ticket shows its full stage trace on the Review screen and the AI Pipeline screen,
              so no number is a black box. Click any stage to see the model, confidence, and timing.
            </p>
            <ol className="ml-4 list-decimal space-y-1.5">
              <li>
                <B>Track &amp; segment</B> — SAM 3.1 tracks the truck, bed, and debris across frames
                and produces the masks everything else measures from.
              </li>
              <li>
                <B>Read placard</B> — Muse Spark reads the truck&apos;s ID from the footage. A low
                confidence here flags the ticket for manual identification.
              </li>
              <li>
                <B>Capacity lookup</B> — the read ID is matched to the certified truck registry to get
                the bed&apos;s registered cubic-yard capacity.
              </li>
              <li>
                <B>Measure fill</B> — the geometry estimator converts the bed/debris masks into a fill
                percentage with a confidence score.
              </li>
              <li>
                <B>Classify debris</B> — Muse Spark labels the load (vegetative, C&amp;D, white goods,
                hazardous, other), which selects the event rate.
              </li>
              <li>
                <B>Flag anomalies</B> — deterministic rules check the measured facts and raise flags
                (see below); Muse Spark phrases each one for a reviewer.
              </li>
              <li>
                <B>Value the load</B> — the deterministic money math produces the measured value and,
                once a monitor call exists, the signed delta.
              </li>
            </ol>
            <p className="text-[12px] text-[var(--color-subtle)]">
              Stages 1–3 and 5 are AI; capacity, fill geometry, anomaly rules, and the dollar math are
              deterministic — the AI never sets a price.
            </p>
          </Section>

          {/* ── The money frame ─────────────────────────────────────────── */}
          <Section icon={<CircleDollarSignIcon className="size-[18px]" />} title="Reading the money frame">
            <p>
              Each ticket compares two numbers: the value LoadTruth measured from the evidence, and the
              value implied by the monitor&apos;s fill call. The signed difference is the{" "}
              <B>delta</B> (monitor minus measured).
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <B>Over-call</B> — the monitor called the load higher than measured, so the bill is
                higher than the evidence supports. This is the flagged exposure, shown in Signal
                Violet. Worked example: certified 25 CY, measured 48% → 12 CY; monitor called 90% →
                22.5 CY; at $8.50/CY the delta is +$89.25 in the contractor&apos;s favor.
              </li>
              <li>
                <B>Under-call</B> — the monitor called it lower than measured (delta negative).
              </li>
              <li>
                <B>Agreement</B> — the two are within a small tolerance; nothing to recover.
              </li>
            </ul>
            <p>
              <B>Fill accuracy</B> on the Overview is the share of monitor-reviewed tickets whose
              machine estimate landed within 10 percentage points of the monitor&apos;s call — a real
              figure computed from your data, not a demo constant.
            </p>
          </Section>

          {/* ── Reviewing a ticket ──────────────────────────────────────── */}
          <Section icon={<ClipboardCheckIcon className="size-[18px]" />} title="Reviewing a ticket">
            <p>
              The Review screen works one ticket at a time. The left column holds the evidence, the
              truck facts, and the anomaly flags; the right rail holds the AI analysis and your
              decision. Record the monitor&apos;s fill call (if there is one), then decide:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <B>Confirm</B> — the evidence supports the call; the ticket is approved as-is.
              </li>
              <li>
                <B>Override</B> — record a corrected decision when the call was wrong. A short reason
                is required.
              </li>
              <li>
                <B>Dispute</B> — flag the ticket for resolution with the contractor. A reason is
                required so the dispute is documented.
              </li>
            </ul>
            <KeyRow />
          </Section>

          {/* ── Anomaly flags ───────────────────────────────────────────── */}
          <Section icon={<TriangleAlertIcon className="size-[18px]" />} title="Anomaly flags and what they mean">
            <p>Flags are automatic prompts to look closer. They never block a decision — they focus it.</p>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-[13px]">
                <tbody className="divide-y divide-border">
                  <FlagRow sev="High" flag="Uncertified truck" meaning="The identified truck has no active certification in the registry — verify it before approving." />
                  <FlagRow sev="High" flag="Capacity exceeded" meaning="The measured volume is above the truck's certified capacity; check for an overfilled or misidentified truck." />
                  <FlagRow sev="High" flag="Impossible cycle" meaning="The same truck recorded two loads closer together than a realistic round trip — possible duplicate." />
                  <FlagRow sev="Warn" flag="Placard unreadable" meaning="The truck ID couldn't be read confidently; identify it manually before certifying." />
                  <FlagRow sev="Warn" flag="Hollow load" meaning="The load covers most of the bed opening but credits a low fill — a possible hollow or 'fluffed' load." />
                  <FlagRow sev="Info" flag="Low confidence" meaning="The fill estimate is uncertain (occlusion or extreme fill); confirm the measurement manually." />
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Screens by role ─────────────────────────────────────────── */}
          <Section icon={<ShieldCheckIcon className="size-[18px]" />} title="What you can do, by role">
            <p>
              Every action is enforced on the server — the UI only hides what your role can&apos;t do.
              A higher role can do everything a lower one can, plus more. Auditor is deliberately
              read-only: it ranks above Monitor in trust but cannot change a decision.
            </p>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-[13px]">
                <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Role</th>
                    <th className="px-4 py-2 text-left font-semibold">Can do</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <RoleRow
                    role="Field Monitor"
                    can="Review tickets: record monitor calls, confirm / override / dispute, and upload clips on New Ticket."
                  />
                  <RoleRow
                    role="Auditor"
                    can="Read-only across the workspace plus CSV and audit-packet exports. Cannot change a ticket or any setting."
                  />
                  <RoleRow
                    role="Supervisor"
                    can="Everything a monitor can, plus manage the truck registry and evidence sources (add / edit / remove)."
                  />
                  <RoleRow
                    role="County Admin"
                    can="Everything above, plus create and edit events and their rate tables, and manage members (up to their own rank)."
                  />
                  <RoleRow
                    role="System Owner"
                    can="Full access across the whole workspace, including all member and event administration."
                  />
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── The screens ─────────────────────────────────────────────── */}
          <Section icon={<ScanEyeIcon className="size-[18px]" />} title="The screens">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Term t="Overview" d="The event's money frame at a glance: flagged exposure, measured value, review progress, fill accuracy, and the highest-value tickets still to review." />
              <Term t="Review" d="Work the queue one ticket at a time — evidence, AI analysis, truck facts, flags, and the confirm / override / dispute decision." />
              <Term t="New Ticket" d="Upload a clip or image to draft a ticket from the measured load. Requires review access." />
              <Term t="AI Analyst" d="Ask questions about the event in plain language. It answers only from your real data and shows the queries it ran. Available on every screen via the chat button." />
              <Term t="AI Pipeline" d="A live view of every clip run through the models, with the full stage trace and timing." />
              <Term t="Reports" d="Totals, breakdowns by status / debris class / anomaly severity, the full ticket ledger, and CSV + audit-packet exports." />
              <Term t="Admin" d="Manage the rate table, the truck registry, evidence sources, members, and which AI models power each task (role-gated)." />
            </dl>
          </Section>

          {/* ── Glossary ────────────────────────────────────────────────── */}
          <Section icon={<TruckIcon className="size-[18px]" />} title="Glossary">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Term t="Fill percent" d="How full the truck bed is, 0–100%. The core measured quantity." />
              <Term t="CY (cubic yards)" d="The volume unit loads are measured and paid in." />
              <Term t="pp (percentage points)" d="The gap between two percentages — 80% minus 62% is 18 pp." />
              <Term t="Certified capacity" d="A truck's registered bed volume in cubic yards, from the registry." />
              <Term t="Delta" d="Monitor-called value minus measured value. Positive = over-call (flagged exposure)." />
              <Term t="Flagged exposure" d="Total positive dollar delta across over-called tickets awaiting review." />
              <Term t="Placard" d="The truck's identifying number read from the evidence by the AI." />
              <Term t="Anomaly flag" d="An automatic prompt to look closer — e.g. a load above capacity." />
            </dl>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}

function Step({ n, icon, title, body }: { n: number; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          {icon}
        </span>
        <span className="text-[12px] font-semibold text-muted-foreground">Step {n}</span>
      </div>
      <h3 className="mt-3 text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </Card>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-brand)]">{icon}</span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      <div className="mt-3 flex flex-col gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </Card>
  );
}

function RoleRow({ role, can }: { role: string; can: string }) {
  return (
    <tr>
      <td className="w-40 px-4 py-2.5 align-top font-medium text-foreground">{role}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{can}</td>
    </tr>
  );
}

function FlagRow({ sev, flag, meaning }: { sev: "High" | "Warn" | "Info"; flag: string; meaning: string }) {
  const color =
    sev === "High" ? "var(--color-destructive)" : sev === "Warn" ? "var(--color-warn)" : "var(--color-info)";
  return (
    <tr>
      <td className="w-16 px-4 py-2.5 align-top">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
          {sev}
        </span>
      </td>
      <td className="w-40 px-4 py-2.5 align-top font-medium text-foreground">{flag}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{meaning}</td>
    </tr>
  );
}

function KeyRow() {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-[12px] text-muted-foreground">
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <KeyboardIcon className="size-4" /> Keyboard
      </span>
      <Kbd k="J" /> / <Kbd k="K" /> move through the queue
      <span className="text-[var(--color-subtle)]">·</span>
      <Kbd k="C" /> confirm
      <span className="text-[var(--color-subtle)]">·</span>
      <Kbd k="O" /> override
      <span className="text-[var(--color-subtle)]">·</span>
      <Kbd k="D" /> dispute
      <span className="text-[var(--color-subtle)]">·</span>
      <Kbd k="⌘K" /> command palette
    </div>
  );
}

function Kbd({ k }: { k: string }) {
  return (
    <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground">
      {k}
    </kbd>
  );
}

function Term({ t, d }: { t: string; d: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[13px] font-semibold text-foreground">{t}</dt>
      <dd className="text-[12px] leading-relaxed text-muted-foreground">{d}</dd>
    </div>
  );
}
