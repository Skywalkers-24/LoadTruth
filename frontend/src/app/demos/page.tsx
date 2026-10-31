"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FilmIcon,
  UploadCloudIcon,
  Loader2Icon,
  SparklesIcon,
  VideoIcon,
  SearchIcon,
  LayoutGridIcon,
  ListIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";

import {
  analyzeDemoVideo,
  completeDemoUpload,
  demoPlayback,
  listDemoVideos,
  uploadDemoVideo,
  type DemoVideo,
} from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/shadcn/card";
import { Pagination } from "@/components/pagination";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { BenchmarkBrowser } from "@/components/demos/benchmark-browser";
import { BenchmarkVideoLibrary } from "@/components/demos/benchmark-video-library";
import { BENCHMARK_PAIRS, VideoPairCard } from "@/components/demos/video-pair-card";
import { unprocessedVideos } from "@/lib/benchmark-gallery";
import { getVideoVariantUrl, useVideoQuality } from "@/lib/video-quality";

import { cn } from "@/lib/utils";
import { useInView } from "@/lib/use-in-view";

const button =
  "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-40";
const input =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground";

export default function DemoVideosPage() {
  const { can, member } = useAuth();
  const isSuperAdmin = member?.role === "super_admin" || Boolean(can("manage_demo_videos"));
  const { selected, selectedId: eventId } = useEventContext();
  const qc = useQueryClient();
  const router = useRouter();

  const [offset, setOffset] = useState(0);
  const videos = useQuery({
    queryKey: ["demo-videos", offset],
    queryFn: () => listDemoVideos(offset),
    staleTime: 60_000,
  });

  // Filtering and view state
  const [tab, setTab] = useState<"pairs-with-mask" | "unprocessed" | "all">("pairs-with-mask");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDebris, setSelectedDebris] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [viewStyle, setViewStyle] = useState<"grid" | "browser">("grid");
  const [gridDensity, setGridDensity] = useState<"small" | "standard">("small");
  const pageSize = gridDensity === "small" ? 9 : 6;

  const debrisCounts = useMemo(() => {
    const counts: Record<string, number> = { all: BENCHMARK_PAIRS.length };
    for (const pair of BENCHMARK_PAIRS) {
      counts[pair.debrisClass] = (counts[pair.debrisClass] ?? 0) + 1;
    }
    return counts;
  }, []);

  const filteredPairs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return BENCHMARK_PAIRS.filter((pair) => {
      const matchDebris = selectedDebris === "all" || pair.debrisClass === selectedDebris;
      const matchQuery =
        !q ||
        pair.truckId.toLowerCase().includes(q) ||
        pair.debrisLabel.toLowerCase().includes(q) ||
        String(pair.pairNumber).includes(q) ||
        pair.matchFilename.toLowerCase().includes(q);
      return matchDebris && matchQuery;
    });
  }, [selectedDebris, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPairs.length / pageSize));
  const paginatedPairs = useMemo(() => {
    const start = page * pageSize;
    return filteredPairs.slice(start, start + pageSize);
  }, [filteredPairs, page, pageSize]);

  // Upload state (SuperAdmin)
  const [files, setFiles] = useState<File[]>([]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const analyze = useMutation({
    mutationFn: (id: string) => analyzeDemoVideo(eventId!, id),
    onSuccess: (job) => {
      qc.setQueryData(["ingest-job", eventId], job);
      router.push("/add");
    },
  });

  const verify = useMutation({
    mutationFn: completeDemoUpload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["demo-videos"] }),
  });

  const uploadMax = videos.data?.upload_max_bytes ?? 100 * 1024 ** 2;
  const analysisMax = videos.data?.analysis_max_bytes ?? 20 * 1024 ** 2;
  const writable =
    can("ingest") &&
    eventId &&
    !selected?.tags.includes("read-only") &&
    !selected?.tags.includes("playground");

  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  async function upload() {
    if (uploading || files.length === 0) return;
    setUploading(true);
    setErrors([]);
    const failures: string[] = [];
    for (const [index, file] of files.entries()) {
      try {
        if (!file.size || file.size > uploadMax)
          throw new Error(
            `Choose a non-empty clip below ${Math.round(uploadMax / 1024 ** 2)} MiB.`,
          );
        setProgress(`${index + 1}/${files.length} · ${file.name} · starting upload`);
        await uploadDemoVideo(
          file,
          {
            notes,
            reference_fill_pct: files.length === 1 && reference !== "" ? Number(reference) : null,
          },
          (pct) => setProgress(`${index + 1}/${files.length} · ${file.name} · ${pct}%`),
        );
        void qc.invalidateQueries({ queryKey: ["demo-videos"] });
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : "Upload failed"}`);
      }
    }
    setErrors(failures);
    setUploading(false);
    setProgress(
      failures.length
        ? "Some uploads need attention. Check pending clips below."
        : "All clips uploaded.",
    );
    setFiles([]);
    if (fileInput.current) fileInput.current.value = "";
    setOffset(0);
    void qc.invalidateQueries({ queryKey: ["demo-videos"] });
  }

  const customVideos = videos.data?.items ?? [];

  return (
    <AppShell section="Video library">
      <div className="lt-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pb-4">
        <header className="flex flex-wrap items-end shrink-0 justify-between gap-3 pb-1 pt-0.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Video library</h1>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {BENCHMARK_PAIRS.length} with outlines · {unprocessedVideos.length} not yet analyzed
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Compare original footage with truck and load outlines, or browse clips that have not
              been analyzed.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/pipeline" className="text-xs font-medium text-primary hover:underline">
              AI analysis →
            </Link>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setShowUpload((prev) => !prev)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                <UploadCloudIcon className="size-3.5" />
                {showUpload ? "Close upload" : "Upload footage"}
              </button>
            )}
          </div>
        </header>

        {/* ── CATEGORY TABS (MASKS VS UNPROCESSED) ── */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setTab("pairs-with-mask");
                setPage(0);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer",
                tab === "pairs-with-mask"
                  ? "bg-background text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <SparklesIcon className="size-3.5 text-primary" />
              <span>With outlines</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                {BENCHMARK_PAIRS.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("unprocessed");
                setPage(0);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer",
                tab === "unprocessed"
                  ? "bg-background text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FilmIcon className="size-3.5 text-amber-500" />
              <span>Not analyzed</span>
              <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                {unprocessedVideos.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("all");
                setPage(0);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all cursor-pointer",
                tab === "all"
                  ? "bg-background text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>All ({BENCHMARK_PAIRS.length + unprocessedVideos.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Saved video analysis</span>
          </div>
        </div>

        {/* ── OPTIONAL SUPERADMIN UPLOAD DRAWER ── */}
        {isSuperAdmin && showUpload && (
          <Card className="max-h-80 shrink-0 gap-3 overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UploadCloudIcon className="size-4 text-primary" />
                <h2 className="text-xs font-semibold">Upload Footage to Library</h2>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Max {Math.round(uploadMax / 1024 ** 2)} MiB per clip
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <input
                ref={fileInput}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                multiple
                disabled={uploading}
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="w-full rounded border border-border bg-background p-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-0.5 file:text-xs"
              />
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={uploading || files.length !== 1}
                className={input}
                placeholder="Reference fill % (optional)"
              />
              <input
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={uploading}
                className={input}
                placeholder="Notes (optional)"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              {progress ? <p className="text-xs text-muted-foreground">{progress}</p> : <div />}
              <button
                className={`${button} bg-primary text-primary-foreground hover:bg-primary/90 h-7 text-xs`}
                onClick={() => void upload()}
                disabled={uploading || !files.length}
              >
                {uploading ? (
                  <Loader2Icon className="size-3 animate-spin" />
                ) : (
                  <UploadCloudIcon className="size-3" />
                )}
                {uploading ? "Uploading…" : "Upload Clip"}
              </button>
            </div>
          </Card>
        )}

        {/* ── ERRORS (IF ANY) ── */}
        {(errors.length > 0 || analyze.isError || verify.isError) && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
          >
            {errors.map((error, i) => (
              <p key={i}>{error}</p>
            ))}
            {analyze.isError && <p>{analyze.error.message}</p>}
            {verify.isError && <p>{verify.error.message}</p>}
          </div>
        )}

        {/* ── SECTION 1: PAIRS WITH MASKS ── */}
        {(tab === "pairs-with-mask" || tab === "all") && (
          <section aria-label="Saved clips with outlines" className="flex flex-col gap-4">
            {/* ── TOOLBAR: FILTER PILLS + SEARCH + VIEW SWITCHER ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: "all", label: "All", count: debrisCounts.all },
                  { id: "vegetative", label: "Vegetative", count: debrisCounts.vegetative ?? 0 },
                  {
                    id: "construction_demolition",
                    label: "C&D",
                    count: debrisCounts.construction_demolition ?? 0,
                  },
                  { id: "white_goods", label: "White goods", count: debrisCounts.white_goods ?? 0 },
                  { id: "hazardous", label: "Hazardous", count: debrisCounts.hazardous ?? 0 },
                ].map(({ id, label, count }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSelectedDebris(id);
                      setPage(0);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      selectedDebris === id
                        ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span>{label}</span>
                    <span className="rounded-full bg-background/20 px-1.5 py-0.2 text-[10px] opacity-80">
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(0);
                    }}
                    placeholder="Search truck, debris, clip…"
                    className="h-8 w-44 sm:w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  )}
                </div>

                {viewStyle === "grid" && (
                  <div
                    className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs"
                    role="group"
                    aria-label="Grid size"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setGridDensity("small");
                        setPage(0);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-2 py-1 transition-colors cursor-pointer",
                        gridDensity === "small"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      title="Small size grid (fits on one screen)"
                    >
                      <span>Small grid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGridDensity("standard");
                        setPage(0);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-2 py-1 transition-colors cursor-pointer",
                        gridDensity === "standard"
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      title="Large 2-column grid"
                    >
                      <span>Large</span>
                    </button>
                  </div>
                )}

                <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewStyle("grid")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-2 py-1 transition-colors",
                      viewStyle === "grid"
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    title="Grid with Dual Feeds"
                  >
                    <LayoutGridIcon className="size-3.5" />
                    <span className="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewStyle("browser")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-2 py-1 transition-colors",
                      viewStyle === "browser"
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    title="Sidebar Browser"
                  >
                    <ListIcon className="size-3.5" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── CONTENT: EITHER MULTI-CARD GRID (DEFAULT) OR BROWSER ── */}
            {viewStyle === "browser" ? (
              <BenchmarkBrowser />
            ) : (
              <>
                {filteredPairs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
                    <FilmIcon className="size-8 text-muted-foreground/60" />
                    <p className="text-sm font-medium">No benchmark pairs match your filters</p>
                    <p className="text-xs text-muted-foreground">
                      Try clearing search or choosing another debris class.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDebris("all");
                        setSearchQuery("");
                      }}
                      className="mt-2 inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"
                    >
                      Reset filters
                    </button>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "grid gap-2.5",
                      gridDensity === "small"
                        ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                        : "grid-cols-1 md:grid-cols-2",
                    )}
                  >
                    {paginatedPairs.map((pair) => (
                      <VideoPairCard
                        key={pair.id}
                        pair={pair}
                        initialView="compare"
                        compact={gridDensity === "small"}
                      />
                    ))}
                  </div>
                )}

                {/* ── PAGINATION CONTROLS ── */}
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-3 text-xs text-muted-foreground">
                    <span>
                      Showing {page * pageSize + 1}–
                      {Math.min((page + 1) * pageSize, filteredPairs.length)} of{" "}
                      {filteredPairs.length} benchmark pairs
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                      >
                        <ChevronLeftIcon className="size-3.5" />
                        <span>Previous</span>
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPage(i)}
                          className={cn(
                            "size-8 rounded-md text-xs font-medium transition-colors",
                            page === i
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "border border-border bg-background text-foreground hover:bg-muted",
                          )}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                      >
                        <span>Next</span>
                        <ChevronRightIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ── SECTION 2: BENCHMARK FOOTAGE WITHOUT SAVED MASKS ── */}
        {(tab === "unprocessed" || tab === "all") && (
          <section aria-label="Unprocessed source clips" className="flex flex-col gap-3">
            {tab === "all" && (
              <div className="my-2 flex items-center gap-3 border-t border-border/80 pt-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Footage Without Saved Masks
                </span>
              </div>
            )}
            <BenchmarkVideoLibrary videos={unprocessedVideos} />
          </section>
        )}

        {/* ── ADDITIONAL / CUSTOM UPLOADED CLIPS (IF ANY) ── */}
        {customVideos.length > 0 && (
          <details className="max-h-72 shrink-0 overflow-y-auto border-t border-border pt-3">
            <summary className="cursor-pointer text-sm font-medium">
              Your uploaded footage ({customVideos.length})
            </summary>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <VideoIcon className="size-3.5 text-primary" />
              <span>Uploaded clips</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {customVideos.map((video) => (
                <Card key={video.id} className="gap-2 p-3">
                  {video.status === "ready" && <CustomClipPreview video={video} />}
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold truncate">{video.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {(video.size_bytes / 1024 ** 2).toFixed(1)} MiB
                    </span>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    {video.reference_fill_pct !== null && (
                      <span className="text-[10px] text-muted-foreground">
                        Ref: {Number(video.reference_fill_pct)}%
                      </span>
                    )}

                    {video.status === "ready" ? (
                      <button
                        className={`${button} h-6 px-2 text-[10px] border-primary/40 text-primary`}
                        disabled={!writable || analyze.isPending || video.size_bytes > analysisMax}
                        onClick={() => analyze.mutate(video.id)}
                      >
                        <SparklesIcon className="size-2.5" />
                        Analyze SAM
                      </button>
                    ) : (
                      isSuperAdmin && (
                        <button
                          className={`${button} h-6 px-2 text-[10px]`}
                          disabled={verify.isPending}
                          onClick={() => verify.mutate(video.id)}
                        >
                          Verify
                        </button>
                      )
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </details>
        )}

        {videos.data && videos.data.total > 24 && (
          <Pagination total={videos.data.total} limit={24} offset={offset} onOffset={setOffset} />
        )}
      </div>
    </AppShell>
  );
}

function CustomClipPreview({ video }: { video: DemoVideo }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isVisible = useInView(containerRef, "300px");
  const [failed, setFailed] = useState(false);
  const playback = useQuery({
    queryKey: ["demo-playback", video.id],
    queryFn: () => demoPlayback(video.id),
    enabled: isVisible && Boolean(video.id),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  if (!isVisible) {
    return (
      <div
        ref={containerRef}
        role="status"
        className="flex aspect-video items-center justify-center rounded bg-secondary/50 text-[10px] text-muted-foreground"
      >
        <FilmIcon className="size-4 opacity-50" />
      </div>
    );
  }

  if (playback.isError || failed) {
    return (
      <div
        ref={containerRef}
        className="flex aspect-video flex-col items-center justify-center gap-1 rounded bg-secondary text-[10px]"
      >
        <p>Preview failed.</p>
        <button
          className={`${button} h-6 text-[10px]`}
          onClick={() => {
            setFailed(false);
            void playback.refetch();
          }}
        >
          Reload
        </button>
      </div>
    );
  }

  if (!playback.data) {
    return (
      <div
        ref={containerRef}
        role="status"
        className="flex aspect-video items-center justify-center rounded bg-secondary"
      >
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { resolvedTier } = useVideoQuality();
  const videoUrl = getVideoVariantUrl(playback.data.url, resolvedTier) ?? playback.data.url;

  return (
    <video
      ref={containerRef as any}
      key={videoUrl}
      src={videoUrl}
      controls
      playsInline
      preload="metadata"
      aria-label={`Preview ${video.title}`}
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded bg-black object-contain"
    />
  );
}
