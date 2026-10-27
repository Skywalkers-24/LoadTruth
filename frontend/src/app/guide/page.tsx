"use client";

import {
  CameraIcon,
  CircleDollarSignIcon,
  ClipboardCheckIcon,
  GaugeIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/shadcn/card";

/**
 * Guide: how LoadTruth measures a load, what the money frame means, the review
 * flow, roles, and a glossary of the technical terms used across the app.
 */
export default function GuidePage() {
  return (
    <AppShell section="Guide">
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold tracking-tight">How LoadTruth works</h1>
            <p className="text-[13px] text-muted-foreground">
              A short guide to measuring loads, reading the money frame, and reviewing tickets.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Step
              n={1}
              icon={<CameraIcon className="size-5" />}
              title="Capture evidence"
              body="A clip or image of the loaded truck bed is captured from an upload, a connected camera, or cloud storage."
            />
            <Step
              n={2}
              icon={<GaugeIcon className="size-5" />}
              title="Measure the fill"
              body="LoadTruth estimates how full the bed is as a percentage, then applies the truck's certified capacity to get cubic yards."
            />
            <Step
              n={3}
              icon={<CircleDollarSignIcon className="size-5" />}
              title="Value the load"
              body="Cubic yards times the event's rate for that debris class gives the measured dollar value of the load."
            />
          </div>

          <Section icon={<CircleDollarSignIcon className="size-[18px]" />} title="The money frame">
            <p>
              Every ticket compares two numbers: the value LoadTruth measured from the evidence, and
              the value implied by the monitor&apos;s call. The signed difference is the delta.
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <span className="font-medium text-foreground">Over-call</span>: the monitor called the
                load higher than measured, so the bill is higher than the evidence supports. Shown in
                amber as flagged exposure.
              </li>
              <li>
                <span className="font-medium text-foreground">Under-call</span>: the monitor called it
                lower than measured.
              </li>
              <li>
                <span className="font-medium text-foreground">Agreement</span>: the two are within a
                small tolerance.
              </li>
            </ul>
          </Section>

          <Section icon={<ClipboardCheckIcon className="size-[18px]" />} title="Reviewing a ticket">
            <p>In the Review Console you work one ticket at a time. For each one you can:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <span className="font-medium text-foreground">Confirm</span> when the evidence supports
                the call.
              </li>
              <li>
                <span className="font-medium text-foreground">Override</span> to record a corrected
                decision.
              </li>
              <li>
                <span className="font-medium text-foreground">Dispute</span> to flag the ticket for
                resolution with the contractor.
              </li>
            </ul>
          </Section>

          <Section icon={<ShieldCheckIcon className="size-[18px]" />} title="Roles and access">
            <p>Access is enforced on every action. Each role can do what the one below it can, plus more:</p>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-[13px]">
                <tbody className="divide-y divide-border">
                  <RoleRow role="Field Monitor" can="Review tickets and record monitor calls." />
                  <RoleRow role="Auditor" can="Read-only access and exports. Cannot change decisions." />
                  <RoleRow role="Supervisor" can="Everything a monitor can, plus manage trucks and sources." />
                  <RoleRow role="County Admin" can="Manage events, rates, and members." />
                  <RoleRow role="System Owner" can="Full access across the workspace." />
                </tbody>
              </table>
            </div>
          </Section>

          <Section icon={<TriangleAlertIcon className="size-[18px]" />} title="Glossary">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Term t="Fill percent" d="How full the truck bed is, from 0 to 100 percent." />
              <Term t="CY (cubic yards)" d="The volume unit loads are measured and paid in." />
              <Term t="pp (percentage points)" d="The gap between two percentages, e.g. 80% minus 62% is 18 pp." />
              <Term t="Certified capacity" d="A truck's registered bed volume in cubic yards." />
              <Term t="Over-call" d="A monitor call higher than the measured value." />
              <Term t="Flagged exposure" d="Total dollar delta on over-called tickets awaiting review." />
              <Term t="Placard" d="The truck's identifying number read from the evidence." />
              <Term t="Anomaly flag" d="An automatic prompt to look closer, e.g. a load above capacity." />
            </dl>
          </Section>
        </div>
      </div>
    </AppShell>
  );
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
      <div className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </Card>
  );
}

function RoleRow({ role, can }: { role: string; can: string }) {
  return (
    <tr>
      <td className="w-40 px-4 py-2.5 font-medium text-foreground">{role}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{can}</td>
    </tr>
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
