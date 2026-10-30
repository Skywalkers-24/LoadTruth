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
  RotateCcwIcon,
  SparklesIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";

import { demoPlayback, type DebrisClass, type DemoVideo, type TicketEvidence } from "@/lib/api";
import { useInView } from "@/lib/use-in-view";
import processedPairs from "@/lib/processed-benchmark-pairs.json";
import { SamPlayer } from "@/components/console/sam-player";
import { Badge } from "@/components/ui/shadcn/badge";
import { cn } from "@/lib/utils";

export interface BenchmarkPairDef {
  id: string;
  pairNumber: number;
  truckId: string;
  ticketId: string;
  eventId: string;
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

export const BENCHMARK_PAIRS = processedPairs as BenchmarkPairDef[];

interface VideoPairCardProps {
  pair: BenchmarkPairDef;
  videoRecord?: DemoVideo | null;
  onAnalyze?: (videoId: string) => void;
  isAnalyzing?: boolean;
  canAnalyze?: boolean;
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
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
  const [playbackError, setPlaybackError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(9);

  const realVideoRef = useRef<HTMLVideoElement>(null);
  const analyzedVideoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Lazy-load media when near viewport; pairs 1 & 2 start immediately
  const isVisible = useInView(cardRef, "350px", pair.pairNumber <= 2);

  // Playback URL for this demo video
  const playback = useQuery({
    queryKey: ["demo-playback", videoRecord?.id],
    queryFn: () => demoPlayback(videoRecord!.id),
    enabled: Boolean(isVisible && videoRecord?.id && videoRecord.status === "ready"),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  // Fetch saved masks only when the card approaches the viewport.
  const evidence = useQuery<TicketEvidence>({
    queryKey: ["benchmark-evidence", pair.id],
    queryFn: async () => {
      const response = await fetch(
        `/evidence/benchmark/${String(pair.pairNumber).padStart(3, "0")}.json`,
      );
      if (!response.ok) throw new Error("Saved masks could not be loaded");
      return response.json();
    },
    enabled: isVisible,
    staleTime: Infinity,
  });
  const evidenceData = evidence.data;

  // Source clips and saved masks are served from Cloudflare static assets.
  const edgeVideoUrl = pair.matchFilename ? `/videos/${pair.matchFilename}` : null;
  const posterUrl = pair.matchFilename
    ? `/videos/thumbnails/${pair.matchFilename.replace(".mp4", ".jpg")}`
    : undefined;
  const [useEdgeAsset, setUseEdgeAsset] = useState(true);
  const videoUrl = useEdgeAsset && edgeVideoUrl ? edgeVideoUrl : (playback.data?.url ?? null);

  // Replay both feeds from 0:00
  function handleReplay(e?: React.MouseEvent) {
    e?.stopPropagation();
    const vReal = realVideoRef.current;
    const vAnalyzed = analyzedVideoRef.current;
    if (vReal) {
      vReal.currentTime = 0;
      void vReal.play();
    }
    if (vAnalyzed) {
      vAnalyzed.currentTime = 0;
      void vAnalyzed.play();
    }
    setCurrentTime(0);
    setIsPlaying(true);
    setPlaybackError(false);
  }

  // Toggle synchronized play / pause
  async function toggleSyncPlay() {
    const vReal = realVideoRef.current;
    const vAnalyzed = analyzedVideoRef.current;
    const videos = [vReal, vAnalyzed].filter((video): video is HTMLVideoElement => video !== null);

    if (currentTime >= duration - 0.2) {
      handleReplay();
      return;
    }

    if (isPlaying) {
      videos.forEach((video) => video.pause());
      setIsPlaying(false);
      return;
    }

    const startTime = vReal?.currentTime ?? vAnalyzed?.currentTime ?? 0;
    videos.forEach((video) => {
      video.currentTime = startTime;
    });
    const results = await Promise.allSettled(videos.map((video) => video.play()));
    if (results.some((result) => result.status === "rejected")) {
      videos.forEach((video) => video.pause());
      setIsPlaying(false);
      setPlaybackError(true);
      return;
    }
    setPlaybackError(false);
    setIsPlaying(true);
  }

  // Handle timeline scrubbing for both feeds
  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (realVideoRef.current) realVideoRef.current.currentTime = newTime;
    if (analyzedVideoRef.current) analyzedVideoRef.current.currentTime = newTime;
  }

  // Toggle mute for both feeds
  function toggleMute() {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (realVideoRef.current) realVideoRef.current.muted = nextMuted;
    if (analyzedVideoRef.current) analyzedVideoRef.current.muted = nextMuted;
  }

  // Synchronize time & duration from real video
  function handleTimeUpdate() {
    const vReal = realVideoRef.current;
    if (!vReal) return;
    setCurrentTime(vReal.currentTime);
    if (vReal.duration && Number.isFinite(vReal.duration)) {
      setDuration(vReal.duration);
    }

    // Keep analyzed video synced with tight drift threshold (< 0.18s)
    const vAnalyzed = analyzedVideoRef.current;
    if (vAnalyzed && Math.abs(vAnalyzed.currentTime - vReal.currentTime) > 0.18) {
      vAnalyzed.currentTime = vReal.currentTime;
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
    <div
      ref={cardRef}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-all hover:border-primary/40"
    >
      {/* ── PAIR HEADER (TIGHT SINGLE ROW, NO DEAD SPACE) ── */}
      <div className="flex items-center justify-between gap-1.5 border-b border-border/70 bg-muted/25 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary shrink-0">
            P0{pair.pairNumber}
          </span>
          <span className="font-mono text-xs font-bold text-foreground">{pair.truckId}</span>
          <span className="rounded border border-border/80 bg-background px-1.5 py-0 text-[10px] font-medium text-muted-foreground hidden sm:inline-flex">
            {pair.debrisLabel}
          </span>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
            {pair.measuredFillPct.toFixed(1)}% Fill
          </span>
        </div>

        {/* View Switcher & Replay */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleReplay}
            className="inline-flex items-center gap-1 rounded border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent transition-colors shadow-2xs"
            title="Replay from start (0:00)"
          >
            <RotateCcwIcon className="size-2.5 text-primary" />
            <span className="hidden sm:inline">Replay</span>
          </button>

          <div className="inline-flex rounded border border-border bg-background p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setViewMode("side-by-side")}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors font-medium",
                viewMode === "side-by-side"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Side-by-Side Dual View"
            >
              Dual
            </button>
            <button
              type="button"
              onClick={() => setViewMode("real")}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors font-medium",
                viewMode === "real"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Raw CCTV Only"
            >
              Real
            </button>
            <button
              type="button"
              onClick={() => setViewMode("analyzed")}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors font-medium",
                viewMode === "analyzed"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="AI SAM 3.1 Only"
            >
              SAM
            </button>
          </div>
        </div>
      </div>

      {/* ── VIDEO STAGE (EDGE-TO-EDGE 16:9 RATIO, ZERO LETTERBOXING) ── */}
      <div className="bg-neutral-950 p-1.5 min-h-[160px]">
        {!isVisible ? (
          <div
            className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md bg-black/60 text-xs text-muted-foreground select-none cursor-pointer hover:bg-black/80 transition-colors"
            onClick={toggleSyncPlay}
          >
            <div className="grid size-9 place-items-center rounded-full bg-white/10 text-white shadow-xs">
              <PlayIcon className="size-4 fill-current ml-0.5" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">
              Click or scroll to preview {pair.truckId}
            </span>
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-1.5",
              viewMode === "side-by-side" ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {/* ── LEFT: REAL CCTV FOOTAGE ── */}
            {(viewMode === "side-by-side" || viewMode === "real") && (
              <div
                className="group relative aspect-video w-full overflow-hidden rounded-md bg-black cursor-pointer select-none"
                onClick={toggleSyncPlay}
              >
                {!videoUrl ? (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    <span>Loading…</span>
                  </div>
                ) : (
                  <video
                    ref={realVideoRef}
                    src={videoUrl}
                    poster={posterUrl}
                    playsInline
                    preload="metadata"
                    muted={isMuted}
                    loop
                    className="size-full object-cover"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={(e) => {
                      if (e.currentTarget.duration > 0) {
                        setDuration(e.currentTarget.duration);
                      }
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onError={() => setUseEdgeAsset(false)}
                    aria-label={`Raw CCTV video for ${pair.truckId}`}
                  />
                )}

                {/* Floating Camera Label Badge */}
                <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-xs shadow-xs border border-white/10">
                  <CameraIcon className="size-2.5 text-white/80" />
                  <span>Real CCTV</span>
                </div>

                {/* Center Play/Pause Indicator Overlay on Hover or Pause */}
                <div
                  className={cn(
                    "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200",
                    isPlaying ? "opacity-0 group-hover:opacity-80" : "opacity-90 bg-black/20",
                  )}
                >
                  <div className="grid size-7 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-xs border border-white/20">
                    {currentTime >= duration - 0.2 ? (
                      <RotateCcwIcon className="size-3.5" />
                    ) : isPlaying ? (
                      <PauseIcon className="size-3.5 fill-current" />
                    ) : (
                      <PlayIcon className="size-3.5 fill-current ml-0.5" />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── RIGHT: AI-ANALYZED FOOTAGE (META SAM 3.1 & MUSE SPARK) ── */}
            {(viewMode === "side-by-side" || viewMode === "analyzed") && (
              <div
                className="group relative aspect-video w-full overflow-hidden rounded-md bg-black cursor-pointer select-none"
                onClick={toggleSyncPlay}
              >
                {!videoUrl || (evidence.isLoading && !evidenceData) ? (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    <Loader2Icon className="size-3.5 animate-spin text-primary" />
                    <span>Loading SAM…</span>
                  </div>
                ) : evidenceData ? (
                  <SamPlayer
                    ticketId={pair.ticketId}
                    evidence={evidenceData}
                    show={showLayers}
                    videoUrl={videoUrl}
                    videoRef={analyzedVideoRef}
                    poster={posterUrl}
                    hideControls
                    autoPlay={false}
                    className="absolute inset-0 flex flex-col bg-black [&_video]:object-cover"
                  />
                ) : (
                  <video
                    ref={analyzedVideoRef}
                    src={videoUrl}
                    poster={posterUrl}
                    playsInline
                    preload="metadata"
                    muted={isMuted}
                    loop
                    onError={() => setUseEdgeAsset(false)}
                    className="size-full object-cover"
                  />
                )}

                {/* Floating SAM Label Badge */}
                <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold text-primary backdrop-blur-xs shadow-xs border border-primary/25">
                  <SparklesIcon className="size-2.5 text-primary" />
                  <span>SAM 3.1 AI</span>
                </div>

                {/* Floating Layer Toggles on Top-Right */}
                <div
                  className="absolute right-1.5 top-1.5 flex items-center gap-1 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setShowLayers((prev) => ({ ...prev, bed: !prev.bed }))}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[8px] font-bold transition-all shadow-xs",
                      showLayers.bed
                        ? "bg-sky-500 text-white shadow-sky-500/30"
                        : "bg-black/60 text-white/50 border border-white/10",
                    )}
                    title="Toggle Bed Outline"
                  >
                    Bed
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLayers((prev) => ({ ...prev, load: !prev.load }))}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[8px] font-bold transition-all shadow-xs",
                      showLayers.load
                        ? "bg-amber-500 text-black shadow-amber-500/30"
                        : "bg-black/60 text-white/50 border border-white/10",
                    )}
                    title="Toggle Load Mask"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLayers((prev) => ({ ...prev, body: !prev.body }))}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[8px] font-bold transition-all shadow-xs",
                      showLayers.body
                        ? "bg-purple-500 text-white shadow-purple-500/30"
                        : "bg-black/60 text-white/50 border border-white/10",
                    )}
                    title="Toggle Body Mask"
                  >
                    Body
                  </button>
                </div>

                {/* HUD Fill Pill in bottom-right */}
                <div className="pointer-events-none absolute right-1.5 bottom-1.5 rounded bg-black/85 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 backdrop-blur-xs border border-emerald-500/30 shadow-xs">
                  {pair.measuredFillPct.toFixed(1)}% Fill
                </div>

                {/* Center Play/Pause Indicator Overlay on Hover or Pause */}
                <div
                  className={cn(
                    "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200",
                    isPlaying ? "opacity-0 group-hover:opacity-80" : "opacity-90 bg-black/20",
                  )}
                >
                  <div className="grid size-7 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-xs border border-white/20">
                    {currentTime >= duration - 0.2 ? (
                      <RotateCcwIcon className="size-3.5" />
                    ) : isPlaying ? (
                      <PauseIcon className="size-3.5 fill-current" />
                    ) : (
                      <PlayIcon className="size-3.5 fill-current ml-0.5" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── UNIFIED SYNCHRONIZED PLAYER BAR ── */}
        <div className="mt-1 flex items-center gap-2 rounded bg-neutral-900/95 px-2 py-1 text-white border border-white/10 text-[10px]">
          <button
            type="button"
            onClick={toggleSyncPlay}
            className="grid size-5 shrink-0 place-items-center rounded text-white hover:bg-white/20 transition-colors"
            title={isPlaying ? "Pause both feeds" : "Play both feeds in sync"}
          >
            {isPlaying ? (
              <PauseIcon className="size-3 fill-current" />
            ) : (
              <PlayIcon className="size-3 fill-current ml-0.5" />
            )}
          </button>

          {/* Replay Button */}
          <button
            type="button"
            onClick={handleReplay}
            className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white hover:bg-white/25 transition-colors shrink-0"
            title="Replay from start (0:00)"
          >
            <RotateCcwIcon className="size-2.5" />
            <span>Replay</span>
          </button>

          {/* Time Display */}
          <span className="font-mono text-[9px] tabular-nums text-white/80 shrink-0">
            {formatClock(currentTime)} / {formatClock(duration)}
          </span>

          {/* Synced Scrubber */}
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 10}
            step={0.05}
            value={currentTime}
            onChange={handleSeek}
            className="h-1 flex-1 accent-primary cursor-pointer bg-white/20 rounded-full appearance-none"
            aria-label="Synchronized timeline scrubber"
          />

          {/* Mute toggle */}
          <button
            type="button"
            onClick={toggleMute}
            className="grid size-5 shrink-0 place-items-center rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeXIcon className="size-3" /> : <Volume2Icon className="size-3" />}
          </button>

          <span className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Sync
          </span>
        </div>
        {playbackError && (
          <p role="status" className="mt-1 text-[10px] text-destructive">
            Synchronized playback could not start. Try again.
          </p>
        )}
      </div>

      {/* ── COMPACT SINGLE-ROW FOOTER (NO DEAD SPACE) ── */}
      <div className="flex items-center justify-between border-t border-border/70 bg-card px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{pair.certifiedCubicYards} CY Bed</span>
          <span>·</span>
          <span className="font-semibold text-foreground">${pair.dollarValue.toFixed(2)}</span>
          <span className="text-[10px]">(${pair.ratePerCy}/CY)</span>
        </div>

        <div className="flex items-center gap-1.5">
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
            href={`/console?event=${pair.eventId}&ticket=${pair.ticketId}`}
            className="inline-flex h-6 items-center rounded border border-border bg-background px-2 text-[10px] font-medium text-foreground transition-colors hover:bg-accent hover:border-primary/40"
          >
            Console →
          </Link>
        </div>
      </div>
    </div>
  );
}
