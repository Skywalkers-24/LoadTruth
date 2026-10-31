import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  BuildingIcon,
  CameraIcon,
  CheckCircle2Icon,
  CircleDollarSignIcon,
  ExternalLinkIcon,
  FileCheck2Icon,
  FileTextIcon,
  GaugeIcon,
  MicIcon,
  ReceiptIcon,
  ScaleIcon,
  ScanEyeIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrendingUpIcon,
  TruckIcon,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { LogoLockup } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "LoadTruth | Debris Load Review & FEMA Audit Evidence",
  description:
    "Review truck footage, AI fill estimates, and human-checked load tickets for disaster-debris operations.",
};

/**
 * Public showcase: the submission's front door, no login required.
 * Explains the inspiration, FEMA disaster debris problem, 7-stage AI pipeline,
 * real-world case studies with sourced figures in millions/billions, and product workflow.
 */
export default function ShowcasePage() {
  return (
    <main className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)]">
      <Nav />
      <Hero />
      <Inspiration />
      <Anatomy />
      <Features />
      <Personas />
      <Constraint />
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
            href="/demos"
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
          LoadTruth reviews truck footage, estimates how full the bed is, and prepares a draft load
          ticket. A monitor can check, correct, or dispute the estimate, with the footage available
          for review.
        </p>
        <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          AI estimates fill from video; the truck registry provides its certified capacity. Colored
          outlines help with review but do not determine the fill percentage.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/demos"
            className="rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
          >
            View the review workflow
          </Link>
          <a
            href="#inspiration"
            className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-[14px] font-medium hover:border-[var(--color-border-strong)]"
          >
            FEMA Case Studies &amp; Problem
          </a>
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
      detail: "AI outlines the truck and visible load throughout the video.",
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

interface StatItem {
  value: string;
  label: string;
  sourceName: string;
  href: string;
  color: string;
}

const STATS_DATA: StatItem[] = [
  {
    value: "~107M CY",
    label: "Debris cleared in 2024 season alone (Helene & Milton)",
    sourceName: "FEMA Press Release",
    href: "https://www.fema.gov/press-release/20250926/recovery-continues-after-historic-2024-hurricane-season",
    color: "var(--chart-1)",
  },
  {
    value: "$190,070,000",
    label: "Miami-Dade County's 5-year contract for debris monitoring alone",
    sourceName: "Miami-Dade County",
    href: "https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf",
    color: "var(--color-money)",
  },
  {
    value: "~$2.0 Billion",
    label: "FEMA funds obligated to Florida communities for debris and response",
    sourceName: "FEMA Fact Sheet 076",
    href: "https://www.fema.gov/fact-sheet/florida-helene-and-milton-recovery-fact-sheet-076",
    color: "var(--chart-2)",
  },
  {
    value: "500%+",
    label: "Of certified capacity logged in post-Katrina audit ($5.5M questioned)",
    sourceName: "DHS OIG Audit",
    href: "https://www.oig.dhs.gov/sites/default/files/assets/GrantReports/OIG_DD-09-04_Jan09.pdf",
    color: "var(--chart-5)",
  },
  {
    value: "15M+ CY",
    label: "Cleared after Sandy; enough to fill Empire State Building 3x",
    sourceName: "FEMA & USACE",
    href: "https://news.va.gov/wp-content/uploads/sites/3/2013/10/FEMA-Sandy-One-Year-Fact-Sheet.pdf",
    color: "var(--chart-4)",
  },
  {
    value: "$716,677",
    label: "Conspiracy prosecuted by US DOJ for forged load tickets & bribery",
    sourceName: "US Dept of Justice",
    href: "https://www.justice.gov/criminal/disasters/pr/2007/may/05-18-07akitto-sent.pdf",
    color: "var(--chart-3)",
  },
];

interface CaseStudy {
  stat: string;
  badge: string;
  title: string;
  body: string;
  source: string;
  href: string;
  color: string;
}

