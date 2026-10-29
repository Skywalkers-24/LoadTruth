"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CameraIcon,
  CheckCircle2Icon,
  Columns2Icon,
  EyeIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  SparklesIcon,
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
    debrisDescription: "Refrigerators, washers & appliances",
    certifiedCubicYards: 16.0,
    measuredFillPct: 41.83,
    measuredCubicYards: 6.69,
    ratePerCy: 22.0,
    dollarValue: 147.25,
    matchFilename: "showcase-1.mp4",
    contentHash: "8a3c6673949fbb9f4b6d26e8efb9270690fd9254ab97c56573bc936de09ea558",
    notes: "Appliances haul, bed isolated from cargo.",
    fps: 6.022,
    resolution: "1024 × 576",
    lane: "Lane 01",
  },
  {
    id: "pair-2",
    pairNumber: 2,
    truckId: "FL-DT-7788",
    ticketId: "ba556e1e-a844-5dcf-96b4-94ac7724f124",
    debrisClass: "hazardous",
    debrisLabel: "Hazardous",
    debrisDescription: "Chemical barrels & paint cans",
    certifiedCubicYards: 20.0,
    measuredFillPct: 11.98,
    measuredCubicYards: 2.4,
    ratePerCy: 100.0,
    dollarValue: 240.0,
    matchFilename: "showcase-2.mp4",
    contentHash: "398b452b4325d4e02a5cae50a026a1b4f7bfb4c09b9eea4d2f1a1a8046130484",
    notes: "Sparse barrels resting on bed floor.",
    fps: 3.0,
    resolution: "1024 × 576",
    lane: "Lane 03",
  },
  {
    id: "pair-3",
    pairNumber: 3,
    truckId: "FL-DT-3391",
    ticketId: "df0e9c7b-ce86-5251-ad6d-335914200daa",
    debrisClass: "construction_demolition",
    debrisLabel: "C&D",
    debrisDescription: "Lumber, drywall & broken concrete",
    certifiedCubicYards: 20.0,
    measuredFillPct: 54.64,
    measuredCubicYards: 10.93,
    ratePerCy: 12.0,
    dollarValue: 131.14,
    matchFilename: "showcase-3.mp4",
    contentHash: "a3ba19079602dbdf381dba518fd90ea4734970e283fd580568ea31b837f7c400",
    notes: "Demolition rubble and concrete debris.",
    fps: 3.0,
    resolution: "1024 × 576",
    lane: "Lane 02",
  },
  {
    id: "pair-4",
    pairNumber: 4,
    truckId: "FL-DT-2204",
    ticketId: "9e5b4ae9-4727-5547-bb08-c8c8eb714e5a",
    debrisClass: "vegetative",
    debrisLabel: "Vegetative",
    debrisDescription: "Clean sweep empty return bed (0%)",
    certifiedCubicYards: 25.0,
    measuredFillPct: 0.0,
    measuredCubicYards: 0.0,
    ratePerCy: 8.0,
    dollarValue: 0.0,
    matchFilename: "showcase-4.mp4",
    contentHash: "3e66bfed29744563adf6b5f16542cfaed9773f63f6917b9eb96ed95a4d54bf88",
    notes: "Empty contractor return haul, fraud guard.",
    fps: 3.0,
    resolution: "1024 × 576",
    lane: "Lane 01",
  },
  {
    id: "pair-5",
    pairNumber: 5,
    truckId: "FL-DT-3391",
    ticketId: "654d5e5f-d61c-52b8-9e1d-c6dc6c7ec110",
    debrisClass: "construction_demolition",
    debrisLabel: "C&D",
    debrisDescription: "Roofing shingles & plywood",
    certifiedCubicYards: 20.0,
    measuredFillPct: 37.85,
    measuredCubicYards: 7.57,
    ratePerCy: 12.0,
    dollarValue: 90.84,
    matchFilename: "showcase-5.mp4",
    contentHash: "968754e7cea9b1e38861cf0be414b18e89ba8aba349a287bd63da9f6a3e69e73",
    notes: "Roofing shingles haul in twilight lighting.",
    fps: 3.0,
    resolution: "1024 × 576",
    lane: "Lane 02",
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

  // Keep state updated from real video events
  useEffect(() => {
    const vReal = realVideoRef.current;
    if (!vReal) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    vReal.addEventListener("play", onPlay);
    vReal.addEventListener("pause", onPause);

    return () => {
      vReal.removeEventListener("play", onPlay);
      vReal.removeEventListener("pause", onPause);
    };
  }, [videoUrl]);

  return (
    <Card className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all hover:border-primary/40">
      {/* ── PAIR HEADER (COMPACT SINGLE ROW) ── */}
      <div className="flex items-center justify-between gap-1.5 border-b border-border/70 bg-muted/20 px-3 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary shrink-0">
            P0{pair.pairNumber}
          </span>
          <span className="font-mono text-xs font-bold text-foreground">
            {pair.truckId}
          </span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal truncate hidden sm:inline-flex">
            {pair.debrisLabel}
          </Badge>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
            {pair.measuredFillPct.toFixed(1)}% Fill
          </span>
        </div>

        {/* View Switcher & Sync Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={toggleSyncPlay}
            disabled={!videoUrl}
            className="inline-flex h-6 items-center gap-1 rounded border border-primary/30 bg-primary/5 px-2 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
            title="Sync play both feeds"
          >
            {isPlaying ? (
              <>
                <PauseIcon className="size-2.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <PlayIcon className="size-2.5 fill-current" />
                <span>Sync</span>
              </>
            )}
          </button>

          <div className="inline-flex rounded border border-border bg-background p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setViewMode("side-by-side")}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                viewMode === "side-by-side"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Side-by-Side"
            >
              Dual
            </button>
            <button
              type="button"
              onClick={() => setViewMode("real")}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                viewMode === "real"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Real Footage Only"
            >
              Real
            </button>
            <button
              type="button"
              onClick={() => setViewMode("analyzed")}
              className={`rounded px-1.5 py-0.5 transition-colors ${
                viewMode === "analyzed"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="AI-Analyzed Only"
            >
              SAM
            </button>
          </div>
        </div>
      </div>

      {/* ── VIDEO COMPARISON STAGE (COMPACT 130PX HEIGHT) ── */}
      <div
        className={`p-2 ${
          viewMode === "side-by-side"
            ? "grid gap-2 grid-cols-2"
            : "grid grid-cols-1 w-full"
        }`}
      >
        {/* ── LEFT: REAL FOOTAGE (RAW CCTV CAMERA FEED) ── */}
        {(viewMode === "side-by-side" || viewMode === "real") && (
          <div className="flex flex-col overflow-hidden rounded border border-border/70 bg-black">
            {/* Feed Header */}
            <div className="flex items-center justify-between bg-background/90 px-2 py-0.5 text-[10px] border-b border-border/40 backdrop-blur">
              <span className="font-semibold text-foreground text-[10px] truncate">
                📹 Real CCTV
              </span>
              <span className="text-[9px] text-muted-foreground">Raw</span>
            </div>

            {/* Compact Video Player */}
            <div className="relative h-28 sm:h-32 w-full bg-black">
              {!videoUrl ? (
                <div className="flex size-full flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  <span>Loading…</span>
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
            </div>
          </div>
        )}

        {/* ── RIGHT: AI-ANALYZED FOOTAGE (META SAM 3.1 & MUSE SPARK) ── */}
        {(viewMode === "side-by-side" || viewMode === "analyzed") && (
          <div className="flex flex-col overflow-hidden rounded border border-primary/30 bg-black">
            {/* Feed Header & SAM Mask Toggles */}
            <div className="flex items-center justify-between bg-background/90 px-2 py-0.5 text-[10px] border-b border-border/40 backdrop-blur">
              <span className="font-semibold text-primary text-[10px] truncate">
                ✨ SAM 3.1 AI
              </span>

              {/* Mini Layer Toggles */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowLayers((prev) => ({ ...prev, bed: !prev.bed }))}
                  className={`rounded px-1 text-[8px] font-medium transition-colors ${
                    showLayers.bed
                      ? "bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-400/40"
                      : "opacity-40"
                  }`}
                  title="Bed"
                >
                  Bed
                </button>
                <button
                  type="button"
                  onClick={() => setShowLayers((prev) => ({ ...prev, load: !prev.load }))}
                  className={`rounded px-1 text-[8px] font-medium transition-colors ${
                    showLayers.load
                      ? "bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-400/40"
                      : "opacity-40"
                  }`}
                  title="Debris"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => setShowLayers((prev) => ({ ...prev, body: !prev.body }))}
                  className={`rounded px-1 text-[8px] font-medium transition-colors ${
                    showLayers.body
                      ? "bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-400/40"
                      : "opacity-40"
                  }`}
                  title="Body"
                >
                  Body
                </button>
              </div>
            </div>

            {/* SAM Segmentation Video Player */}
            <div className="relative h-28 sm:h-32 w-full bg-black">
              {!videoUrl || evidence.isLoading ? (
                <div className="flex size-full flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin text-primary" />
                  <span>Loading…</span>
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

              {/* HUD Fill tag */}
              <div className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/80 px-1.5 py-0.2 text-[8px] font-bold text-emerald-400 backdrop-blur">
                {pair.measuredFillPct.toFixed(1)}% Fill
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── COMPACT SINGLE-ROW FOOTER (ZERO BULKY WORDS) ── */}
      <div className="flex items-center justify-between border-t border-border/70 bg-card px-3 py-1">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{pair.certifiedCubicYards} CY Bed</span>
          <span>·</span>
          <span className="font-medium text-foreground">${pair.dollarValue.toFixed(2)}</span>
        </div>

        <div className="flex items-center gap-1">
          {videoRecord && (
            <button
              type="button"
              disabled={!canAnalyze || isAnalyzing}
              onClick={() => onAnalyze?.(videoRecord.id)}
              className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[10px] font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {isAnalyzing ? (
                <Loader2Icon className="size-2.5 animate-spin" />
              ) : (
                <SparklesIcon className="size-2.5" />
              )}
              Analyze
            </button>
          )}

          <Link
            href={`/console?event=${SHOWCASE_EVENT_ID}&ticket=${pair.ticketId}`}
            className="inline-flex h-6 items-center rounded border border-border bg-background px-1.5 text-[10px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            Console
          </Link>
        </div>
      </div>
    </Card>
  );
}
