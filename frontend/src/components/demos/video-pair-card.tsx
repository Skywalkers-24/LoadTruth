"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, Loader2Icon, PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";

import type { DebrisClass, TicketEvidence } from "@/lib/api";
import processedPairs from "@/lib/processed-benchmark-pairs.json";
import { SamPlayer } from "@/components/console/sam-player";
import { getVideoVariantUrl, useVideoQuality } from "@/lib/video-quality";
import { QualitySelector } from "@/components/video/quality-selector";
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

type View = "masks" | "source" | "compare";
function clock(seconds: number) {
  const n = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/** One focused player. Source and overlay share one timeline in comparison mode. */
export function VideoPairCard({
  pair,
  initialView = "source",
  compact = false,
}: {
  pair: BenchmarkPairDef;
  initialView?: View;
  compact?: boolean;
}) {
  const [view, setView] = useState<View>(initialView);
  const [layers, setLayers] = useState({ bed: true, load: true, body: true });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<HTMLVideoElement>(null);
  const maskRef = useRef<HTMLVideoElement>(null);
  const timeRef = useRef(0);
  const evidence = useQuery<TicketEvidence>({
    queryKey: ["benchmark-evidence", pair.id],
    queryFn: async () => {
      const response = await fetch(
        `/evidence/benchmark/${String(pair.pairNumber).padStart(3, "0")}.json`,
      );
      if (!response.ok) throw new Error("Saved masks could not be loaded.");
      return response.json();
    },
    enabled: view !== "source",
    staleTime: Infinity,
    retry: 1,
  });
  const { resolvedTier } = useVideoQuality();
  const hasSavedLoadMasks = evidence.data
    ? Object.entries(evidence.data.segments).some(
        ([key, value]) =>
          value.trim().length > 0 &&
          (key.startsWith("load: ") || key === "debris pile"),
      )
    : true;
  const rawUrl = `/videos/${pair.matchFilename}`;
  const url = getVideoVariantUrl(rawUrl, resolvedTier) ?? rawUrl;
  const poster = `/videos/thumbnails/${pair.matchFilename.replace(".mp4", ".jpg")}`;

  function media() {
    return [sourceRef.current, maskRef.current].filter((v): v is HTMLVideoElement => v !== null);
  }
  function pause() {
    media().forEach((video) => video.pause());
    setPlaying(false);
  }
  function seek(next: number) {
    timeRef.current = next;
    setTime(next);
    media().forEach((video) => {
      video.currentTime = next;
    });
  }
  async function play() {
    setError(null);
    const videos = media();
    if (!videos.length) return;
    const results = await Promise.allSettled(videos.map((video) => video.play()));
    if (results.some((result) => result.status === "rejected")) {
      videos.forEach((video) => video.pause());
      setError("Playback did not start. Try playing again.");
      setPlaying(false);
    } else setPlaying(true);
  }
  function changeView(next: View) {
    pause();
    setView(next);
    setError(null);
  }

  // Attach to whichever feed is visible; synchronize both only in compare mode.
  useEffect(() => {
    const videos = [sourceRef.current, maskRef.current].filter(
      (v): v is HTMLVideoElement => v !== null,
    );
    const lead = videos[0];
    if (!lead) return;
    const metadata = () => {
      if (Number.isFinite(lead.duration)) setDuration(lead.duration);
      for (const video of videos) {
        if (video.readyState >= 1) video.currentTime = timeRef.current;
      }
    };
    const update = () => {
      timeRef.current = lead.currentTime;
      setTime(lead.currentTime);
      for (const video of videos.slice(1)) {
        if (video.readyState >= 1 && Math.abs(video.currentTime - lead.currentTime) > 0.15) {
          video.currentTime = lead.currentTime;
        }
      }
    };
    const ended = () => {
      videos.forEach((video) => video.pause());
      setPlaying(false);
    };
    const failed = () => {
      ended();
      setError("This video could not be loaded. Reload the clip to try again.");
    };
    const hidden = () => {
      if (document.hidden) ended();
    };
    for (const video of videos) {
      video.addEventListener("loadedmetadata", metadata);
      video.addEventListener("error", failed);
    }
    lead.addEventListener("timeupdate", update);
    lead.addEventListener("ended", ended);
    document.addEventListener("visibilitychange", hidden);
    if (lead.readyState >= 1) metadata();
    return () => {
      videos.forEach((video) => {
        video.pause();
        video.removeEventListener("loadedmetadata", metadata);
        video.removeEventListener("error", failed);
      });
      lead.removeEventListener("timeupdate", update);
      lead.removeEventListener("ended", ended);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [view, evidence.data]);

  return (
    <section
      aria-label={`Clip ${String(pair.pairNumber).padStart(3, "0")} player`}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/40"
    >
      {/* ── CARD HEADER: TRUCK METADATA + VIEW SWITCHER ── */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/30",
          compact ? "px-2.5 py-1.5" : "px-3 py-2",
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary shrink-0">
            P{String(pair.pairNumber).padStart(2, "0")}
          </span>
          <span className="font-mono text-xs font-bold text-foreground truncate">
            {pair.truckId}
          </span>
          <span className="rounded border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {pair.debrisLabel}
          </span>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
            {pair.measuredFillPct.toFixed(1)}% Fill
          </span>
        </div>

        <div className="flex items-center gap-2">
          {view !== "source" && (
            <div
              className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground"
              role="group"
              aria-label="Mask layers"
            >
              {(["bed", "load", "body"] as const).map((layer) => (
                <label
                  key={layer}
                  className="inline-flex cursor-pointer items-center gap-1 select-none"
                >
                  <input
                    type="checkbox"
                    checked={layers[layer]}
                    onChange={() => setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))}
                    className="size-3 accent-[var(--brand)]"
                  />
                  <span>{layer === "bed" ? "Bed" : layer === "load" ? "Load" : "Body"}</span>
                </label>
              ))}
            </div>
          )}

          <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs" role="group" aria-label="Video view">
            {(
              [
                ["compare", "Compare"],
                ["source", "Original"],
                ["masks", "With masks"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => changeView(value)}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  view === value
                    ? "bg-primary font-semibold text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── VIDEO STAGE: ZERO LETTERBOXING, CRISP 16:9 EDGE-TO-EDGE ── */}
      <div
        className={cn(
          "grid bg-neutral-950 relative group cursor-pointer select-none",
          compact ? "gap-1 p-1" : "gap-1.5 p-1.5",
          view === "compare" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        )}
        onClick={() => (playing ? pause() : void play())}
        title={playing ? "Click to pause" : "Click to play"}
      >
        {!playing && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="grid size-10 place-items-center rounded-full bg-black/75 text-white shadow-md backdrop-blur-xs border border-white/20">
              <PlayIcon className="size-5 fill-current ml-0.5" />
            </div>
          </div>
        )}
        {view !== "masks" && (
          <div className="relative aspect-video w-full overflow-hidden rounded bg-black">
            <video
              ref={sourceRef}
              src={url}
              poster={poster}
              preload="none"
              playsInline
              muted
              className="size-full object-cover"
              aria-label="Original footage"
            />
            <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-xs border border-white/10">
              Camera 01 · Raw
            </span>
          </div>
        )}
        {view !== "source" && (
          <div className="relative aspect-video w-full overflow-hidden rounded bg-black">
            {evidence.data ? (
              <>
                <SamPlayer
                  ticketId={pair.ticketId}
                  evidence={evidence.data}
                  videoUrl={url}
                  videoRef={maskRef}
                  show={layers}
                  autoPlay={false}
                  hideControls
                  poster={poster}
                  fallbackLoadFillPct={pair.measuredFillPct}
                  className="size-full"
                />
                <div className="pointer-events-none absolute right-2 bottom-2 rounded bg-black/85 px-2 py-0.5 text-[10px] font-bold text-emerald-400 backdrop-blur-xs border border-emerald-500/30">
                  {pair.measuredFillPct.toFixed(1)}% Fill
                  {!hasSavedLoadMasks && (
                    <span className="ml-1 font-medium text-violet-200">· estimated cover</span>
                  )}
                </div>
              </>
            ) : evidence.isError ? (
              <div
                role="alert"
                className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-white/80"
              >
                <p>Saved masks could not be loaded.</p>
                <button
                  type="button"
                  onClick={() => void evidence.refetch()}
                  className="rounded border border-white/30 px-2 py-1 text-xs hover:bg-white/10"
                >
                  Retry masks
                </button>
              </div>
            ) : (
              <div
                role="status"
                className="flex h-full items-center justify-center gap-2 text-xs text-white/70"
              >
                <Loader2Icon className="size-4 animate-spin" />
                Loading masks…
              </div>
            )}
            <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold text-violet-300 backdrop-blur-xs border border-violet-500/30">
              SAM 3.1 · AI
            </span>
          </div>
        )}
      </div>
      <div
        className={cn(
          "sticky bottom-0 z-10 flex flex-wrap items-center border-t border-border bg-card",
          compact ? "gap-2 px-2.5 py-1.5 text-xs" : "gap-3 px-3 py-2 text-xs",
        )}
      >
        <button
          type="button"
          disabled={view !== "source" && !evidence.data}
          onClick={() => (playing ? pause() : void play())}
          aria-label={playing ? "Pause clip" : "Play clip"}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md bg-primary font-medium text-primary-foreground disabled:opacity-40 transition-colors hover:bg-primary/90 cursor-pointer",
            compact ? "h-7 min-w-16 px-2 text-xs" : "min-h-8 min-w-20 px-2.5 text-xs",
          )}
        >
          {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
          <span>{playing ? "Pause" : "Play"}</span>
        </button>
        <input
          type="range"
          aria-label="Clip timeline"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(time, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          className="min-w-16 flex-1 accent-[var(--brand)]"
        />
        <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
          {clock(time)} / {clock(duration)}
        </span>
        <QualitySelector />
        <button
          type="button"
          onClick={() => {
            pause();
            seek(0);
            void play();
          }}
          aria-label="Replay clip"
          title="Replay ticket from start"
          className={cn(
            "inline-flex items-center gap-1 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer",
            compact ? "h-7 px-2 text-xs" : "min-h-8 px-2.5 text-xs",
          )}
        >
          <RotateCcwIcon className="size-3.5 text-primary" />
          <span>Replay ticket</span>
        </button>
      </div>

      {/* ── CARD FOOTER: FINANCIALS + CONSOLE REVIEW LINK ── */}
      <div
        className={cn(
          "flex items-center justify-between border-t border-border/70 bg-muted/20 text-xs",
          compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-1.5",
        )}
      >
        <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">{pair.certifiedCubicYards} CY Bed</span>
          <span>·</span>
          <span className="font-semibold text-foreground">${pair.dollarValue.toFixed(2)}</span>
          <span className="text-[10px] opacity-80">(${pair.ratePerCy}/CY)</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              pause();
              seek(0);
              void play();
            }}
            title="Replay ticket evidence"
            className="inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:border-primary/40 hover:text-primary cursor-pointer"
          >
            <RotateCcwIcon className="size-2.5 text-primary" />
            <span>Replay ticket</span>
          </button>
          <Link
            href={`/console?event=${pair.eventId}&ticket=${pair.ticketId}`}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent hover:border-primary/40 hover:text-primary"
          >
            <span>Console</span>
            <ArrowRightIcon className="size-2.5" />
          </Link>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="border-t border-border px-4 py-3 text-sm text-[var(--destructive)]"
        >
          {error}
        </p>
      )}
    </section>
  );
}
