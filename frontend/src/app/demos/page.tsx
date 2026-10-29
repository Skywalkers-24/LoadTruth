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
  CameraIcon,
  SearchIcon,
  FilterIcon,
  SlidersHorizontalIcon,
  CheckCircle2Icon,
  VideoIcon,
  PlusCircleIcon,
  PlayIcon,
} from "lucide-react";

import {
  analyzeDemoVideo,
  completeDemoUpload,
  demoPlayback,
  listDemoVideos,
  uploadDemoVideo,
  SHOWCASE_EVENT_ID,
  type DebrisClass,
  type DemoVideo,
} from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { Pagination } from "@/components/pagination";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import {
  BENCHMARK_PAIRS,
  VideoPairCard,
  type BenchmarkPairDef,
} from "@/components/demos/video-pair-card";

const button =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-40";
const input =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground";

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
  });

  // Filtering state
  const [selectedDebris, setSelectedDebris] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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
  const writable = can("ingest") && eventId && !selected?.tags.includes("read-only");

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

  // Map DemoVideo items from backend to known benchmark pairs
  const videoItems = videos.data?.items ?? [];

  const pairVideoMap = useMemo(() => {
    const map = new Map<string, DemoVideo>();
    for (const pair of BENCHMARK_PAIRS) {
      const match = videoItems.find(
        (v) =>
          v.filename === pair.matchFilename ||
          v.title.toLowerCase().includes(pair.debrisClass.replace("_", " ")) ||
          v.title.includes(`Showcase ${pair.pairNumber}`),
      );
      if (match) map.set(pair.id, match);
    }
    return map;
  }, [videoItems]);

  // Identify any custom uploaded clips that are not in the 5 benchmark pairs
  const customVideos = useMemo(() => {
    const matchedIds = new Set(Array.from(pairVideoMap.values()).map((v) => v.id));
    return videoItems.filter((v) => !matchedIds.has(v.id));
  }, [videoItems, pairVideoMap]);

  // Filter benchmark pairs based on search and category
  const filteredPairs = useMemo(() => {
    return BENCHMARK_PAIRS.filter((pair) => {
      const matchesCategory =
        selectedDebris === "all" || pair.debrisClass === selectedDebris;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        pair.truckId.toLowerCase().includes(q) ||
        pair.debrisLabel.toLowerCase().includes(q) ||
        pair.notes.toLowerCase().includes(q) ||
        pair.debrisDescription.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [selectedDebris, searchQuery]);

  return (
    <AppShell section="Demo Videos">
      <div className="lt-scroll lt-fab-safe flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-8">
        {/* ── SECTION HEADER ── */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <FilmIcon className="size-4" />
              </span>
              <h1 className="lt-page-title">
                CCTV Demo Pairs · Real vs. AI-Analyzed Footage
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Side-by-side video evidence comparing original CCTV camera feeds with synchronized Meta SAM 3.1 AI segmentation outlines and volumetric load analysis.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href={`/console?event=${SHOWCASE_EVENT_ID}`}
              className={button}
            >
              Open Review Console →
            </Link>
            <Link
              href="/pipeline"
              className={`${button} border-primary/30 text-primary bg-primary/5 hover:bg-primary/10`}
            >
              <SparklesIcon className="size-3.5" />
              View AI Pipeline Runs →
            </Link>
          </div>
        </header>

        {/* ── SUPERADMIN PERMISSION BANNER / UPLOAD ── */}
        {!isSuperAdmin ? (
          <Card className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-dashed bg-muted/20">
            <div className="flex items-start sm:items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <CameraIcon className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Demo Pair Library: View, Synchronize & Pipeline Replay Access
                </p>
                <p className="text-[11px] text-muted-foreground">
                  You can inspect all paired CCTV and Meta SAM 3.1 feeds, synchronize playback, and replay AI analysis pipelines. SuperAdmin login is required to upload new video pairs.
                </p>
              </div>
            </div>
            <Link
              href="/superadmin"
              className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              SuperAdmin Login →
            </Link>
          </Card>
        ) : (
          <Card className="gap-4 p-5">
            <div className="flex items-start gap-3">
              <UploadCloudIcon className="mt-1 size-5 shrink-0 text-primary" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Upload CCTV Footage to Pair Library</h2>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    SuperAdmin
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload raw truck clips to your library. Each uploaded clip can be analyzed with Meta SAM 3.1 to create an AI-analyzed comparison pair.
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Video clips
                <input
                  ref={fileInput}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  multiple
                  disabled={uploading}
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-foreground"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Reference fill % (optional, one clip)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  disabled={uploading || files.length !== 1}
                  className={input}
                  placeholder="Known measured fill, e.g. 50"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium">
                Notes (optional)
                <input
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={uploading}
                  className={input}
                  placeholder="Material, camera angle, lighting condition"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Library: up to {Math.round(uploadMax / 1024 ** 2)} MiB per clip. Analysis: up
                to {Math.round(analysisMax / 1024 ** 2)} MiB, one clip at a time.
              </p>
              <button
                className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
                onClick={() => void upload()}
                disabled={uploading || !files.length}
              >
                {uploading ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <UploadCloudIcon className="size-4" />
                )}
                {uploading
                  ? "Uploading…"
                  : `Upload${files.length ? ` ${files.length} clip${files.length > 1 ? "s" : ""}` : " clips"}`}
              </button>
            </div>

            {progress && (
              <p role="status" className="text-xs text-muted-foreground">
                {progress}
              </p>
            )}
          </Card>
        )}

        {/* ── ERRORS ── */}
        {(errors.length > 0 || analyze.isError || verify.isError) && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {errors.map((error, i) => (
              <p key={i}>{error}</p>
            ))}
            {analyze.isError && <p>{analyze.error.message}</p>}
            {verify.isError && <p>{verify.error.message}</p>}
          </div>
        )}

        {/* ── SECTION TITLE & FILTER CONTROLS ── */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  Verified Video Comparison Pairs
                </h2>
                <Badge variant="secondary" className="font-mono text-xs">
                  {filteredPairs.length} of {BENCHMARK_PAIRS.length} Sets
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Each set pairs the unaltered CCTV camera recording with its matching Meta SAM 3.1 spatial segmentation mask (truck bed, debris volume) and Muse Spark load analysis.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                <CameraIcon className="size-3 text-slate-500" />
                Raw CCTV Feed
                <span className="font-semibold text-foreground">⟷</span>
                <SparklesIcon className="size-3 text-primary" />
                Meta SAM 3.1 Active
              </span>
            </div>
          </div>

          {/* Filter Pills & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Category:</span>
              {[
                { id: "all", label: "All Pairs" },
                { id: "white_goods", label: "White Goods" },
                { id: "hazardous", label: "Hazardous" },
                { id: "construction_demolition", label: "Construction & Demolition" },
                { id: "vegetative", label: "Vegetative" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedDebris(cat.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedDebris === cat.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="relative min-w-48 sm:w-64">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search truck ID or material…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* ── VIDEO PAIRS LIST ── */}
        {filteredPairs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
            <FilmIcon className="size-8 text-muted-foreground" />
            <h3 className="font-semibold">No video pairs match your filter</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Try adjusting your category filter or search query to view available demo video pairs.
            </p>
            <button
              className={button}
              onClick={() => {
                setSelectedDebris("all");
                setSearchQuery("");
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {filteredPairs.map((pair) => (
              <VideoPairCard
                key={pair.id}
                pair={pair}
                videoRecord={pairVideoMap.get(pair.id) ?? null}
                onAnalyze={(videoId) => analyze.mutate(videoId)}
                isAnalyzing={analyze.isPending}
                canAnalyze={Boolean(writable)}
              />
            ))}
          </div>
        )}

        {/* ── ADDITIONAL / CUSTOM UPLOADED CLIPS (IF ANY) ── */}
        {customVideos.length > 0 && (
          <div className="mt-4 flex flex-col gap-4 border-t border-border/80 pt-6">
            <div>
              <div className="flex items-center gap-2">
                <VideoIcon className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Additional Uploaded Feeds ({customVideos.length})
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Custom clips uploaded to your library. You can run the Meta AI pipeline to generate paired SAM segmentation footage.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {customVideos.map((video) => (
                <Card key={video.id} className="gap-4 p-4">
                  {video.status === "ready" && <CustomClipPreview video={video} />}
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <FilmIcon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold" title={video.title}>
                        {video.title}
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(video.size_bytes / 1024 ** 2).toFixed(1)} MiB ·{" "}
                        {video.status === "ready" ? "Ready" : "Upload incomplete"}
                      </p>
                    </div>
                  </div>

                  {video.notes && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{video.notes}</p>
                  )}

                  {video.reference_fill_pct !== null && (
                    <p className="text-xs">
                      Reference fill: <strong>{Number(video.reference_fill_pct)}%</strong>
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2">
                    {video.status === "ready" ? (
                      <button
                        className={`${button} border-primary/40 text-primary`}
                        disabled={!writable || analyze.isPending || video.size_bytes > analysisMax}
                        onClick={() => analyze.mutate(video.id)}
                      >
                        <SparklesIcon className="size-3.5" />
                        Analyze with Meta SAM 3.1
                      </button>
                    ) : (
                      isSuperAdmin && (
                        <button
                          className={button}
                          disabled={verify.isPending}
                          onClick={() => verify.mutate(video.id)}
                        >
                          Check completed upload
                        </button>
                      )
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {videos.data && videos.data.total > 24 && (
          <Pagination total={videos.data.total} limit={24} offset={offset} onOffset={setOffset} />
        )}

        {!writable && (
          <p className="text-xs text-muted-foreground">
            Select an active event from the top switcher to start pipeline analysis on any demo clip.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function CustomClipPreview({ video }: { video: DemoVideo }) {
  const [failed, setFailed] = useState(false);
  const playback = useQuery({
    queryKey: ["demo-playback", video.id],
    queryFn: () => demoPlayback(video.id),
    staleTime: 10 * 60_000,
    retry: 1,
  });

  if (playback.isError || failed) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg bg-secondary text-xs">
        <p>Preview could not load.</p>
        <button
          className={button}
          onClick={() => {
            setFailed(false);
            void playback.refetch();
          }}
        >
          Reload preview
        </button>
      </div>
    );
  }

  if (!playback.data) {
    return (
      <div
        role="status"
        className="flex aspect-video items-center justify-center rounded-lg bg-secondary"
      >
        <Loader2Icon className="size-5 animate-spin" />
        <span className="sr-only">Loading preview</span>
      </div>
    );
  }

  return (
    <video
      key={playback.data.url}
      src={`${playback.data.url}#t=0.1`}
      controls
      playsInline
      preload="metadata"
      aria-label={`Preview ${video.title}`}
      onLoadedMetadata={(event) => {
        const player = event.currentTarget;
        if (player.duration > 0.1) player.currentTime = 0.1;
      }}
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded-lg bg-black object-contain"
    />
  );
}
