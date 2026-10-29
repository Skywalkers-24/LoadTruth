"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CameraIcon,
  CheckCircle2Icon,
  Columns2Icon,
  ExternalLinkIcon,
  EyeIcon,
  LayersIcon,
  Loader2Icon,
  Maximize2Icon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  TruckIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";

import {
  demoPlayback,
  SHOWCASE_EVENT_ID,
  type DebrisClass,
  type DemoVideo,
} from "@/lib/api";
import { useTicketEvidence } from "@/lib/hooks";
import { SamPlayer } from "@/components/console/sam-player";
import { Badge } from "@/components/ui/shadcn/badge";
import { Card } from "@/components/ui/shadcn/card";

export interface BenchmarkPairDef {
  id: string;
  pairNumber: number;
  truckId: string;
  ticketId: string;
  debrisClass: DebrisClass;
  debrisLabel: string;
  debrisDescription: string;
  certifiedCubicYards: number;
  measuredFillPct: number;
  measuredCubicYards: number;
  ratePerCy: number;
  dollarValue: number;
  matchFilename: string;
  contentHash: string;
  notes: string;
  fps: number;
  resolution: string;
  lane: string;
}

export const BENCHMARK_PAIRS: BenchmarkPairDef[] = [
  {
    id: "pair-1",
    pairNumber: 1,
    truckId: "FL-DT-8043",
    ticketId: "8af7c63d-8020-5bc7-8c9c-823ddcd95970",
    debrisClass: "white_goods",
    debrisLabel: "White Goods",
    debrisDescription: "Refrigerators, washing machines & large household appliances",
    certifiedCubicYards: 16.0,
    measuredFillPct: 41.83,
    measuredCubicYards: 6.69,
    ratePerCy: 22.0,
    dollarValue: 147.25,
    matchFilename: "showcase-1.mp4",
    contentHash: "8a3c6673949fbb9f4b6d26e8efb9270690fd9254ab97c56573bc936de09ea558",
    notes:
      "Open-top haul truck entering staging lane. Meta SAM 3.1 isolates the bed boundary from metal appliance cargo, measuring 41.8% volumetric fill.",
    fps: 6.022,
    resolution: "1024 × 576",
    lane: "Lane 01 (Weigh-in Scale)",
  },
  {
    id: "pair-2",
    pairNumber: 2,
    truckId: "FL-DT-7788",
    ticketId: "ba556e1e-a844-5dcf-96b4-94ac7724f124",
    debrisClass: "hazardous",
    debrisLabel: "Hazardous Materials",
    debrisDescription: "Sealed metal chemical barrels & industrial paint cans",
    certifiedCubicYards: 20.0,
    measuredFillPct: 11.98,
    measuredCubicYards: 2.4,
    ratePerCy: 100.0,
    dollarValue: 240.0,
    matchFilename: "showcase-2.mp4",
    contentHash: "398b452b4325d4e02a5cae50a026a1b4f7bfb4c09b9eea4d2f1a1a8046130484",
    notes:
      "Low-volume containment transport. Meta SAM 3.1 identifies sparse barrels resting on bed floor, guarding against monitor over-call.",
    fps: 3.0,
    resolution: "1024 × 576",
    lane: "Lane 03 (Hazardous Check)",
  },
  {
    id: "pair-3",
    pairNumber: 3,
    truckId: "FL-DT-3391",
    ticketId: "df0e9c7b-ce86-5251-ad6d-335914200daa",
    debrisClass: "construction_demolition",
    debrisLabel: "Construction & Demolition",
    debrisDescription: "Structural lumber, broken concrete, framing timber & drywall",
    certifiedCubicYards: 20.0,
    measuredFillPct: 54.64,
    measuredCubicYards: 10.93,
    ratePerCy: 12.0,
    dollarValue: 131.14,
    matchFilename: "showcase-3.mp4",
    contentHash: "a3ba19079602dbdf381dba518fd90ea4734970e283fd580568ea31b837f7c400",
    notes:
      "High-volume structural demolition load. Meta SAM 3.1 maps dynamic irregular heap contours against side rails, computing 54.6% fill.",
    fps: 3.0,
    resolution: "1024 × 576",
    lane: "Lane 02 (Main Debris Lane)",
  },
  {
    id: "pair-4",
    pairNumber: 4,
    truckId: "FL-DT-2204",
    ticketId: "9e5b4ae9-4727-5547-bb08-c8c8eb714e5a",
    debrisClass: "vegetative",
    debrisLabel: "Vegetative Debris (Clean Sweep)",
    debrisDescription: "Empty return truck — confirmed clean bed floor",
    certifiedCubicYards: 25.0,
    measuredFillPct: 0.0,
    measuredCubicYards: 0.0,
    ratePerCy: 8.0,
    dollarValue: 0.0,
    matchFilename: "showcase-4.mp4",
    contentHash: "3e66bfed29744563adf6b5f16542cfaed9773f63f6917b9eb96ed95a4d54bf88",
    notes:
      "Returning contractor truck after disposal. Meta SAM 3.1 confirms 0.0% load fill, automatically preventing empty truck invoice billing.",
    fps: 3.0,
    resolution: "1024 × 576",
    lane: "Lane 01 (Exit & Re-entry)",
  },
  {
    id: "pair-5",
    pairNumber: 5,
    truckId: "FL-DT-3391",
    ticketId: "654d5e5f-d61c-52b8-9e1d-c6dc6c7ec110",
    debrisClass: "construction_demolition",
    debrisLabel: "Construction & Demolition",
    debrisDescription: "Roofing shingles, tarp fragments & plywood sheeting",
    certifiedCubicYards: 20.0,
    measuredFillPct: 37.85,
    measuredCubicYards: 7.57,
    ratePerCy: 12.0,
    dollarValue: 90.84,
    matchFilename: "showcase-5.mp4",
    contentHash: "968754e7cea9b1e38861cf0be414b18e89ba8aba349a287bd63da9f6a3e69e73",
    notes:
      "Low-profile roofing load recorded in twilight lighting. Meta SAM 3.1 distinguishes bed rail shadows from dark roofing asphalt piles.",
    fps: 3.0,
    resolution: "1024 × 576",
    lane: "Lane 02 (Main Debris Lane)",
  },
];

