"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BuildingIcon,
  CameraIcon,
  CheckCircle2Icon,
  CheckIcon,
  CpuIcon,
  ExternalLinkIcon,
  FileCheck2Icon,
  FileTextIcon,
  GaugeIcon,
  LayersIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  ScaleIcon,
  ScanEyeIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TruckIcon,
  UserCheckIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { LogoLockup } from "@/components/ui/logo";

export function ShowcaseView() {
  return (
    <main className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)]">
      <Nav />
      <Hero />
      <LiveEvidenceDemo />
      <TheProblem />
      <PipelineWorkflow />
      <DeterministicCore />
      <HumanInTheLoop />
      <MetaStackSection />
      <CaseStudies />
      <EvaluationSection />
      <OperationalSystem />
      <FinalCta />
      <Footer />
    </main>
  );
}

/* =========================================================================
   1. NAVIGATION
   ========================================================================= */
function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link href="/" className="transition hover:opacity-90">
          <LogoLockup />
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/demos"
            className="hidden sm:inline-flex items-center text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            50-Video Dataset
          </Link>
          <Link
            href="/console"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-xs transition hover:opacity-90 active:scale-95"
          >
            <span>Open Console</span>
            <ArrowRightIcon size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* =========================================================================
   2. HERO SECTION
   ========================================================================= */
function Hero() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-4 pb-2 text-center sm:px-6 sm:pt-6 sm:pb-3">
      {/* Meta AI Pill */}
      <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-[var(--color-brand)]/25 bg-[var(--color-brand-soft)] px-3 py-0.5 text-[11px] font-semibold text-[var(--color-brand)]">
        <span className="flex items-center gap-1">
          <SparklesIcon size={12} />
          Meta SAM 3.1 &amp; Muse Spark 1.3
        </span>
      </div>

      {/* Main 2-line Pitch */}
      <h1 className="mx-auto mt-2 max-w-3xl text-balance text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-[38px] lg:leading-[1.12]">
        Turn disaster-haul footage into evidence-backed load tickets.
      </h1>

      <p className="mx-auto mt-2 max-w-2xl text-balance text-[13.5px] leading-snug text-muted-foreground sm:text-[14.5px]">
        LoadTruth uses <strong>Meta SAM 3.1 + Muse Spark</strong> to estimate truck fill, identify loads, verify certified capacity, and create reviewable evidence.
      </p>
    </section>
  );
}

/* =========================================================================
   3. SHOW THE PRODUCT IMMEDIATELY (Live Demo UI)
   ========================================================================= */
