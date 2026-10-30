"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilmIcon, UploadCloudIcon, Loader2Icon, SparklesIcon, VideoIcon } from "lucide-react";

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
import { BenchmarkVideoLibrary } from "@/components/demos/benchmark-video-library";
import { BENCHMARK_PAIRS, VideoPairCard } from "@/components/demos/video-pair-card";
import manifest from "@/lib/benchmark-videos.json";
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
  const [tab, setTab] = useState<"pairs-with-mask" | "unprocessed" | "all">("pairs-with-mask");
  const videos = useQuery({
    queryKey: ["demo-videos", offset],
    queryFn: () => listDemoVideos(offset),
  });

  // Filtering state
  const [showUpload, setShowUpload] = useState(false);

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

  const customVideos = videos.data?.items ?? [];

  return (
    <AppShell section="Demo Videos">
      <div className="lt-scroll lt-fab-safe flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-6">
        {/* ── ULTRA-COMPACT HEADER (ZERO BLOAT) ── */}
        <header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/60 pb-2.5 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
              <FilmIcon className="size-4 text-primary" />
              Benchmark Footage
            </h1>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {BENCHMARK_PAIRS.length} With Masks · {manifest.videos.length} Awaiting Processing
            </span>
            <span className="text-[11px] text-muted-foreground hidden lg:inline">
              · Configurable Muse inference options:{" "}
              <strong className="font-medium text-foreground">
                Meta direct · Fireworks AI · Modal · Baseten
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/pipeline" className="text-xs font-medium text-primary hover:underline">
              Pipeline →
            </Link>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setShowUpload((prev) => !prev)}
                className="inline-flex h-7 items-center gap-1 rounded border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-accent"
              >
                <UploadCloudIcon className="size-3" />
                <span>{showUpload ? "Close" : "Upload"}</span>
              </button>
            )}
          </div>
        </header>

        {/* ── TWO-SECTION CATEGORY TABS (MASKS VS UNPROCESSED) ── */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setTab("pairs-with-mask")}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer",
                tab === "pairs-with-mask"
                  ? "bg-background text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <SparklesIcon className="size-3.5 text-primary" />
              <span>Pairs With Masks</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                {BENCHMARK_PAIRS.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTab("unprocessed")}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-semibold transition-all cursor-pointer",
                tab === "unprocessed"
                  ? "bg-background text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FilmIcon className="size-3.5 text-amber-500" />
              <span>Unprocessed Footage</span>
              <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                {manifest.videos.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTab("all")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all cursor-pointer",
                tab === "all"
                  ? "bg-background text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>All ({BENCHMARK_PAIRS.length + manifest.videos.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Meta SAM 3.1 & Muse Spark · Live Polygon Overlays</span>
          </div>
        </div>

        {/* ── OPTIONAL SUPERADMIN UPLOAD DRAWER ── */}
        {isSuperAdmin && showUpload && (
          <Card className="gap-3 p-4 border-dashed bg-muted/10">
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

        {/* ── SECTION 1: PROCESSED BENCHMARK PAIRS WITH MASKS & REPLAY ── */}
        {(tab === "pairs-with-mask" || tab === "all") && (
          <section aria-label="Processed pairs with segmentation masks" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-foreground">
                  Processed Benchmark Pairs · With Masks & Replay Option
                </span>
                <span className="text-muted-foreground hidden md:inline">
                  — Synchronized raw CCTV & SAM 3.1 segmentation with Bed, Load, Body layer toggles, HUD fill %, and interactive replay.
                </span>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {BENCHMARK_PAIRS.length} Verified Pairs
              </span>
            </div>

            <div className="grid gap-3.5 lg:grid-cols-2">
              {BENCHMARK_PAIRS.map((pair) => (
                <VideoPairCard
                  key={pair.id}
                  pair={pair}
                  canAnalyze={Boolean(writable)}
                  isAnalyzing={analyze.isPending}
                  onAnalyze={(id) => analyze.mutate(id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── SECTION 2: UNPROCESSED BENCHMARK FOOTAGE (50 CLIPS) ── */}
        {(tab === "unprocessed" || tab === "all") && (
          <section aria-label="Unprocessed source clips" className="flex flex-col gap-3">
            {tab === "all" && (
              <div className="my-2 border-t border-border/80" />
            )}
            <BenchmarkVideoLibrary />
          </section>
        )}

        {/* ── ADDITIONAL / CUSTOM UPLOADED CLIPS (IF ANY) ── */}
        {customVideos.length > 0 && (
          <div className="mt-2 flex flex-col gap-2 border-t border-border/80 pt-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <VideoIcon className="size-3.5 text-primary" />
              <span>Additional Uploaded Feeds ({customVideos.length})</span>
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
          </div>
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

  return (
    <video
      ref={containerRef as any}
      key={playback.data.url}
      src={playback.data.url}
      controls
      playsInline
      preload="metadata"
      aria-label={`Preview ${video.title}`}
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded bg-black object-contain"
    />
  );
}
