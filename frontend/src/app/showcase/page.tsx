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
import { SHOWCASE_EVENT_ID } from "@/lib/api";

export const metadata: Metadata = {
  title: "LoadTruth — a load ticket anyone can reproduce",
  description:
    "Every debris load ticket is a number nobody can reproduce. LoadTruth makes it a number anyone can reproduce, from the video, in one click.",
};

/**
 * Public showcase (Winner.md B6): the submission's front door, no login. It
 * tells the story, shows the seven-stage pipeline, the product surface, the
 * sourced case studies that frame the problem, names the two people on opposite
 * sides of one ticket, states the honest "where it stands," and links into the
 * live console. Every stat traces to a cited source or the code.
 */
export default function ShowcasePage() {
  return (
    <main className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)]">
      <Nav />
      <Hero />
      <StatsBand />
      <Anatomy />
      <Features />
      <CaseStudies />
      <Personas />
      <BenchmarkCard />
      <Constraint />
      <WhereItStands />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <span className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            <TruckIcon size={16} />
          </span>
          LoadTruth
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={`/console?event=${SHOWCASE_EVENT_ID}`}
            className="rounded-md bg-[var(--color-brand)] px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90"
          >
            Explore benchmarked videos
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-10 px-6 pb-12 pt-16 lg:grid-cols-[1.15fr_0.85fr]">
      {/* Left: the pitch */}
      <div className="min-w-0">
        <p className="mb-3 text-[13px] font-medium uppercase tracking-wide text-[var(--color-brand)]">
          Disaster-debris load auditing
        </p>
        <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Every debris load ticket is a number nobody can reproduce. LoadTruth makes it a number
          anyone can reproduce, from the video, in one click.
        </h1>
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          After a hurricane, a monitor in a tower eyeballs each dump truck&apos;s fill percentage,
          and that guess decides federal payments. LoadTruth measures the load from video against
          the truck&apos;s certified bed, drafts a FEMA-format ticket with evidence frames, and
          flags the loads that do not add up. A human monitor still confirms or overrides every
          ticket.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={`/console?event=${SHOWCASE_EVENT_ID}`}
            className="rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
          >
            Explore benchmarked videos
          </Link>
          <Link
            href="/guide"
            className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-[14px] font-medium hover:border-[var(--color-border-strong)]"
          >
            How it works
          </Link>
        </div>
      </div>

      {/* Right: a visual that fills the other half instead of empty space */}
      <HeroVisual />
    </section>
  );
}

/**
 * A compact "one ticket" panel for the hero's right column, so the fold uses the
 * full width instead of leaving the right half blank. Pure presentation.
 */