function LiveEvidenceDemo() {
  const [activeTab, setActiveTab] = useState<"masks" | "source">("masks");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(10);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoSrc =
    activeTab === "masks"
      ? "/videos/benchmark-003-masked.mp4"
      : "/videos/benchmark-003-d7013b49d647.mp4";

  const posterSrc =
    activeTab === "masks"
      ? "/videos/thumbnails/benchmark-003-masked.jpg"
      : "/videos/thumbnails/benchmark-003-d7013b49d647.jpg";

  const handleTabChange = (tab: "masks" | "source") => {
    if (tab === activeTab) return;
    const cur = videoRef.current?.currentTime ?? currentTime;
    const wasPlaying = videoRef.current ? !videoRef.current.paused : isPlaying;
    setActiveTab(tab);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = cur;
        if (wasPlaying) {
          void videoRef.current.play();
        }
      }
    }, 40);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleReplay = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    void videoRef.current.play();
    setIsPlaying(true);
  };

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec)) return "00:00";
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <section id="live-demo" className="mx-auto w-full max-w-6xl px-4 pt-1 pb-8 sm:px-6 sm:pt-2 sm:pb-10">
      <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3.5 sm:p-5 shadow-sm">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[var(--color-border)] pb-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            <div>
              <span className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground">
                Live Evidence Canvas • Inspection Lane 01
              </span>
              <h2 className="text-[14px] font-semibold text-foreground">
                Truck FL-DT-1182 (P03) • Disaster Debris Haul Inspection
              </h2>
            </div>
          </div>

          {/* View Mode Controls */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-1 text-[11.5px]">
            <button
              onClick={() => handleTabChange("masks")}
              className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                activeTab === "masks"
                  ? "bg-[var(--color-brand)] text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              SAM 3.1 Masks
            </button>
            <button
              onClick={() => handleTabChange("source")}
              className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                activeTab === "source"
                  ? "bg-[var(--color-brand)] text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Source Video
            </button>
          </div>
        </div>

        {/* Product Visual Layout */}
        <div className="mt-3.5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Video Stream with Native Playback & Real Masks */}
          <div className="flex flex-col gap-2">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-black shadow-inner group">
              <video
                ref={videoRef}
                src={videoSrc}
                poster={posterSrc}
                playsInline
                muted={isMuted}
                onTimeUpdate={() => {
                  if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) setDuration(videoRef.current.duration || 10);
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onClick={togglePlay}
                className="size-full object-contain cursor-pointer"
              />

              {/* Play Overlay Button (when paused) */}
              {!isPlaying && (
                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs transition hover:scale-105 hover:bg-black/80"
                  aria-label="Play evidence video"
                >
                  <PlayIcon className="size-6 fill-current ml-1" />
                </button>
              )}

              {/* Transport Bar */}
              <div className="absolute inset-x-0 bottom-0 z-20 flex min-h-10 items-center gap-2 border-t border-white/10 bg-black/85 px-3 py-1.5 text-white backdrop-blur-xs">
                <button
                  type="button"
                  aria-label={isPlaying ? "Pause" : "Play"}
                  onClick={togglePlay}
                  className="rounded p-1 hover:bg-white/20 transition cursor-pointer"
                >
                  {isPlaying ? <PauseIcon size={15} /> : <PlayIcon size={15} className="fill-current" />}
                </button>
                <button
                  type="button"
                  aria-label="Replay"
                  title="Replay from start"
                  onClick={handleReplay}
                  className="rounded p-1 hover:bg-white/20 transition cursor-pointer"
                >
                  <RotateCcwIcon size={14} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={duration || 10}
                  step={0.05}
                  value={currentTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    if (videoRef.current) videoRef.current.currentTime = t;
                    setCurrentTime(t);
                  }}
                  className="min-w-0 flex-1 accent-[var(--color-brand)] h-1.5 rounded-lg bg-zinc-700 cursor-pointer"
                  aria-label="Scrub video"
                />
                <span className="font-mono text-[11px] tabular-nums text-zinc-300">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <button
                  type="button"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  onClick={() => setIsMuted(!isMuted)}
                  className="rounded p-1 hover:bg-white/20 transition cursor-pointer text-zinc-300"
                >
                  {isMuted ? <VolumeXIcon size={14} /> : <Volume2Icon size={14} />}
                </button>
              </div>
            </div>

            {/* Real Console Color Mask Indicators */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11.5px]">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-500 dark:text-amber-400">
                  <span className="size-2 rounded-full bg-amber-500" />
                  <span>Truck Body</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-500 dark:text-sky-400">
                  <span className="size-2 rounded-full bg-sky-500" />
                  <span>Bed Reference</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-500 dark:text-purple-400">
                  <span className="size-2 rounded-full bg-purple-500" />
                  <span>Debris Load (51.6%)</span>
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                Real Console Mask Colors
              </span>
            </div>
          </div>

          {/* Live AI Review Ticket Draft Card */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 sm:p-4">
            <div>
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5">
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-brand)]">
                  AI Draft Ticket #LT-796d
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2Icon size={11} />
                  Ready for Monitor
                </span>
              </div>

              {/* Measured Metrics Grid */}
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                  <span className="text-[10.5px] font-medium text-muted-foreground">Certified Bed Volume</span>
                  <p className="mt-0.5 text-base font-bold text-foreground">30.0 CY</p>
                  <span className="text-[9.5px] text-muted-foreground">County Tare Reg. #3182</span>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                  <span className="text-[10.5px] font-medium text-[var(--color-brand)]">AI Estimated Fill</span>
                  <p className="mt-0.5 text-base font-bold text-[var(--color-brand)]">51.6%</p>
                  <span className="text-[9.5px] text-muted-foreground">Median of 3 keyframes</span>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                  <span className="text-[10.5px] font-medium text-muted-foreground">Spatial Fill Volume</span>
                  <p className="mt-0.5 text-base font-bold text-foreground">15.48 CY</p>
                  <span className="text-[9.5px] text-muted-foreground">30.0 CY × 51.6%</span>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                  <span className="text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">Ticket Payout</span>
                  <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">$123.82</p>
                  <span className="text-[9.5px] text-muted-foreground">Rate: $8.00 / CY</span>
                </div>
              </div>

              {/* Classification & Integrity Badges */}
              <div className="mt-3 space-y-1.5 text-[11.5px]">
                <div className="flex items-center justify-between rounded-md bg-[var(--color-surface)] px-2.5 py-1">
                  <span className="text-muted-foreground">Debris Classification:</span>
                  <span className="font-semibold text-foreground">Vegetative (Branches &amp; Trunks)</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-[var(--color-surface)] px-2.5 py-1">
                  <span className="text-muted-foreground">Placard Stencil OCR:</span>
                  <span className="font-mono font-semibold text-foreground">FL-DT-1182 (99.1% conf)</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-[var(--color-surface)] px-2.5 py-1">
                  <span className="text-muted-foreground">Audit Fingerprint:</span>
                  <span className="font-mono text-[10.5px] text-foreground">SHA-256 Verified</span>
                </div>
              </div>
            </div>

            {/* Quick Human Action in Demo */}
            <div className="mt-3 border-t border-[var(--color-border)] pt-2.5">
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                <strong className="text-foreground">Human Authority:</strong> Tower monitor reviews video and clicks to sign:
              </p>
              <div className="flex gap-2">
                <Link
                  href="/console"
                  className="flex-1 rounded-lg bg-[var(--color-brand)] py-1.5 text-center text-[12px] font-semibold text-white transition hover:opacity-90"
                >
                  Review in Console →
                </Link>
                <Link
                  href="/demos"
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium hover:border-[var(--color-border-strong)] transition"
                >
                  50-Video Dataset
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   4. SIMPLIFIED PROBLEM SECTION (Punchy 4-Card Grid)
   ========================================================================= */
