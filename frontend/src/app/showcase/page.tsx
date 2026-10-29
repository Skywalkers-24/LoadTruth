import Link from "next/link";
import type { Metadata } from "next";
import {
  BuildingIcon,
  CameraIcon,
  CircleDollarSignIcon,
  FileCheck2Icon,
  GaugeIcon,
  ReceiptIcon,
  ScanEyeIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TruckIcon,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { LogoLockup } from "@/components/ui/logo";
import { SHOWCASE_EVENT_ID } from "@/lib/api";

export const metadata: Metadata = {
  title: "LoadTruth | Debris Load Review",
  description:
    "Review truck footage, SAM tracking evidence, and Muse visual fill estimates in a human-reviewed load-ticket workflow.",
};

/**
 * Public showcase (Winner.md B6): the submission's front door, no login. It
 * explains the workflow and product surface without presenting unverified
 * estimates or performance metrics as measured results.
 */
export default function ShowcasePage() {
  return (
    <main className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)]">
      <Nav />
      <Hero />
      <Anatomy />
      <Features />
      <Personas />
      <Constraint />
      <WhereItStands />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link href="/" className="transition hover:opacity-90">
          <LogoLockup />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={`/console?event=${SHOWCASE_EVENT_ID}`}
            className="rounded-md bg-[var(--color-brand)] px-3 py-2 text-[13px] font-medium text-white hover:opacity-90"
          >
            Open the console
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="min-w-0">
        <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
          Truck video · visual estimates · human review
        </p>
        <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          A clearer record for every debris haul.
        </h1>
        <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
          LoadTruth pairs truck footage with SAM tracking and Muse&apos;s frame-by-frame visual fill
          estimates. It turns those estimates into a draft cubic-yard ticket that a monitor can
          review, correct, or dispute.
        </p>
        <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          Fill is estimated from video; cubic yards are derived from certified truck capacity.
          SAM&apos;s masks support visual review and do not determine the fill percentage.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={`/console?event=${SHOWCASE_EVENT_ID}`}
            className="rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
          >
            View the review workflow
          </Link>
          <Link
            href="/guide"
            className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-[14px] font-medium hover:border-[var(--color-border-strong)]"
          >
            How it works
          </Link>
        </div>
      </div>

      <WorkflowCard />
    </section>
  );
}

