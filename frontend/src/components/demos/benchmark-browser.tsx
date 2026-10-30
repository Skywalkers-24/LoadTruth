"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import manifest from "@/lib/benchmark-videos.json";
import { BENCHMARK_PAIRS, VideoPairCard, type BenchmarkPairDef } from "./video-pair-card";
import { money } from "@/lib/format";
import { getVideoVariantUrl, useVideoQuality } from "@/lib/video-quality";
import { QualitySelector } from "@/components/video/quality-selector";
import { cn } from "@/lib/utils";

export type ClipStatus = "processed" | "no-truck" | "pending" | "unprocessed";
export interface GalleryClip {
  id: string;
  url: string;
  pair?: BenchmarkPairDef;
  status: ClipStatus;
}
const pairByHash = new Map(
  BENCHMARK_PAIRS.filter((pair) => Number(pair.pairNumber) <= 25).map((pair) => [
    pair.contentHash,
    pair,
  ]),
);
export const GALLERY_CLIPS: GalleryClip[] = manifest.videos.map((video) => {
  const isBatch1 = Number(video.id) <= 25;
  const pair = isBatch1 ? pairByHash.get(video.sha256) : undefined;
  return {
    id: video.id,
    url: video.url,
    pair,
    status: isBatch1
      ? pair
        ? "processed"
        : video.id === "004"
          ? "no-truck"
          : "pending"
      : "unprocessed",
  };
});
const STATUS: Record<ClipStatus, string> = {
  processed: "Result available",
  "no-truck": "No truck detected",
  pending: "Result pending",
  unprocessed: "Not analyzed",
};
type Filter = "batch" | "unprocessed" | "all";
export function filterClips(clips: GalleryClip[], filter: Filter, query: string) {
  const q = query.trim().toLowerCase();
  return clips.filter(
    (clip) =>
      (filter === "all" || (filter === "batch" ? Number(clip.id) <= 25 : Number(clip.id) > 25)) &&
      (!q ||
        `${clip.id} ${clip.pair?.truckId ?? ""} ${clip.pair?.debrisLabel ?? ""} ${STATUS[clip.status]}`
          .toLowerCase()
          .includes(q)),
  );
}