const CASE_STUDIES: CaseStudy[] = [
  {
    stat: "500%+ Capacity",
    badge: "$5.5M Questioned",
    title: "Hurricane Katrina: Loads above capacity and audit repayments",
    body: "A federal audit questioned $5.5 million in debris removal costs in Kenner, Louisiana, after records showed some truck loads above their certified capacity. LoadTruth puts the video, estimated fill, and registered truck capacity together so reviewers can check each ticket.",
    source: "DHS OIG DD-09-04",
    href: "https://www.oig.dhs.gov/sites/default/files/assets/GrantReports/OIG_DD-09-04_Jan09.pdf",
    color: "var(--chart-5)",
  },
  {
    stat: "$190M+",
    badge: "5-Year Monitoring",
    title: "Miami-Dade County: The High Cost of Verifying Loads",
    body: "Miami-Dade County awarded a $190,070,000 contract for five years of disaster debris monitoring. The contract covers monitoring, not hauling or disposal, showing the scale of the work required to check disaster cleanup loads.",
    source: "Miami-Dade County Board",
    href: "https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf",
    color: "var(--color-money)",
  },
  {
    stat: "107M+ CY",
    badge: "2024 Season",
    title: "Helene & Milton: Mega-Disaster Scale Meets Human Fatigue",
    body: "Over 107 million cubic yards of storm debris were cleared across the Southeast in 2024. Monitors working 12-hour shifts in dusty conditions estimate each load every 90 seconds. Fatigue can lead to estimates that are 10%–20% too high, or to disputes that put FEMA Public Assistance reimbursements at risk.",
    source: "FEMA 2024 Season Recovery",
    href: "https://www.fema.gov/press-release/20250926/recovery-continues-after-historic-2024-hurricane-season",
    color: "var(--chart-1)",
  },
  {
    stat: "$716K+",
    badge: "DOJ Prosecution",
    title: "Federal Prosecutions: Fraudulent Load Slips & Bribery",
    body: "The US Department of Justice convicted contractors and monitors for bribing tower officials and producing fake load tickets for debris never dumped. The paper load ticket is the primary fraud target because an eyeball estimate has zero objective backing. LoadTruth anchors every ticket to SHA-256 hashed video clips.",
    source: "US Department of Justice",
    href: "https://www.justice.gov/criminal/disasters/pr/2007/may/05-18-07akitto-sent.pdf",
    color: "var(--chart-3)",
  },
  {
    stat: "$1.5 Billion",
    badge: "OIG Alert",
    title: "Hurricane Irma: 'Little to No Oversight' Management Warning",
    body: "A DHS OIG management alert revealed that disaster managers provided little to no oversight over debris contractors handling $1.5 billion in cleanup operations. The watchdog warned that overstated loads and undocumented hauls force local governments to request ineligible reimbursements that FEMA later claws back.",
    source: "DHS OIG-18-85 Alert",
    href: "https://www.oig.dhs.gov/sites/default/files/assets/2018-10/OIG-18-85-Sep18.pdf",
    color: "var(--chart-4)",
  },
  {
    stat: "15M+ CY",
    badge: "Sandy Recovery",
    title: "Hurricane Sandy: Multi-Agency Disposal & Audit Trails",
    body: "FEMA and the US Army Corps of Engineers supported the removal of more than 15 million cubic yards of debris across New York and New Jersey. Multi-agency handoffs require precise debris classification (vegetative, C&D, hazardous) to qualify for FEMA Public Assistance Category A funding.",
    source: "FEMA Sandy One-Year Fact Sheet",
    href: "https://news.va.gov/wp-content/uploads/sites/3/2013/10/FEMA-Sandy-One-Year-Fact-Sheet.pdf",
    color: "var(--chart-2)",
  },
];

