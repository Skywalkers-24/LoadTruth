"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilmIcon, UploadCloudIcon, Loader2Icon } from "lucide-react";

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

  return (
    <AppShell section="Demo Videos">
      <div className="lt-scroll lt-fab-safe flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="lt-page-title">Demo Videos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your reusable clips for demos, analysis, and known-volume trials.
            </p>
          </div>
          <Link href="/pipeline" className={button}>
            View AI Pipeline Runs →
          </Link>
        </header>
        {!isSuperAdmin ? (
          <Card className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-dashed bg-muted/20">
            <div className="flex items-start sm:items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <FilmIcon className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Demo Library: View & Pipeline Replay Access
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Uploading and managing demo clips requires Developer / SuperAdmin privileges. You can preview clips and replay pipelines below.
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
                  <h2 className="text-sm font-semibold">Upload to the demo library</h2>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    SuperAdmin
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload clips to your private library. Keep this tab open until the upload
                  finishes.
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
                  placeholder="Material, angle, lighting, measurement method"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Library: up to {Math.round(uploadMax / 1024 ** 2)} MiB per clip. Analysis here: up
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Saved clips <span className="text-muted-foreground">({videos.data?.total ?? 0})</span>
          </h2>
        </div>
        {videos.isLoading ? (
          <p role="status" className="p-8 text-center text-sm text-muted-foreground">
            Loading demo videos…
          </p>
        ) : videos.isError ? (
          <div role="alert" className="p-8 text-center">
            <p>Demo videos could not be loaded.</p>
            <button className={`${button} mt-3`} onClick={() => void videos.refetch()}>
              Try again
            </button>
          </div>
        ) : !videos.data?.items.length ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
            <FilmIcon className="size-8 text-muted-foreground" />
            <h3 className="font-semibold">Your demo library starts here</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Upload your truck clips once, then reuse them across events without uploading them
              again.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {videos.data.items.map((video) => (
              <Card key={video.id} className="gap-4 p-4">
                {video.status === "ready" && <DemoClipPreview video={video} />}
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FilmIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold" title={video.title}>
                      {video.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {(video.size_bytes / 1024 ** 2).toFixed(1)} MiB ·{" "}
                      {video.status === "ready" ? "Ready" : "Upload incomplete"}
                    </p>
                  </div>
                </div>
                {video.notes &&
                  !video.notes.startsWith("Packaged Meta-processed showcase clip.") && (
                    <p className="line-clamp-3 text-xs text-muted-foreground">{video.notes}</p>
                  )}
                {video.reference_fill_pct !== null && (
                  <p className="text-xs">
                    Reference fill: <strong>{Number(video.reference_fill_pct)}%</strong>
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-2">
                  {video.status === "ready" ? (
                    <>
                      <button
                        className={`${button} border-primary/40 text-primary`}
                        disabled={!writable || analyze.isPending || video.size_bytes > analysisMax}
                        onClick={() => analyze.mutate(video.id)}
                      >
                        Analyze in selected event
                      </button>
                    </>
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
                {video.size_bytes > analysisMax && (
                  <p className="text-xs text-muted-foreground">
                    Stored safely. Trim a copy below {Math.round(analysisMax / 1024 ** 2)} MiB to
                    analyze on this instance.
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
        {videos.data && videos.data.total > 24 && (
          <Pagination total={videos.data.total} limit={24} offset={offset} onOffset={setOffset} />
        )}
        {!writable && (
          <p className="text-xs text-muted-foreground">
            Select a writable event and an authorized role to start analysis.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function DemoClipPreview({ video }: { video: DemoVideo }) {
  const [failed, setFailed] = useState(false);
  const playback = useQuery({
    queryKey: ["demo-playback", video.id],
    queryFn: () => demoPlayback(video.id),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
  if (playback.isError || failed)
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg bg-secondary text-sm">
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
  if (!playback.data)
    return (
      <div
        role="status"
        className="flex aspect-video items-center justify-center rounded-lg bg-secondary"
      >
        <Loader2Icon className="size-6 animate-spin" />
        <span className="sr-only">Loading preview</span>
      </div>
    );
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