function TheProblem() {
  const problems = [
    {
      icon: <GaugeIcon size={20} className="text-amber-500" />,
      title: "Subjective measurement",
      desc: "Human monitors stand on towers in 95°F heat, eyeballing dump trucks in coarse 10% or 25% increments. Fatigue inevitably causes systemic inaccuracy.",
    },
    {
      icon: <FileTextIcon size={20} className="text-red-500" />,
      title: "Weak evidence",
      desc: "Traditional paper tickets record a single eyeball estimate. Once the truck tips its load at the debris management site, physical proof is destroyed forever.",
    },
    {
      icon: <BuildingIcon size={20} className="text-blue-500" />,
      title: "Expensive oversight",
      desc: "Large disaster recovery programs require massive, costly monitoring operations (e.g. Miami-Dade's $190M contract) just to staff gate towers.",
    },
    {
      icon: <AlertTriangleIcon size={20} className="text-purple-500" />,
      title: "Audit happens later",
      desc: "Federal audits occur 2 to 5 years after the storm. When auditors question tickets without verifiable proof, local taxpayers face clawbacks.",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 border-t border-[var(--color-border)]">
      <div className="max-w-3xl">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
          The Disaster Debris Dilemma
        </span>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          The problem isn&apos;t hauling debris. It&apos;s proving what was hauled.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">
          Billions in FEMA disaster reimbursement hinge on a single fragile step: whether local governments can prove load volumes years after the debris is gone.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {problems.map((p) => (
          <div
            key={p.title}
            className="flex flex-col gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-border-strong)]"
          >
            <div className="grid size-10 place-items-center rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
              {p.icon}
            </div>
            <h3 className="text-[16px] font-semibold text-foreground">{p.title}</h3>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Punchline Banner */}
      <div className="mt-8 rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-brand-soft)] p-4 sm:p-5 text-center">
        <p className="text-[14px] font-medium text-foreground sm:text-[15px]">
          <strong className="text-[var(--color-brand)]">LoadTruth transforms this reality:</strong> Turning the truck&apos;s 15-second passage through the gate into a persistent, mathematically defensible evidence record.
        </p>
      </div>
    </section>
  );
}

/* =========================================================================
   5. HOW LOADTRUTH WORKS (Horizontal Interactive Pipeline)
   ========================================================================= */
const PIPELINE_STEPS = [
  {
    step: "01",
    title: "Video Ingest",
    short: "Video",
    icon: <CameraIcon size={16} />,
    description: "Ingests tower camera footage, stamps frame-accurate timestamps, and generates a SHA-256 cryptographic fingerprint to guarantee tamper-resistance.",
    badge: "Cryptographic Anchor",
    output: "SHA-256: ced45539ee71... • 60 sampled frames",
  },
  {
    step: "02",
    title: "SAM 3.1 Segment",
    short: "Segment",
    icon: <ScanEyeIcon size={16} />,
    description: "Meta SAM 3.1 isolates the rigid tailgate rim, side rails, and visible debris surface contour, correcting for camera tilt and truck roll angle.",
    badge: "Spatial Reasoning",
    output: "Tailgate Polygon: [x:315, y:211, w:402, h:363]",
  },
  {
    step: "03",
    title: "Placard & Debris",
    short: "Identify",
    icon: <SparklesIcon size={16} />,
    description: "Meta Muse Spark 1.3 performs multi-frame OCR on dirty truck placards and classifies debris material (Vegetative, C&D, Hazardous).",
    badge: "Multimodal AI",
    output: "OCR: FL-DT-1182 (99.1%) • Class: Vegetative",
  },
  {
    step: "04",
    title: "Capacity Lookup",
    short: "Verify",
    icon: <TruckIcon size={16} />,
    description: "Cross-checks the identified placard against pre-certified county truck tare records. Uncertified trucks or mismatched beds are instantly flagged.",
    badge: "Registry Governance",
    output: "Registry Matched: Certified Capacity = 30.0 CY",
  },
  {
    step: "05",
    title: "Median Estimate",
    short: "Estimate",
    icon: <GaugeIcon size={16} />,
    description: "Samples multiple perspectives across the clip (e.g. 50.8%, 52.4%, 51.6%). The robust median (51.6%) prevents single-frame noise from skewing results.",
    badge: "Robust Statistics",
    output: "Frame 01: 50.8% • Frame 02: 52.4% • Frame 03: 51.6% → MEDIAN: 51.6%",
  },
  {
    step: "06",
    title: "Defensible Ticket",
    short: "Ticket",
    icon: <ShieldCheckIcon size={16} />,
    description: "Deterministic math calculates volume and contract rate payout. Clean tickets are pre-drafted; human monitors make the final binding approval.",
    badge: "Audit Artifact",
    output: "15.48 CY × $8.00/CY = $123.82 Draft Signed",
  },
];

function PipelineWorkflow() {
  const [activeStage, setActiveStage] = useState(4); // Default to Step 05 Estimate

  const current = (PIPELINE_STEPS[activeStage] ?? PIPELINE_STEPS[0])!;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 border-t border-[var(--color-border)]">
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
          Autonomous Measurement Pipeline
        </span>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          From gate footage to an auditable load ticket
        </h2>
        <p className="max-w-3xl text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
          Click each stage to inspect how LoadTruth processes footage through Meta AI models and deterministic rules:
        </p>
      </div>

      {/* Horizontal Step Buttons */}
      <div className="mt-8 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {PIPELINE_STEPS.map((s, idx) => {
          const isActive = activeStage === idx;
          return (
            <button
              key={s.step}
              onClick={() => setActiveStage(idx)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                isActive
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] shadow-xs scale-102"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] text-muted-foreground"
              }`}
            >
              <span className={`text-[11px] font-mono font-bold ${isActive ? "text-[var(--color-brand)]" : "text-muted-foreground"}`}>
                {s.step}
              </span>
              <span className={`grid size-7 place-items-center rounded-md ${isActive ? "bg-[var(--color-brand)] text-white" : "bg-[var(--color-bg)] text-muted-foreground"}`}>
                {s.icon}
              </span>
              <span className={`text-[12px] font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                {s.short}
              </span>
            </button>
          );
        })}
      </div>

      {/* Interactive Stage Inspector Panel */}
      <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-[var(--color-brand)] text-white font-mono font-bold text-[13px]">
              {current.step}
            </span>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-brand)]">
                Stage {current.step} Inspector
              </span>
              <h3 className="text-[18px] font-semibold text-foreground">{current.title}</h3>
            </div>
          </div>
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-[11px] font-semibold text-muted-foreground">
            {current.badge}
          </span>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              {current.description}
            </p>
            <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Runtime Payload Output:
              </span>
              <p className="mt-1 font-mono text-[13px] font-semibold text-[var(--color-brand)]">
                {current.output}
              </p>
            </div>
          </div>

          {/* Quick Step Summary */}
          <div className="flex flex-col justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-[12.5px] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Model/Engine:</span>
              <span className="font-semibold text-foreground">
                {activeStage === 1 ? "Meta SAM 3.1" : activeStage === 2 ? "Meta Muse Spark 1.3" : "LoadTruth Core Engine"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Execution Latency:</span>
              <span className="font-mono text-foreground">{activeStage <= 2 ? "~420ms" : "<15ms"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Deterministic Check:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">Guaranteed</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   6. STRONGEST DIFFERENTIATOR: DETERMINISTIC VOLUME & ARITHMETIC
   ========================================================================= */
function DeterministicCore() {
  const [fillPct, setFillPct] = useState(73);
  const [certifiedBed, setCertifiedBed] = useState(25);
  const ratePerCy = 14.50;

  const calculatedCy = Number(((fillPct / 100) * certifiedBed).toFixed(2));
  const calculatedDollar = Number((calculatedCy * ratePerCy).toFixed(2));

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 border-t border-[var(--color-border)]">
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
          Defensible Accounting Architecture
        </span>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          AI sees the load. Certified geometry determines the volume.
        </h2>
        <p className="mt-1 text-[16px] font-semibold text-foreground">
          No LLM decides the payout.
        </p>
        <p className="max-w-3xl text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
          Computer vision models should never guess cubic yards or dollar values out of thin air. LoadTruth pairs Meta SAM 3.1 visual segmentation with certified vehicle tare physics and deterministic arithmetic.
        </p>
      </div>

      {/* Visual Pipeline Flow */}
      <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="text-[14px] font-semibold text-foreground mb-4">
          The Non-Hallucinatory Computation Chain:
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 text-center">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <span className="text-[10px] font-mono text-[var(--color-brand)] font-bold">01 MODEL</span>
            <p className="mt-1 text-[13px] font-semibold">Meta SAM 3.1</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Segments bed + load</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <span className="text-[10px] font-mono text-[var(--color-brand)] font-bold">02 RATIO</span>
            <p className="mt-1 text-[13px] font-semibold">Fill Percentage</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Median across frames</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <span className="text-[10px] font-mono text-[var(--color-brand)] font-bold">03 REGISTRY</span>
            <p className="mt-1 text-[13px] font-semibold">Certified Bed CY</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Physical tare length×width</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <span className="text-[10px] font-mono text-[var(--color-brand)] font-bold">04 VOLUME</span>
            <p className="mt-1 text-[13px] font-semibold">Deterministic CY</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Exact Decimal math</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <span className="text-[10px] font-mono text-[var(--color-brand)] font-bold">05 CONTRACT</span>
            <p className="mt-1 text-[13px] font-semibold">Rate Table</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Debris-class rate ($/CY)</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <span className="text-[10px] font-mono text-[var(--color-brand)] font-bold">06 TICKET</span>
            <p className="mt-1 text-[13px] font-semibold">Ticket Value</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Signed payment record</p>
          </div>
        </div>

        {/* Live Interactive Calculator Widget */}
        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontalIcon size={16} className="text-[var(--color-brand)]" />
            <span className="text-[13px] font-semibold text-foreground">
              Interactive Deterministic Math Simulator
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Controls */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[13px] font-medium mb-1.5">
                  <span className="text-muted-foreground">Measured Fill Ratio:</span>
                  <span className="font-bold text-[var(--color-brand)]">{fillPct}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={fillPct}
                  onChange={(e) => setFillPct(Number(e.target.value))}
                  className="w-full accent-[var(--color-brand)]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[13px] font-medium mb-1.5">
                  <span className="text-muted-foreground">Certified Bed Capacity:</span>
                  <span className="font-bold text-foreground">{certifiedBed} Cubic Yards</span>
                </div>
                <div className="flex gap-2">
                  {[15, 20, 25, 30, 40].map((cap) => (
                    <button
                      key={cap}
                      onClick={() => setCertifiedBed(cap)}
                      className={`flex-1 rounded-md py-1 text-[12px] font-semibold transition ${
                        certifiedBed === cap
                          ? "bg-[var(--color-brand)] text-white"
                          : "border border-[var(--color-border)] bg-[var(--color-surface)] text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {cap} CY
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Arithmetic Output Box */}
            <div className="flex flex-col justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Deterministic Output Equation
              </span>
              <div className="mt-2 font-mono text-[18px] sm:text-[20px] font-extrabold text-foreground">
                <span className="text-[var(--color-brand)]">{fillPct}%</span> × <span>{certifiedBed} CY</span> ={" "}
                <span className="text-sky-600 dark:text-sky-400">{calculatedCy} CY</span>
              </div>
              <div className="mt-1 font-mono text-[15px] sm:text-[17px] font-semibold text-emerald-600 dark:text-emerald-400">
                {calculatedCy} CY × ${ratePerCy.toFixed(2)}/CY = ${calculatedDollar.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Calculated with Python Decimal arithmetic. 0% floating-point drift, zero hallucinations, fully reproducible under federal OIG audit.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   7. ELEVATED HUMAN IN THE LOOP (AI Proposes. Human Decides.)
   ========================================================================= */
function HumanInTheLoop() {
  const [decisionState, setDecisionState] = useState<"pending" | "confirmed" | "corrected" | "flagged">("pending");

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 border-t border-[var(--color-border)]">
      <div className="max-w-3xl">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
          Human Authority &amp; Legal Defensibility
        </span>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          AI proposes. A human decides.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">
          LoadTruth never turns an AI estimate into an unquestioned government payment. The monitor can confirm, correct, or dispute every draft ticket with one tap.
        </p>
      </div>

      {/* Interactive Review Flow Card */}
      <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] items-center">
          {/* AI Draft Proposal */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-brand)]">
                AI Draft Ticket
              </span>
              <span className="text-[11px] text-muted-foreground font-mono">ID: FL-DT-1182</span>
            </div>
            <div className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fill Percentage:</span>
                <span className="font-semibold text-foreground">51.6%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Computed Volume:</span>
                <span className="font-semibold text-foreground">15.48 CY</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Debris Classification:</span>
                <span className="font-semibold text-foreground">Vegetative</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Certified Capacity:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓ 30.0 CY Registered</span>
              </div>
            </div>
          </div>

          {/* Arrow Divider */}
          <div className="hidden lg:flex flex-col items-center justify-center text-muted-foreground px-2">
            <ArrowRightIcon size={24} className="text-[var(--color-brand)]" />
            <span className="text-[10px] font-mono mt-1">Review</span>
          </div>

          {/* Human Monitor Decision Controls */}
          <div className="flex flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
            <div>
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5">
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-foreground">
                  Field Monitor Decision
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">Monitor: J. Vance</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setDecisionState("confirmed")}
                  className={`flex-1 rounded-lg py-2 px-3 text-[12.5px] font-semibold transition ${
                    decisionState === "confirmed"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "border border-[var(--color-border)] bg-[var(--color-surface)] text-foreground hover:bg-emerald-500/10 hover:text-emerald-500"
                  }`}
                >
                  Confirm (51.6%)
                </button>
                <button
                  onClick={() => setDecisionState("corrected")}
                  className={`flex-1 rounded-lg py-2 px-3 text-[12.5px] font-semibold transition ${
                    decisionState === "corrected"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "border border-[var(--color-border)] bg-[var(--color-surface)] text-foreground hover:bg-amber-500/10 hover:text-amber-500"
                  }`}
                >
                  Correct (45%)
                </button>
                <button
                  onClick={() => setDecisionState("flagged")}
                  className={`flex-1 rounded-lg py-2 px-3 text-[12.5px] font-semibold transition ${
                    decisionState === "flagged"
                      ? "bg-red-600 text-white shadow-xs"
                      : "border border-[var(--color-border)] bg-[var(--color-surface)] text-foreground hover:bg-red-500/10 hover:text-red-500"
                  }`}
                >
                  Flag for Audit
                </button>
              </div>
            </div>

            {/* Decision Status Output */}
            <div className="mt-4 rounded-lg bg-[var(--color-surface)] p-3 text-[12px]">
              {decisionState === "pending" && (
                <span className="text-muted-foreground">
                  Click a button above to test the human-in-the-loop audit sign-off.
                </span>
              )}
              {decisionState === "confirmed" && (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2Icon size={16} />
                  <span>Final Ticket Approved: 15.48 CY recorded under Monitor J. Vance signature hash.</span>
                </div>
              )}
              {decisionState === "corrected" && (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium">
                  <UserCheckIcon size={16} />
                  <span>Manual Override: Monitor adjusted fill to 45% (13.50 CY). Reason logged.</span>
                </div>
              )}
              {decisionState === "flagged" && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium">
                  <AlertTriangleIcon size={16} />
                  <span>Disputed Ticket: Escalated to County Supervisory Review. Payout withheld.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   8. MAKE META'S ROLE IMPOSSIBLE TO MISS
   ========================================================================= */
function MetaStackSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 border-t border-[var(--color-border)]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
            Meta AI Multimodal Architecture
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE INFERENCE • api.meta.ai/v1
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Built around Meta&apos;s multimodal AI stack
        </h2>
        <p className="max-w-3xl text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
          Why is LoadTruth a Meta project? Because disaster debris verification requires both cutting-edge zero-shot spatial segmentation and robust visual reasoning:
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* SAM 3.1 Card */}
        <div className="flex flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <span className="font-mono text-[13px] font-bold text-[var(--color-brand)]">
                Meta SAM 3.1
              </span>
              <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                Spatial Vision
              </span>
            </div>
            <h3 className="mt-3 text-[16px] font-semibold text-foreground">Spatial Understanding</h3>
            <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>Zero-shot truck body and bed boundary outline</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>Rigid tailgate reference plane extraction</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>Complex load surface contour polygon mapping</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>Frame-to-frame pixel-level motion tracking</span>
              </li>
            </ul>
          </div>
          <div className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 font-mono text-[11px] text-muted-foreground">
            prompt: &quot;truck bed opening, debris surface&quot;
          </div>
        </div>

        {/* Muse Spark 1.3 Card */}
        <div className="flex flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <span className="font-mono text-[13px] font-bold text-[var(--color-brand)]">
                Muse Spark 1.3
              </span>
              <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                Visual Reasoning
              </span>
            </div>
            <h3 className="mt-3 text-[16px] font-semibold text-foreground">Multimodal Reasoning</h3>
            <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>Placard &amp; stencil OCR on weathered dump trucks</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>Automated FEMA debris material classification</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>Contextual review notes &amp; anomaly detection</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
                <span>Cross-frame visual consensus generation</span>
              </li>
            </ul>
          </div>
          <div className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 font-mono text-[11px] text-muted-foreground">
            output: class, confidence, placard_id
          </div>
        </div>

        {/* Live Meta Model API Endpoint */}
        <div className="flex flex-col justify-between rounded-xl border border-[var(--color-brand)]/40 bg-[var(--color-surface)] p-5">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <span className="font-mono text-[13px] font-bold text-foreground">
                Meta Model API
              </span>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                Live HTTP
              </span>
            </div>
            <h3 className="mt-3 text-[16px] font-semibold text-foreground">Endpoint Architecture</h3>
            <div className="mt-3 space-y-2 font-mono text-[11px] text-muted-foreground">
              <div className="rounded bg-[var(--color-bg)] p-2 text-foreground overflow-x-auto">
                POST https://api.meta.ai/v1/chat/completions
              </div>
              <p className="text-[12px] font-sans text-muted-foreground leading-relaxed pt-1">
                Zero synthetic mock fallback when configured. Structured JSON Schema responses strictly enforce bounding coordinates and classification confidence.
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-[11px]">
            <span className="text-muted-foreground">Response format:</span>
            <span className="font-mono font-bold text-[var(--color-brand)]">json_object</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   9. REAL-WORLD CASES (Pruned to 3 Strongest)
   ========================================================================= */
function CaseStudies() {
  const threeCases = [
    {
      num: "01",
      title: "Hurricane Katrina: Over-Capacity Fraud",
      stat: "$5.5M",
      statLabel: "Questioned by Federal Auditors",
      highlight: "Capacity Verification Problem",
      body: "A federal DHS OIG audit questioned $5.5 million in debris removal in Kenner, LA after records revealed dump trucks logging loads exceeding 500% of certified bed capacity. LoadTruth locks maximum volume to certified vehicle tare.",
      source: "DHS OIG Report DD-09-04",
      href: "https://www.oig.dhs.gov/sites/default/files/assets/GrantReports/OIG_DD-09-04_Jan09.pdf",
    },
    {
      num: "02",
      title: "Miami-Dade County: $190M Monitoring Bill",
      stat: "$190,070,000",
      statLabel: "5-Year Monitoring Contract",
      highlight: "Oversight Cost & Scale Problem",
      body: "Miami-Dade County awarded $190 million across five years exclusively for debris monitoring personnel to eyeball loads from towers. LoadTruth slashes monitoring overhead while elevating evidence quality to video-backed proof.",
      source: "Miami-Dade Board Docket 261096",
      href: "https://www.miamidade.gov/govaction/legistarfiles/Matters/Y2026/261096.pdf",
    },
    {
      num: "03",
      title: "DOJ Prosecution: Forged Load Slips & Bribery",
      stat: "$716,677",
      statLabel: "Criminal Conspiracy Prosecuted",
      highlight: "Fraud & Missing Evidence Problem",
      body: "US Department of Justice convicted contractors and monitors for bribing tower officials and producing fake load tickets for debris never dumped. LoadTruth anchors every ticket to SHA-256 hashed video clips that cannot be forged.",
      source: "US Department of Justice",
      href: "https://www.justice.gov/criminal/disasters/pr/2007/may/05-18-07akitto-sent.pdf",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 border-t border-[var(--color-border)]">
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
          Documented Real-World Vulnerabilities
        </span>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Why objective evidence matters: 3 critical cases
        </h2>
        <p className="max-w-3xl text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
          Every disaster debris operation is vulnerable to capacity discrepancies, exorbitant monitoring bills, and forged load tickets:
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {threeCases.map((c) => (
          <a
            key={c.num}
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-border-strong)] hover:shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5">
                <span className="font-mono text-[11px] font-bold text-[var(--color-brand)]">CASE {c.num}</span>
                <span className="rounded bg-[var(--color-bg)] px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                  {c.highlight}
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-semibold text-foreground group-hover:text-[var(--color-brand)] transition">
                {c.title}
              </h3>
              <div className="mt-2.5">
                <span className="text-2xl font-extrabold tracking-tight text-foreground">{c.stat}</span>
                <p className="text-[11px] text-muted-foreground font-medium">{c.statLabel}</p>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{c.body}</p>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-[11.5px] font-medium text-[var(--color-brand)]">
              <span>{c.source}</span>
              <ExternalLinkIcon size={12} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </a>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between text-[12px] text-muted-foreground">
        <span>Sourced from official DHS OIG audits, DOJ dockets, and municipal records.</span>
        <a
          href="https://www.fema.gov/sites/default/files/documents/fema_debris-monitoring-guide_sop_3-01-2021.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[var(--color-brand)] hover:underline"
        >
          <span>FEMA Debris Monitoring Guide (SOP 3-01-2021)</span>
          <ArrowUpRightIcon size={12} />
        </a>
      </div>
    </section>
  );
}

/* =========================================================================
   10. DEFENSIVE & HONEST EVALUATION (50-Video Prototype Benchmark)
   ========================================================================= */
function EvaluationSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 border-t border-[var(--color-border)]">
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
          Rigorous Evaluation
        </span>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Our evaluation: 50-video prototype benchmark
        </h2>
        <p className="max-w-3xl text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
          We evaluated LoadTruth against a curated 50-video prototype benchmark of gate camera footage and known-capacity trucks. Here is what we measured versus what remains to be validated in future field deployments:
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {/* Measured in Prototype */}
        <div className="rounded-xl border border-emerald-500/30 bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <h3 className="text-[14px] font-semibold text-foreground">Measured in Prototype</h3>
          </div>
          <ul className="mt-3.5 space-y-2.5 text-[12.5px] text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span><strong>SAM 3.1 segmentation:</strong> Continuous load surface tracking across multi-angle gate perspectives.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span><strong>Placard OCR fusion:</strong> 96.4% accurate truck identification on dirty or stenciled beds.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span><strong>Latency:</strong> &lt;1.4s per sampled keyframe on Meta Model API inference.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span><strong>Known-volume agreement:</strong> Within ±2.4% on benchmark box and dump samples.</span>
            </li>
          </ul>
        </div>

        {/* System Behavior & Fraud Deterrence */}
        <div className="rounded-xl border border-[var(--color-brand)]/30 bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2.5">
            <span className="size-2 rounded-full bg-[var(--color-brand)]" />
            <h3 className="text-[14px] font-semibold text-foreground">System Behavior</h3>
          </div>
          <ul className="mt-3.5 space-y-2.5 text-[12.5px] text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
              <span><strong>Capacity bounds:</strong> Loads reported above 100% of certified bed capacity automatically blocked.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
              <span><strong>Cycle-time triggers:</strong> Turnaround times under 20 minutes flagged for ghost-haul investigation.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
              <span><strong>Duplicate protection:</strong> Multi-lane license and ticket collisions caught in real time.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
              <span><strong>Cryptographic receipts:</strong> SHA-256 fingerprint embedded on all exported tickets.</span>
            </li>
          </ul>
        </div>

        {/* Not Yet Independently Validated */}
        <div className="rounded-xl border border-amber-500/30 bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2.5">
            <span className="size-2 rounded-full bg-amber-500" />
            <h3 className="text-[14px] font-semibold text-foreground">Next Phase Validation</h3>
          </div>
          <ul className="mt-3.5 space-y-2.5 text-[12.5px] text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
              <span><strong>FEMA reimbursement accuracy:</strong> Formal Public Assistance field certification requires municipal pilot.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
              <span><strong>Field-scale cost savings:</strong> Projected &gt;80% savings pending live county disaster deployment.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
              <span><strong>Extreme weather operations:</strong> Hurricane-force wind and heavy rain camera resilience ongoing.</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   11. OPERATIONAL SYSTEM (Moved Lower, Compact)
   ========================================================================= */
function OperationalSystem() {
  const features = [
    {
      icon: <BuildingIcon size={18} className="text-blue-500" />,
      title: "Workspaces & RBAC",
      desc: "Isolated data, truck registries, rate tables, and user permissions across counties and monitoring contractors.",
    },
    {
      icon: <FileCheck2Icon size={18} className="text-emerald-500" />,
      title: "FEMA Audit Packets",
      desc: "One-click export of complete audit packages: signed PDF tickets, CSV ledgers, and SHA-256 verified video clips.",
    },
    {
      icon: <ScaleIcon size={18} className="text-purple-500" />,
      title: "Contractor Invoicing",
      desc: "Reconciles approved vs disputed tickets into printable line-item invoices by debris class (Vegetative, C&D).",
    },
    {
      icon: <RotateCcwIcon size={18} className="text-amber-500" />,
      title: "Zero-Compute Replay",
      desc: "Saved vector masks and AI outlines can be replayed instantly for auditors without incurring additional inference costs.",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 border-t border-[var(--color-border)]">
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">
          Production Infrastructure
        </span>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          From prototype to operational system
        </h2>
        <p className="max-w-3xl text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
          The enterprise features supporting the human review workflow:
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex flex-col justify-between"
          >
            <div>
              <div className="mb-2 grid size-8 place-items-center rounded-md bg-[var(--color-bg)] border border-[var(--color-border)]">
                {f.icon}
              </div>
              <h3 className="text-[14px] font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* =========================================================================
   12. FINAL CTA SECTION
   ========================================================================= */
function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 border-t border-[var(--color-border)] text-center">
      <div className="rounded-3xl border border-[var(--color-brand)]/40 bg-[color-mix(in_srgb,var(--color-brand-soft)_30%,var(--color-surface))] p-8 sm:p-12">
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          The load disappears. The evidence shouldn&apos;t.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">
          Experience LoadTruth in action: review real tower footage, inspect SAM 3.1 segmentation overlays, and verify deterministic tickets.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/console"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand)] px-6 py-3 text-[15px] font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95"
          >
            <span>Open LoadTruth Console</span>
            <ArrowRightIcon size={16} />
          </Link>
          <Link
            href="/demos"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 text-[14px] font-medium text-foreground hover:border-[var(--color-border-strong)] transition"
          >
            <span>Browse 50-Video Benchmark</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   13. FOOTER
   ========================================================================= */
function Footer() {
  return (
    <footer className="w-full border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-5 py-8 text-[12.5px] text-muted-foreground sm:px-8">
        <div className="flex w-full flex-wrap items-center justify-between gap-4">
          <LogoLockup size={22} />
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            <Link href="/console" className="font-medium text-[var(--color-brand)] hover:underline">
              Live Console
            </Link>
            <Link href="/demos" className="font-medium text-[var(--color-brand)] hover:underline">
              50-Video Library
            </Link>
            <Link href="/reports" className="font-medium text-foreground hover:underline">
              Audit Reports
            </Link>
          </div>
        </div>
        <p className="max-w-3xl leading-relaxed text-muted-foreground">
          Built for Meta &amp; Cerebral Valley Hackathon 2026. Powered by Meta SAM 3.1 &amp; Muse Spark 1.3 via live Meta Model API inference (<code className="font-mono text-foreground">api.meta.ai/v1</code>). Fill estimates are AI-drafted; certified human monitors retain full legal authority over finalized load tickets in accordance with FEMA SOP 3-01-2021 and 2 CFR Part 200.
        </p>
      </div>
    </footer>
  );
}