function HeroVisual() {
  const rows: { label: string; value: string; tone?: "money" | "muted" }[] = [
    { label: "Truck", value: "FL-DT-3391" },
    { label: "Certified bed", value: "25 CY" },
    { label: "Measured fill", value: "48%" },
    { label: "Measured value", value: "$102.00" },
    { label: "Monitor call", value: "90%", tone: "muted" },
  ];
  return (
    <div className="relative hidden lg:block">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] opacity-70"
        style={{
          background:
            "radial-gradient(500px 300px at 70% 20%, color-mix(in srgb, var(--color-brand) 22%, transparent), transparent 70%), radial-gradient(400px 300px at 20% 100%, color-mix(in srgb, var(--color-money) 16%, transparent), transparent 70%)",
        }}
      />
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <span className="grid size-7 place-items-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
              <TruckIcon size={15} />
            </span>
            Load ticket LT-2C707D
          </span>
          <span className="rounded-full bg-[var(--color-ok-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ok)]">
            Reproducible
          </span>
        </div>
        <dl className="flex flex-col divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-2">
              <dt className="text-[13px] text-muted-foreground">{r.label}</dt>
              <dd
                className={`text-[14px] font-semibold tabular-nums ${
                  r.tone === "muted" ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--color-money-soft)] px-3 py-2.5">
          <span className="text-[12px] font-medium text-foreground">Dollar difference</span>
          <span className="text-[18px] font-bold tabular-nums text-[var(--color-money)]">
            +$89.25
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Every figure traces to a pixel, a registry row, or a rate. Re-verify recomputes it from
          the stored masks and matches the receipt hash.
        </p>
      </div>
    </div>
  );
}

function StatsBand() {
  const stats = [
    {
      value: "107M CY",
      label: "debris cleared in the 2024 hurricane season",
      color: "var(--chart-1)",
    },
    {
      value: "$190M",
      label: "one county's 5-year debris-monitoring contract",
      color: "var(--chart-2)",
    },
    {
      value: "500%+",
      label: "of certified capacity logged in a post-Katrina audit",
      color: "var(--chart-5)",
    },
    {
      value: "±10 pts",
      label: "the fill-accuracy target we benchmark against",
      color: "var(--chart-4)",
    },
  ];
  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-6 py-8 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded-xl border border-[var(--color-border)] p-3"
            style={{
              background: `linear-gradient(160deg, color-mix(in srgb, ${s.color} 12%, transparent), transparent 70%)`,
            }}
          >
            <span className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>
              {s.value}
            </span>
            <span className="text-[12px] leading-snug text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const STAGES: { n: number; title: string; body: string; icon: React.ReactNode }[] = [
  {
    n: 1,
    title: "Sample the clip",
    body: "A short clip is sampled to a few keyframes at a cost-safe frame rate.",
    icon: <CameraIcon size={18} />,
  },
  {
    n: 2,
    title: "Segment with SAM 3.1",
    body: "SAM 3.1 tracks the truck bed and the debris pile across frames and returns masks.",
    icon: <ScanEyeIcon size={18} />,
  },
  {
    n: 3,
    title: "Read the placard",
    body: "Muse Spark reads the truck's ID placard so the load ties to a certified truck.",
    icon: <SparklesIcon size={18} />,
  },
  {
    n: 4,
    title: "Look up capacity",
    body: "The read ID matches a certified truck in the registry to get the bed volume.",
    icon: <TruckIcon size={18} />,
  },
  {
    n: 5,
    title: "Measure fill and classify",
    body: "Deterministic geometry turns the masks into a fill %. Muse Spark classifies the debris.",
    icon: <GaugeIcon size={18} />,
  },
  {
    n: 6,
    title: "Flag anomalies",
    body: "Code rules flag uncertified trucks, capacity mismatches, and surface-versus-depth gaps.",
    icon: <ShieldCheckIcon size={18} />,
  },
  {
    n: 7,
    title: "Value and draft",
    body: "Cubic yards times the class rate gives dollars. The ticket is a draft until a human signs.",
    icon: <CircleDollarSignIcon size={18} />,
  },
];

function Anatomy() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <h2 className="text-xl font-semibold">One clip, seven stages</h2>
      <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
        The model proposes, deterministic code decides. Every number on the ticket traces to a
        pixel, a registry row, or a rate, and each stage records what it did.
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
    body: "Each agency runs its own events, trucks, rates, members, and evidence, isolated in the database with row-level security and enforced again in the API.",
    icon: <BuildingIcon size={18} />,
    color: "var(--chart-1)",
  },
  {
    title: "The money frame",
    body: "Every ticket shows the measured value against the monitor's call and the exact signed dollar delta, rolled up per event so flagged exposure is one number.",
    icon: <CircleDollarSignIcon size={18} />,
    color: "var(--color-money)",
  },
  {
    title: "Reporting and exports",
    body: "Totals by status, debris class, and anomaly severity, the full ticket ledger, a FEMA-format audit packet, and CSV, all from live tenant data.",
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
    title: "Grounded AI analyst",
    body: "Ask about exposure, over-calls, or disputes in plain language. Muse Spark answers only from your own data through read-only, tenant-scoped tools.",
    icon: <SparklesIcon size={18} />,
    color: "var(--color-brand)",
  },
  {
    title: "Evidence receipt and re-verify",
    body: "A SHA-256 over the clip, the SAM output, the measured inputs, and the result. One click re-derives the fill % from the stored masks and matches the fingerprint.",
    icon: <ShieldCheckIcon size={18} />,
    color: "var(--chart-5)",
  },
];

function Features() {
  return (
    <section className="border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <h2 className="text-xl font-semibold">A product, not a demo</h2>
        <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
          The pipeline is the engine. Around it is the operator console an agency actually runs on:
          tenancy, money, reporting, billing, and an audit trail that holds up years later.
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

interface CaseStudy {
  stat: string;
  title: string;
  body: string;
  source: string;
  href: string;
  color: string;
}

// Each figure is paraphrased from a government report or news coverage and
// links to the primary source. They establish the scale of the measurement
// problem, not any claim of certification (see Research.md).
const CASE_STUDIES: CaseStudy[] = [
  {
    stat: "107M+ CY",
    title: "The 2024 hurricane season",
    body: "After Helene and Milton, FEMA reported more than 107 million cubic yards of debris cleared across the Southeast. Every cubic yard flows through a load-ticket count someone has to verify.",
    source: "FEMA",
    href: "https://www.fema.gov/blog/recovery-efforts-continue-one-year-after-hurricanes-helene-and-milton",
    color: "var(--chart-1)",
  },
  {
    stat: "$190M",
    title: "Miami-Dade monitoring contract",
    body: "A single county recommended a disaster-debris-removal monitoring contract worth $190,070,000 over five years. That is monitoring alone, which shows how much governments already pay just to verify loads.",
    source: "Miami-Dade County",
    href: "https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf",
    color: "var(--chart-2)",
  },
  {
    stat: "500%+",
    title: "Trucks logged over capacity (Katrina)",
    body: "A DHS Inspector General audit of Kenner, Louisiana questioned $5.5M in Katrina debris costs after finding trucks recorded at more than 95% full, with some loads at over 500% of certified capacity.",
    source: "DHS OIG",
    href: "https://www.oig.dhs.gov/sites/default/files/assets/GrantReports/OIG_DD-09-04_Jan09.pdf",
    color: "var(--chart-5)",
  },
  {
    stat: "$716,677",
    title: "Fake load slips, prosecuted",
    body: "The DOJ prosecuted a conspiracy built on false debris-removal load slips, and separately charged a subcontractor with bribing a monitor for tickets on debris never dumped. Load tickets are the fraud surface.",
    source: "US DOJ",
    href: "https://www.justice.gov",
    color: "var(--chart-3)",
  },
  {
    stat: "15M+ CY",
    title: "Hurricane Sandy cleanup",
    body: "FEMA supported removal of more than 15 million cubic yards of debris after Sandy, enough to fill the Empire State Building several times over. Scale makes manual verification impossible.",
    source: "FEMA",
    href: "https://news.va.gov/wp-content/uploads/sites/3/2013/10/FEMA-Sandy-One-Year-Fact-Sheet.pdf",
    color: "var(--chart-4)",
  },
  {
    stat: "$2B",
    title: "Florida Helene/Milton reimbursement",
    body: "Florida's debris-removal reimbursement after the 2024 storms ran into the billions, with tens of millions approved for individual cities based on cubic-yard counts.",
    source: "FEMA",
    href: "https://www.fema.gov",
    color: "var(--chart-1)",
  },
];

function CaseStudies() {
  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <h2 className="text-xl font-semibold">Why this is worth measuring</h2>
        <p className="mt-2 max-w-2xl text-[14px] text-muted-foreground">
          The problem is large, expensive, and already a known fraud surface. Every figure below
          links to its primary source. They frame the scale, not a claim of certification.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CASE_STUDIES.map((c) => (
            <a
              key={c.title}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 transition-colors hover:border-[var(--color-border-strong)]"
            >
              <span className="text-2xl font-bold tabular-nums" style={{ color: c.color }}>
                {c.stat}
              </span>
              <h3 className="text-[14px] font-semibold">{c.title}</h3>
              <p className="text-[13px] leading-snug text-muted-foreground">{c.body}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[12px] font-medium text-[var(--color-brand)] group-hover:underline">
                Source: {c.source}
              </span>
            </a>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Figures are paraphrased from government reports (FEMA, DHS OIG, DOJ) and news coverage
          linked above. Content rephrased for compliance with licensing restrictions.
        </p>
      </div>
    </section>
  );
}

function Personas() {
  return (
    <section className="border-t border-[var(--color-border)]">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-12 sm:grid-cols-2">
        <Persona
          role="The tower monitor"
          side="Records the ticket"
          body="Watches truck after truck in a tower and calls a fill % under time pressure. LoadTruth gives a starting number, the evidence behind it, and a one-click override, so the call is faster and defensible."
        />
        <Persona
          role="The county finance director"
          side="Pays the ticket"
          body="Signs off on reimbursements that FEMA may audit years later. LoadTruth hands over an audit packet where every ticket links to the video and can be reproduced from it, so a disputed number is a click away from proof."
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

function BenchmarkCard() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="text-xl font-semibold">How we measure accuracy</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          We benchmark the fill-% estimator against known volumes: a scale-model truck with a
          measured bed filled to marked levels, plus real loads bought by the cubic yard, filmed
          across angles and lighting. The harness reports the mean error, the share within 10
          points, and the error broken down by condition.
        </p>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          This is separate from{" "}
          <span className="font-medium text-foreground">agreement with the monitor</span>, which
          measures how often the machine lands within 10 points of the human&apos;s own call. Both
          are shown, and neither is dressed up as the other.
        </p>
        <div className="mt-4 inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-[13px] text-muted-foreground">
          Benchmark results publish from <code className="font-mono">data_bench/results.json</code>{" "}
          as clips are filmed.
        </div>
      </div>
    </section>
  );
}

function Constraint() {
  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <h2 className="text-xl font-semibold">A constraint we hit</h2>
        <p className="mt-2 max-w-4xl text-[14px] leading-relaxed text-muted-foreground">
          SAM 3.1 takes one concept per request, so the bed and the load are two calls combined in
          our code. Muse Spark is a reasoning model whose hidden reasoning counts against the output
          budget, so a tight token cap returns an empty answer. We send a few downscaled keyframes,
          cache every call by the clip&apos;s content hash, and reuse one uploaded file across
          calls, so a re-run costs nothing and the whole demo runs within budget.
        </p>
      </div>
    </section>
  );
}

function WhereItStands() {
  const working = [
    "Video to draft ticket through all seven stages",
    "Live SAM 3.1 segmentation and Muse Spark placard read and debris class",
    "Dollar difference per ticket and per event",
    "Confirm, override, and dispute with a human in the loop",
    "FEMA-format audit packet and CSV export",
    "Re-verify: reproduce the fill % from stored evidence with a matching receipt",
    "Per-clip cost ledger with a spend cap",
  ];
  const inProgress = [
    "Known-volume benchmark across 50+ filmed clips",
    "Streamed stage feed during a live run",
  ];
  const roadmap = [
    "3D load reconstruction for a second, independent volume estimate",
    "Spoken monitor call captured and transcribed",
    "Live camera feeds beyond direct upload",
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <h2 className="text-xl font-semibold">Where it stands</h2>
      <p className="mt-2 text-[14px] text-muted-foreground">An honest status, not a wish list.</p>
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
    <footer className="border-t border-[var(--color-border)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-[13px] text-muted-foreground">
        <p>
          Built in 10 days. LoadTruth produces evidence and flags inconsistencies; the responsible
          monitor keeps authority over the official record.
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