function Inspiration() {
  return (
    <section
      id="inspiration"
      className="w-full border-t border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        {/* Section Header */}
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
            <ScaleIcon size={13} className="shrink-0" />
            Inspiration &amp; Real-World Context
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Why disaster debris loads need better records
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">
            After catastrophic disasters, the{" "}
            <strong>Federal Emergency Management Agency (FEMA)</strong> reimburses local governments
            75% to 90%+ of cleanup costs under the Robert T. Stafford Disaster Relief and Emergency
            Assistance Act. But billions in taxpayer dollars hinge on a single fragile step:{" "}
            <span className="font-semibold text-foreground">
              a tired human monitor standing on a tower in 95°F heat, eyeballing a dump truck in 10%
              increments.
            </span>
          </p>
        </div>

        {/* Problem vs Solution Comparison */}
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {/* Legacy Problem Card */}
          <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-6 sm:p-7">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-red-500/10 text-red-500">
                <AlertTriangleIcon size={19} />
              </span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-500">
                  The Legacy Status Quo
                </span>
                <h3 className="text-[17px] font-semibold text-foreground">
                  Load estimates are hard to verify later
                </h3>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              A load ticket is a measurement that nobody can verify once the truck drives away. This
              creates recurring vulnerabilities documented by federal watchdogs:
            </p>
            <ul className="space-y-3 text-[13px] text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-red-500" />
                <span>
                  <strong className="text-foreground">Subjective human guesswork:</strong> Fill
                  percentages vary by monitor fatigue, viewing angle, and speed, often rounded
                  arbitrarily to 10% or 25%.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-red-500" />
                <span>
                  <strong className="text-foreground">Temporary footage:</strong> Once debris is
                  tipped at the management site, the evidence is permanently destroyed. No one can
                  prove what was inside.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-red-500" />
                <span>
                  <strong className="text-foreground">Repayments after audits:</strong> When FEMA
                  and government auditors review records years later, missing proof can lead to
                  repayment demands that strain county budgets.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-red-500" />
                <span>
                  <strong className="text-foreground">
                    Multi-million dollar monitoring bills:
                  </strong>{" "}
                  Jurisdictions spend hundreds of thousands of dollars just staffing towers, yet
                  still face disputes and over-billing.
                </span>
              </li>
            </ul>
          </div>

          {/* LoadTruth Solution Card */}
          <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-brand)]/35 bg-[var(--color-bg)] p-6 sm:p-7 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                <CheckCircle2Icon size={19} />
              </span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
                  The LoadTruth Approach
                </span>
                <h3 className="text-[17px] font-semibold text-foreground">
                  Video-backed load tickets
                </h3>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              LoadTruth adds saved truck footage, AI estimates from several video frames, and
              consistent calculations to the review:
            </p>
            <ul className="space-y-3 text-[13px] text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>
                  <strong className="text-foreground">Video saved with the ticket:</strong> Footage
                  is stored with a digital fingerprint to help detect changes, plus selected images
                  and review outlines.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>
                  <strong className="text-foreground">Truck outlines and AI estimates:</strong>{" "}
                  Outlines follow the truck, bed, and load. AI estimates fill from selected frames,
                  reads the truck number, and identifies the material.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>
                  <strong className="text-foreground">
                    Consistent volume calculations &amp; checks:
                  </strong>{" "}
                  Certified truck capacity × the middle fill estimate gives estimated cubic yards.
                  Rules flag trucks without certification and loads above registered capacity.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>
                  <strong className="text-foreground">Records for audit review:</strong> Monitors
                  check flagged tickets and raise a dispute when needed. Clean tickets are
                  finalized automatically, and reports include the ticket and supporting footage.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Big Numbers / Stats Band (Millions & Billions) */}
        <div className="mt-14">
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
              Scale &amp; Exposure
            </span>
            <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Disaster Debris by the Numbers
            </h3>
            <p className="text-[13px] text-muted-foreground">
              Official figures documenting the multi-billion-dollar scale and recurring audit
              vulnerabilities across major disaster operations.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            {STATS_DATA.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5 transition-all hover:border-[var(--color-border-strong)] hover:shadow-xs"
              >
                <div>
                  <span
                    className="text-lg font-extrabold tracking-tight sm:text-xl"
                    style={{ color: s.color }}
                  >
                    {s.value}
                  </span>
                  <p className="mt-1 text-[11px] font-medium leading-snug text-muted-foreground">
                    {s.label}
                  </p>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--color-brand)] group-hover:underline">
                  {s.sourceName}
                  <ArrowUpRightIcon size={11} />
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* Sourced Case Studies */}
        <div className="mt-14">
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
              Primary Evidence
            </span>
            <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Sourced Case Studies: Why Oversight Matters
            </h3>
            <p className="text-[13px] text-muted-foreground">
              Every case below links directly to government audit reports, court decisions, and
              municipal records.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CASE_STUDIES.map((c) => (
              <a
                key={c.title}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 transition-all hover:border-[var(--color-border-strong)] hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xl font-extrabold tabular-nums tracking-tight"
                    style={{ color: c.color }}
                  >
                    {c.stat}
                  </span>
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                    {c.badge}
                  </span>
                </div>
                <h4 className="text-[14px] font-semibold leading-snug text-foreground group-hover:text-[var(--color-brand)]">
                  {c.title}
                </h4>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">{c.body}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[11.5px] font-medium text-[var(--color-brand)]">
                  <span>Source: {c.source}</span>
                  <ExternalLinkIcon
                    size={12}
                    className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </span>
              </a>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-4 text-[12px] leading-relaxed text-muted-foreground">
            <p>
              <strong className="font-semibold text-foreground">Regulatory Sourcing Note:</strong>{" "}
              Figures and data above are cited from official government reports (FEMA, DHS Office of
              Inspector General, US Department of Justice, and municipal dockets). They demonstrate
              the scale and known audit failure modes of disaster debris operations. LoadTruth is
              designed to follow procedures established in the{" "}
              <a
                href="https://www.fema.gov/sites/default/files/documents/fema_debris-monitoring-guide_sop_3-01-2021.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                FEMA Debris Monitoring Guide (SOP 3-01-2021)
              </a>{" "}
              and 2 CFR Part 200, generating evidence-backed drafts while certified human monitors
              retain official authority.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const STAGES: { n: number; title: string; body: string; icon: React.ReactNode }[] = [
  {
    n: 1,
    title: "Prepare the video",
    body: "The video is checked, given a digital fingerprint to help detect changes, and sampled into still images for analysis.",
    icon: <CameraIcon size={18} />,
  },
  {
    n: 2,
    title: "Outline the truck and load",
    body: "AI follows the truck, bed, and visible load across the video. The colored outlines support review; they do not calculate fill.",
    icon: <ScanEyeIcon size={18} />,
  },
  {
    n: 3,
    title: "Read the truck number",
    body: "AI reads the truck number from the footage and checks it against the certified truck list.",
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
    title: "Estimate how full it is",
    body: "AI estimates fill in selected still images. The system uses the middle estimate; the outlines do not affect the result.",
    icon: <GaugeIcon size={18} />,
  },
  {
    n: 6,
    title: "Identify the material",
    body: "AI identifies the load material so the right event price can be used.",
    icon: <SparklesIcon size={18} />,
  },
  {
    n: 7,
    title: "Check and create",
    body: "Standard checks run. Fill estimate and registered capacity calculate the volume and value. Tickets with issues are sent for review.",
    icon: <ShieldCheckIcon size={18} />,
  },
];

function Anatomy() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <h2 className="text-xl font-semibold">How a clip becomes a ticket</h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
        AI reviews the video; the system combines its fill estimates, applies event prices, and runs
        checks. Clean tickets are finalized automatically; anything flagged stays visible for review.
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
    title: "Separate workspaces",
    body: "Each organization has its own events, trucks, prices, users, and footage, with access controlled by role.",
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
    body: "Review event summaries and ticket records; export CSV data or a printable audit packet ready for FEMA reviews.",
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
    title: "AI provider options",
    body: "Administrators can choose Meta or another supported AI service. Available options depend on the task and system setup.",
    icon: <SparklesIcon size={18} />,
    color: "var(--color-brand)",
  },
  {
    title: "Replay saved estimates",
    body: "Saved video estimates can be reviewed again without another AI call. The original footage and colored outlines remain available.",
    icon: <ShieldCheckIcon size={18} />,
    color: "var(--chart-5)",
  },
  {
    title: "Voice report filing",
    body: "Administrators can record a monitor's call. AI transcribes it and suggests a fill estimate or issue flags; an administrator checks the suggestions before saving. Authorized reviewers can also enter reports manually.",
    icon: <MicIcon size={18} />,
    color: "var(--color-brand)",
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
          body="See the source video and AI fill estimates together. Confirm the draft or enter the inspector's corrected estimate."
        />
        <Persona
          role="County reviewer &amp; FEMA audit reviewer"
          side="Checks the record"
          body="Review ticket amounts, flagged issues, billing summaries, and saved video in one place. Keep records ready for Federal Emergency Management Agency (FEMA) review."
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
        <h2 className="text-xl font-semibold">What the AI and calculations do</h2>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">
          AI outlines the truck and visible load, then estimates fill from selected still images.
          The system uses the middle estimate and registered truck capacity to calculate estimated
          cubic yards. Administrators can choose from the AI services enabled for their setup.
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="w-full border-t border-[var(--color-border)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-2 px-5 py-8 text-[13px] text-muted-foreground sm:px-8">
        <p>
          Fill estimates are AI-assisted; the monitor remains responsible for the final record.
          Workflow designed in alignment with Federal Emergency Management Agency (FEMA) debris
          monitoring guidelines (SOP 3-01-2021). Independent known-volume accuracy results are not
          yet published.
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