interface VideoPairCardProps {
  pair: BenchmarkPairDef;
  videoRecord?: DemoVideo | null;
  onAnalyze?: (videoId: string) => void;
  isAnalyzing?: boolean;
  canAnalyze?: boolean;
}

export function VideoPairCard({
  pair,
  videoRecord,
  onAnalyze,
  isAnalyzing = false,
  canAnalyze = false,
}: VideoPairCardProps) {
  const [viewMode, setViewMode] = useState<"side-by-side" | "real" | "analyzed">("side-by-side");
  const [showLayers, setShowLayers] = useState({ bed: true, load: true, body: true });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const realVideoRef = useRef<HTMLVideoElement>(null);
  const analyzedVideoRef = useRef<HTMLVideoElement>(null);

  // Playback URL for this demo video
  const playback = useQuery({
    queryKey: ["demo-playback", videoRecord?.id],
    queryFn: () => demoPlayback(videoRecord!.id),
    enabled: Boolean(videoRecord?.id && videoRecord.status === "ready"),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  // Ticket evidence with SAM segmentation records
  const evidence = useTicketEvidence(pair.ticketId);

  const videoUrl = playback.data?.url ?? null;

  // Toggle synchronized play / pause
  function toggleSyncPlay() {
    const vReal = realVideoRef.current;
    const vAnalyzed = analyzedVideoRef.current;

    if (isPlaying) {
      if (vReal && !vReal.paused) vReal.pause();
      if (vAnalyzed && !vAnalyzed.paused) vAnalyzed.pause();
      setIsPlaying(false);
    } else {
      if (vReal) void vReal.play().catch(() => {});
      if (vAnalyzed) void vAnalyzed.play().catch(() => {});
      setIsPlaying(true);
    }
  }

  // Synchronized seek
  function handleSeek(targetTime: number) {
    setCurrentTime(targetTime);
    if (realVideoRef.current) realVideoRef.current.currentTime = targetTime;
    if (analyzedVideoRef.current) analyzedVideoRef.current.currentTime = targetTime;
  }

  // Toggle mute
  function toggleMute() {
    const next = !isMuted;
    setIsMuted(next);
    if (realVideoRef.current) realVideoRef.current.muted = next;
    if (analyzedVideoRef.current) analyzedVideoRef.current.muted = next;
  }

  // Keep state updated from real video events
  useEffect(() => {
    const vReal = realVideoRef.current;
    if (!vReal) return;

    const onTime = () => setCurrentTime(vReal.currentTime);
    const onMeta = () => setDuration(vReal.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    vReal.addEventListener("timeupdate", onTime);
    vReal.addEventListener("loadedmetadata", onMeta);
    vReal.addEventListener("play", onPlay);
    vReal.addEventListener("pause", onPause);

    return () => {
      vReal.removeEventListener("timeupdate", onTime);
      vReal.removeEventListener("loadedmetadata", onMeta);
      vReal.removeEventListener("play", onPlay);
      vReal.removeEventListener("pause", onPause);
    };
  }, [videoUrl]);

  return (
    <Card className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md">
      {/* ── PAIR HEADER ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/80 bg-muted/20 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            PAIR 0{pair.pairNumber}
          </span>
          <span className="font-mono text-sm font-bold text-foreground">
            {pair.truckId}
          </span>
          <Badge variant="outline" className="text-xs font-normal capitalize">
            {pair.debrisLabel}
          </Badge>
          <span className="hidden sm:inline text-xs text-muted-foreground">·</span>
          <span className="text-xs font-medium text-muted-foreground">
            {pair.certifiedCubicYards.toFixed(1)} CY
          </span>
          <span className="hidden sm:inline text-xs text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-3.5" />
            {pair.measuredFillPct.toFixed(1)}% Fill ({pair.measuredCubicYards.toFixed(2)} CY)
          </span>
        </div>

        {/* View Switcher & Sync Controls */}
        <div className="flex items-center gap-2">
          {/* Synchronized Playback Button */}
          <button
            type="button"
            onClick={toggleSyncPlay}
            disabled={!videoUrl}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
            title="Play or pause both camera and AI feeds simultaneously"
          >
            {isPlaying ? (
              <>
                <PauseIcon className="size-3 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <PlayIcon className="size-3 fill-current" />
                <span>Sync Play</span>
              </>
            )}
          </button>

          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode("side-by-side")}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                viewMode === "side-by-side"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Side-by-side comparison"
            >
              <Columns2Icon className="size-3" />
              <span className="hidden sm:inline">Side-by-Side</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("real")}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                viewMode === "real"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Real footage only"
            >
              <CameraIcon className="size-3" />
              <span className="hidden sm:inline">Real</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("analyzed")}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
                viewMode === "analyzed"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="AI-Analyzed footage only"
            >
              <SparklesIcon className="size-3" />
              <span className="hidden sm:inline">AI Analyzed</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── VIDEO COMPARISON STAGE (COMPACT) ── */}
      <div
        className={`p-3 ${
          viewMode === "side-by-side"
            ? "grid gap-3 grid-cols-1 sm:grid-cols-2"
            : "grid grid-cols-1 max-w-2xl mx-auto w-full"
        }`}
      >
        {/* ── LEFT: REAL FOOTAGE (RAW CCTV CAMERA FEED) ── */}
        {(viewMode === "side-by-side" || viewMode === "real") && (
          <div className="flex flex-col overflow-hidden rounded-md border border-border/70 bg-black/5 dark:bg-black/30">
            {/* Feed Header */}
            <div className="flex items-center justify-between border-b border-border/50 bg-background/90 px-2.5 py-1 text-xs backdrop-blur">
              <div className="flex items-center gap-1.5">
                <span className="grid size-4 place-items-center rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <CameraIcon className="size-2.5" />
                </span>
                <span className="text-[11px] font-semibold text-foreground">
                  Real Footage (Raw CCTV)
                </span>
              </div>
              <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-medium text-muted-foreground">
                Unaltered
              </span>
            </div>

            {/* Compact Video Player */}
            <div className="relative h-44 sm:h-48 w-full bg-black">
              {!videoUrl ? (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  <span>Loading CCTV footage…</span>
                </div>
              ) : (
                <video
                  ref={realVideoRef}
                  src={`${videoUrl}#t=0.1`}
                  playsInline
                  preload="metadata"
                  muted={isMuted}
                  loop
                  controls
                  className="size-full object-contain"
                  onLoadedMetadata={(e) => {
                    if (e.currentTarget.duration > 0.1) e.currentTarget.currentTime = 0.1;
                  }}
                  aria-label={`Raw CCTV video for ${pair.truckId}`}
                />
              )}

              {/* Watermark badge */}
              <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-white/90 backdrop-blur">
                LIVE CCTV · {pair.lane}
              </div>
            </div>

            {/* Feed Footer / Specs */}
            <div className="flex items-center justify-between bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground">
              <span>{pair.resolution} · {pair.fps.toFixed(1)} FPS</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                Camera Sensor
              </span>
            </div>
          </div>
        )}

        {/* ── RIGHT: AI-ANALYZED FOOTAGE (META SAM 3.1 & MUSE SPARK) ── */}
        {(viewMode === "side-by-side" || viewMode === "analyzed") && (
          <div className="flex flex-col overflow-hidden rounded-md border border-primary/20 bg-primary/5">
            {/* Feed Header & SAM Mask Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/50 bg-background/90 px-2.5 py-1 text-xs backdrop-blur">
              <div className="flex items-center gap-1.5">
                <span className="grid size-4 place-items-center rounded bg-primary/10 text-primary">
                  <SparklesIcon className="size-2.5" />
                </span>
                <span className="text-[11px] font-semibold text-foreground">
                  AI-Analyzed Footage
                </span>
              </div>

              {/* Interactive Mask Layer Toggles */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowLayers((prev) => ({ ...prev, bed: !prev.bed }))}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                    showLayers.bed
                      ? "bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-400/40"
                      : "bg-muted text-muted-foreground opacity-50"
                  }`}
                  title="Toggle Truck Bed rail outline"
                >
                  <span className="size-1 rounded-full bg-sky-500" />
                  Bed
                </button>
                <button
                  type="button"
                  onClick={() => setShowLayers((prev) => ({ ...prev, load: !prev.load }))}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                    showLayers.load
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-400/40"
                      : "bg-muted text-muted-foreground opacity-50"
                  }`}
                  title="Toggle Debris Pile segmentation mask"
                >
                  <span className="size-1 rounded-full bg-amber-500" />
                  Debris
                </button>
                <button
                  type="button"
                  onClick={() => setShowLayers((prev) => ({ ...prev, body: !prev.body }))}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                    showLayers.body
                      ? "bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-400/40"
                      : "bg-muted text-muted-foreground opacity-50"
                  }`}
                  title="Toggle Truck Body & tailgate tracking"
                >
                  <span className="size-1 rounded-full bg-slate-400" />
                  Body
                </button>
              </div>
            </div>

            {/* SAM Segmentation Video Player */}
            <div className="relative h-44 sm:h-48 w-full bg-black">
              {!videoUrl || evidence.isLoading ? (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin text-primary" />
                  <span>Loading Meta SAM 3.1 segmentation…</span>
                </div>
              ) : evidence.data ? (
                <SamPlayer
                  ticketId={pair.ticketId}
                  evidence={evidence.data}
                  show={showLayers}
                  videoUrl={videoUrl}
                  videoRef={analyzedVideoRef}
                  className="absolute inset-0 flex flex-col bg-black"
                />
              ) : (
                <video
                  ref={analyzedVideoRef}
                  src={`${videoUrl}#t=0.1`}
                  playsInline
                  preload="metadata"
                  muted={isMuted}
                  loop
                  controls
                  className="size-full object-contain"
                />
              )}

              {/* Real-time HUD overlay */}
              <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 backdrop-blur">
                <CheckCircle2Icon className="size-2.5" />
                <span>Fill: {pair.measuredFillPct.toFixed(1)}%</span>
              </div>
            </div>

            {/* Feed Footer / Model Info */}
            <div className="flex items-center justify-between bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground">
              <span>Meta SAM 3.1 + Muse Spark</span>
              <span className="font-semibold text-primary">
                ${pair.dollarValue.toFixed(2)} Value
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── COMPACT ACTION BAR (BULKY TEXT REMOVED) ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-card px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Rate: <strong className="font-medium text-foreground">${pair.ratePerCy.toFixed(2)}/CY</strong></span>
          <span>·</span>
          <span>Certified Bed: <strong className="font-medium text-foreground">{pair.certifiedCubicYards.toFixed(1)} CY</strong></span>
        </div>

        <div className="flex items-center gap-2">
          {videoRecord && (
            <button
              type="button"
              disabled={!canAnalyze || isAnalyzing}
              onClick={() => onAnalyze?.(videoRecord.id)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-primary bg-primary px-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {isAnalyzing ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <SparklesIcon className="size-3" />
              )}
              Analyze in event
            </button>
          )}

          <Link
            href={`/console?event=${SHOWCASE_EVENT_ID}&ticket=${pair.ticketId}`}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <EyeIcon className="size-3" />
            Inspect
          </Link>

          <Link
            href="/pipeline"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stages →
          </Link>
        </div>
      </div>
    </Card>
  );
}