function WorkflowCard() {
  const steps = [
    {
      title: "Source footage",
      detail: "A saved clip is the evidence record.",
      icon: <CameraIcon size={17} />,
    },
    {
      title: "Track the truck",
      detail: "SAM follows the truck and load across frames.",
      icon: <ScanEyeIcon size={17} />,
    },
    {
      title: "Estimate and review",
      detail: "Muse estimates fill; a monitor reviews the draft.",
      icon: <SparklesIcon size={17} />,
    },
  ];
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
      <h2 className="text-[15px] font-semibold">From footage to a reviewable draft</h2>
      <ol className="mt-5 space-y-0">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 && (
              <span
                className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-[var(--color-border)]"
                aria-hidden
              />
            )}
            <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
              {step.icon}
            </span>
            <span className="pt-0.5">
              <span className="block text-[13px] font-semibold">{step.title}</span>
              <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
                {step.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const STAGES: { n: number; title: string; body: string; icon: React.ReactNode }[] = [
  {
    n: 1,
    title: "Sample the clip",
    body: "The clip is normalized and sampled into frames for the analysis stages.",
    icon: <CameraIcon size={18} />,
  },
  {
    n: 2,
    title: "Segment with SAM 3.1",
    body: "SAM tracks the truck, bed, and load across frames. Its masks are saved as visual evidence, not used to calculate fill.",
    icon: <ScanEyeIcon size={18} />,
  },
  {
    n: 3,
    title: "Read placard with Muse Spark",
    body: "Muse reads the truck ID from the footage; the result is matched against the truck registry.",
    icon: <SparklesIcon size={18} />,
  },
  {
    n: 4,
    title: "Look up capacity",
    body: "The registry supplies the truck's certified cubic-yard capacity when a match is found.",
    icon: <TruckIcon size={18} />,
  },
  {
    n: 5,
    title: "Estimate fill with Muse",
    body: "Muse estimates fill in sampled frames. The pipeline takes their median; SAM masks do not affect the result.",
    icon: <GaugeIcon size={18} />,
  },
  {
    n: 6,
    title: "Classify debris",
    body: "Muse assigns a debris class used to select the applicable rate.",
    icon: <SparklesIcon size={18} />,
  },
  {
    n: 7,
    title: "Check and draft",
    body: "Deterministic compliance rules run; the fill estimate and certified capacity produce cubic yards and value. The monitor reviews the draft.",
    icon: <ShieldCheckIcon size={18} />,
  },
];

function Anatomy() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <h2 className="text-xl font-semibold">How a clip becomes a draft ticket</h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
        Models handle visual tasks; application code combines the fill estimates, applies rates, and
        runs compliance checks. A monitor remains responsible for the final call.
      </p>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {STAGES.map((s) => (
          <li
            key={s.n}
            className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div className="flex items-center gap-2 text-[var(--color-brand)]">
              <span className="grid size-8 place-items-center rounded-md bg-[var(--color-brand-soft)]">
                {s.icon}
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Stage {s.n}
              </span>
            </div>
            <h3 className="text-[15px] font-semibold">{s.title}</h3>
            <p className="text-[13px] leading-snug text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const FEATURES: { title: string; body: string; icon: React.ReactNode; color: string }[] = [
  {
    title: "Multi-tenant by design",
    body: "Events, trucks, rates, members, and evidence are scoped to a tenant and protected by API role checks.",
    icon: <BuildingIcon size={18} />,
    color: "var(--chart-1)",
  },
  {
    title: "Ticket comparison",
    body: "Compare the draft estimate with a monitor's recorded call and see the resulting difference.",
    icon: <CircleDollarSignIcon size={18} />,
    color: "var(--color-money)",
  },
  {
    title: "Reporting and exports",
    body: "Review event summaries and ticket records; export CSV data or a printable audit packet.",
    icon: <FileCheck2Icon size={18} />,
    color: "var(--chart-2)",
  },
  {
    title: "Billing and invoicing",
    body: "County-to-contractor billing turns reviewed loads into a printable invoice: settled versus pending, line items by debris class, and a month-by-month history.",
    icon: <ReceiptIcon size={18} />,
    color: "var(--chart-4)",
  },
  {
    title: "Configurable Muse inference",
    body: "The app supports Meta directly and configurable Muse backends. Fireworks AI, Modal, and Baseten are provider options; availability depends on task capability and configuration.",
    icon: <SparklesIcon size={18} />,
    color: "var(--color-brand)",
  },
  {
    title: "Reproducible estimate",
    body: "Stored Muse frame estimates and their median can be replayed without another model call. The original source video and SAM masks remain available as review evidence.",
    icon: <ShieldCheckIcon size={18} />,
    color: "var(--chart-5)",
  },
];

function Features() {
  return (
    <section className="w-full border-t border-[var(--color-border)]">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <h2 className="text-xl font-semibold">The review tools around the estimate</h2>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Ticket management, reporting, billing, and saved evidence support the monitor&apos;s
          review process.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <span
                className="grid size-9 place-items-center rounded-lg"
                style={{
                  backgroundColor: `color-mix(in srgb, ${f.color} 16%, transparent)`,
                  color: f.color,
                }}
              >
                {f.icon}
              </span>
              <h3 className="text-[15px] font-semibold">{f.title}</h3>
              <p className="text-[13px] leading-snug text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Personas() {
  return (
    <section className="w-full border-t border-[var(--color-border)]">
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-12 sm:grid-cols-2 sm:px-8 sm:py-16">
        <Persona
          role="Field monitor"
          side="Reviews the draft"
          body="See the source clip, SAM tracking evidence, and Muse's per-frame fill estimates together. Confirm the draft or enter a corrected call."
        />
        <Persona
          role="County reviewer"
          side="Checks the record"
          body="Review ticket values, compliance flags, billing summaries, and exported evidence in one workflow."
        />
      </div>
    </section>
  );
}

function Persona({ role, side, body }: { role: string; side: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
      <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-brand)]">
        {side}
      </span>
      <h3 className="text-[16px] font-semibold">{role}</h3>
      <p className="text-[14px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Constraint() {
  return (
    <section className="w-full border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <h2 className="text-xl font-semibold">Model roles and inference options</h2>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">
          SAM 3.1 tracks the truck and load for evidence. Muse Spark estimates fill from sampled
          video frames, and deterministic code takes the median and converts the estimate to cubic
          yards using certified truck capacity. Muse inference can use Meta directly or a configured
          backend: Fireworks AI, Modal, or Baseten. These are supported routes; the active provider
          depends on deployment configuration.
        </p>
      </div>
    </section>
  );
}

function WhereItStands() {
  const working = [
    "Video ingest and draft-ticket pipeline",
    "SAM tracking evidence and Muse estimates across sampled frames",
    "Deterministic median, cubic-yard calculation, and compliance checks",
    "Monitor confirm, correction, and dispute workflow",
    "Ticket reports, CSV export, billing, and printable audit packet",
    "Replay of stored Muse estimates without another model call",
  ];
  const inProgress = ["Independent known-volume benchmark; no accuracy result is published yet"];
  const roadmap = [
    "3D load reconstruction for a second, independent volume estimate",
    "Spoken monitor call captured and transcribed",
    "Live camera ingestion beyond direct upload",
  ];
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <h2 className="text-xl font-semibold">Where it stands</h2>
      <p className="mt-2 text-[14px] text-muted-foreground">
        Current features and planned validation, stated separately.
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <StatusColumn title="Working" tone="var(--color-ok)" items={working} />
        <StatusColumn title="In progress" tone="var(--color-warn)" items={inProgress} />
        <StatusColumn title="Roadmap" tone="var(--color-info)" items={roadmap} />
      </div>
    </section>
  );
}

function StatusColumn({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="flex items-center gap-2 text-[14px] font-semibold">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: tone }} aria-hidden />
        {title}
      </h3>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it} className="text-[13px] leading-snug text-muted-foreground">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Footer() {
  return (
    <footer className="w-full border-t border-[var(--color-border)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-2 px-5 py-8 text-[13px] text-muted-foreground sm:px-8">
        <p>
          Fill estimates are AI-assisted; the monitor remains responsible for the final record.
          Independent known-volume accuracy results are not yet published.
        </p>
        <Link
          href="/console"
          className="w-fit font-medium text-[var(--color-brand)] hover:underline"
        >
          Open the console
        </Link>
      </div>
    </footer>
  );
}