/** Browse first, inspect one clip, then open its ticket for a decision. */
export function BenchmarkBrowser() {
  const [filter, setFilter] = useState<Filter>("batch");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("001");
  const prefix = useId();
  const clips = filterClips(GALLERY_CLIPS, filter, query);
  const selected = clips.find((clip) => clip.id === selectedId) ?? clips[0];
  const index = selected ? clips.indexOf(selected) : -1;
  const select = (id: string) => setSelectedId(id);
  const move = (delta: number) => {
    const next = clips[index + delta];
    if (next) select(next.id);
  };

  return (
    <section aria-label="Browse benchmark footage" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Clip collection"
          className="inline-flex flex-wrap gap-1 rounded-lg bg-secondary/40 p-1"
        >
          {(
            [
              ["batch", "Latest batch", 25],
              ["unprocessed", "Unprocessed", 25],
              ["all", "All", 50],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setQuery("");
              }}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm",
                filter === value
                  ? "bg-card font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Select a clip → inspect footage → review the ticket
        </p>
      </div>
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
          <div className="border-b border-border p-3">
            <label htmlFor={`${prefix}-search`} className="sr-only">
              Search clips, trucks or material
            </label>
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
              <input
                id={`${prefix}-search`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clips or trucks…"
                className="h-10 w-full min-w-0 bg-transparent text-sm outline-none"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear clip search"
                  onClick={() => setQuery("")}
                  className="grid size-8 shrink-0 place-items-center"
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              {clips.length} clip{clips.length === 1 ? "" : "s"}
              {query ? " match your search" : " in this collection"}
            </p>
          </div>
          <label className="flex flex-col gap-2 p-3 text-xs text-muted-foreground lg:hidden">
            Choose a clip
            <select
              aria-label="Choose a clip"
              value={selected?.id ?? ""}
              onChange={(e) => select(e.target.value)}
              className="h-11 rounded border border-input bg-background px-3 text-sm text-foreground"
            >
              {!clips.length && <option value="">No matching clips</option>}
              {clips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  Clip {clip.id} · {clip.pair?.truckId ?? STATUS[clip.status]}
                </option>
              ))}
            </select>
          </label>
          <div className="lt-scroll hidden min-h-0 flex-1 overflow-y-auto p-1.5 lg:block">
            <ul
              role="listbox"
              aria-label="Footage clips"
              onKeyDown={(e) => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || !clips.length)
                  return;
                e.preventDefault();
                const nextIndex =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? clips.length - 1
                      : Math.max(
                          0,
                          Math.min(clips.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)),
                        );
                const next = clips[nextIndex];
                if (!next) return;
                select(next.id);
                document.getElementById(`${prefix}-${next.id}`)?.focus();
              }}
            >
              {clips.map((clip) => (
                <li key={clip.id}>
                  <button
                    id={`${prefix}-${clip.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected?.id === clip.id}
                    tabIndex={selected?.id === clip.id ? 0 : -1}
                    onClick={() => select(clip.id)}
                    className={cn(
                      "mb-1 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left",
                      selected?.id === clip.id ? "bg-[var(--brand-soft)]" : "hover:bg-secondary/50",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- local clip thumbnails */}
                    <img
                      src={clip.url
                        .replace("/videos/", "/videos/thumbnails/")
                        .replace(".mp4", ".jpg")}
                      alt=""
                      loading="lazy"
                      className="h-11 w-16 shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {clip.pair?.truckId ?? `Clip ${clip.id}`}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {clip.pair ? `${clip.id} · ${clip.pair.debrisLabel}` : STATUS[clip.status]}
                      </span>
                    </span>
                    {clip.status === "processed" && (
                      <CheckIcon
                        className="size-3.5 shrink-0 text-[var(--ok)]"
                        aria-label="Result available"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div
          className="lt-scroll min-h-0 min-w-0 overflow-y-auto pb-3"
          aria-label="Selected clip details"
        >
          {selected ? (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">
                    Clip {selected.id} · {STATUS[selected.status]}
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {selected.pair?.truckId ??
                      (selected.status === "no-truck" ? "No truck in frame" : "Original footage")}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.pair && (
                    <Link
                      href={`/console?event=${selected.pair.eventId}&ticket=${selected.pair.ticketId}`}
                      className="mr-2 inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                    >
                      Review ticket
                      <ArrowRightIcon className="size-4" />
                    </Link>
                  )}

                  <span className="mr-2 text-xs tabular-nums text-muted-foreground">
                    {index + 1} of {clips.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Previous clip"
                    disabled={index <= 0}
                    onClick={() => move(-1)}
                    className="grid size-10 place-items-center rounded-md border border-border disabled:opacity-30"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next clip"
                    disabled={index >= clips.length - 1}
                    onClick={() => move(1)}
                    className="grid size-10 place-items-center rounded-md border border-border disabled:opacity-30"
                  >
                    <ChevronRightIcon className="size-4" />
                  </button>
                </div>
              </div>
              {selected.pair ? (
                <>
                  <VideoPairCard key={selected.id} pair={selected.pair} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
                    <dl className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
                      <div>
                        <dt className="mb-1 text-xs text-muted-foreground">Estimated fill</dt>
                        <dd className="font-medium tabular-nums">
                          {selected.pair.measuredFillPct.toFixed(1)}%
                        </dd>
                      </div>
                      <div>
                        <dt className="mb-1 text-xs text-muted-foreground">Material</dt>
                        <dd>{selected.pair.debrisLabel}</dd>
                      </div>
                      <div>
                        <dt className="mb-1 text-xs text-muted-foreground">Estimated value</dt>
                        <dd className="tabular-nums">
                          {selected.pair.certifiedCubicYards > 0
                            ? money(selected.pair.dollarValue)
                            : "Capacity not set"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Masks highlight the bed and load. They support visual review; the fill estimate
                    is calculated separately. Use Compare to see the original alongside the masks.
                  </p>
                </>
              ) : (
                <UnanalyzedClip key={selected.id} clip={selected} />
              )}
            </>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border p-8 text-center">
              <div>
                <h2 className="text-lg font-medium">No matching clips</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try a clip number, truck ID, or material.
                </p>
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mt-4 rounded-md border border-border px-4 py-2 text-sm"
                >
                  Clear search
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function UnanalyzedClip({ clip }: { clip: GalleryClip }) {
  const [failed, setFailed] = useState(false);
  const { resolvedTier } = useVideoQuality();
  const videoUrl = getVideoVariantUrl(clip.url, resolvedTier) ?? clip.url;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative">
        <video
          src={videoUrl}
          controls
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
          poster={clip.url.replace("/videos/", "/videos/thumbnails/").replace(".mp4", ".jpg")}
          aria-label={`Original footage for clip ${clip.id}`}
          className="aspect-video w-full bg-black object-contain"
        />
        <div className="absolute right-2 top-2 z-10">
          <QualitySelector />
        </div>
      </div>
      <div className="p-5">
        {failed && (
          <p role="alert" className="mb-3 text-sm text-[var(--destructive)]">
            This video could not be loaded. Refresh to try again.
          </p>
        )}
        <h3 className="text-sm font-medium">{STATUS[clip.status]}</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {clip.status === "no-truck"
            ? "The recorded run detected no truck in this clip. No ticket was created. You can still inspect the original footage."
            : clip.status === "pending"
              ? "This clip is in the current batch, but a completed result has not been saved. No masks or estimate are available yet."
              : "This clip has not been analyzed. You can preview the original footage here. Open processing to manage the next run."}
        </p>
        {clip.status !== "no-truck" && (
          <Link
            href="/pipeline"
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-4 text-sm"
          >
            View processing
            <ArrowRightIcon className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
