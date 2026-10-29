"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilmIcon, PlayIcon, UploadCloudIcon, Loader2Icon } from "lucide-react";

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
  const { can } = useAuth();
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
  const [preview, setPreview] = useState<{ video: DemoVideo; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
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
        : "All clips verified in B2.",
    );
    setFiles([]);
    if (fileInput.current) fileInput.current.value = "";
    setOffset(0);
    void qc.invalidateQueries({ queryKey: ["demo-videos"] });
  }

  async function play(video: DemoVideo) {
    setPreviewLoading(video.id);
    try {
      const result = await demoPlayback(video.id);
      setPreview({ video, url: result.url });
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Playback unavailable"]);
    } finally {
      setPreviewLoading(null);
    }
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
            View Pipeline Runs →
          </Link>
        </header>
        {can("ingest") && (
          <Card className="gap-4 p-5">
            <div className="flex items-start gap-3">
              <UploadCloudIcon className="mt-1 size-5 shrink-0 text-primary" />
              <div>
                <h2 className="text-sm font-semibold">Upload to the demo library</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Files go straight to private B2 storage. Keep this tab open until verification
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
        {preview && (
          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="truncate text-sm font-semibold">{preview.video.title}</h2>
              <button className={button} onClick={() => setPreview(null)}>
                Close preview
              </button>
            </div>
            <video
              key={preview.url}
              controls
              playsInline
              autoPlay
              preload="metadata"
              src={preview.url}
              className="max-h-[420px] w-full rounded-lg bg-black"
            />
            <p className="text-xs text-muted-foreground">
              Private playback link expires. Select Preview again to refresh it.
            </p>
          </Card>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Saved clips <span className="text-muted-foreground">({videos.data?.total ?? 0})</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Reference labels are user-supplied; a clip library alone is not an accuracy benchmark.
          </p>
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
                      {video.status === "ready" ? "Saved in B2" : "Upload unverified"}
                    </p>
                  </div>
                </div>
                {video.notes && (
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
                        className={button}
                        onClick={() => void play(video)}
                        disabled={previewLoading === video.id}
                      >
                        <PlayIcon className="size-3.5" />
                        {previewLoading === video.id ? "Loading…" : "Preview"}
                      </button>
                      <button
                        className={`${button} border-primary/40 text-primary`}
                        disabled={!writable || analyze.isPending || video.size_bytes > analysisMax}
                        onClick={() => analyze.mutate(video.id)}
                      >
                        Analyze in selected event
                      </button>
                    </>
                  ) : (
                    can("ingest") && (
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
