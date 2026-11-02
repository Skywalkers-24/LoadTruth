"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  FilmIcon,
  Loader2Icon,
  SparklesIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";

import { BENCHMARK_PAIRS } from "@/components/demos/video-pair-card";
import { compressVideoClient, getUploadLimits, validateUploadFile } from "@/lib/video-compress";

import {
  createPracticeTicket,
  listPracticeSources,
  ApiError,
  getTicket,
  getTicketPipeline,
  listDemoVideos,
  type PipelineProgress,
  type PipelineStage,
  type Ticket,
} from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { LivePipelineFlow } from "@/components/ai/live-pipeline-flow";
import { PipelineWorkbench } from "@/components/ai/pipeline-workbench";
import { EvidenceCanvas } from "@/components/console/evidence-canvas";
import { shortId } from "@/components/console/ticket-metadata";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { FadeIn } from "@/components/ui/motion";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useLatestIngestJob, useSubmitIngestJob } from "@/lib/hooks";
import { pipelineAttemptKey } from "@/lib/pipeline-progress";
import { debrisLabel, money, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Map an ingest failure to a clear, status-specific message for the operator. */
function ingestErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return err.message || "That file could not be read. Upload a video or image clip.";
      case 403:
        return "You don't have permission to upload clips for this event.";
      case 404:
        return "This event no longer exists. Pick another event and try again.";
      case 422:
        return err.message || "No truck or load was detected, so no ticket was created.";
      case 413:
        return err.message || "That file is too large. Upload a shorter or smaller clip.";
      case 503:
        return err.message || "The AI models aren't available right now. Please try again shortly.";
      default:
        return err.message || "The clip could not be processed. Please try again.";
    }
  }
  return "Something went wrong uploading that clip. Please try again.";
}

/**
 * New Ticket: upload a clip or image of a loaded truck; the pipeline estimates
 * fill and creates a ticket; only flagged tickets need review. The event ledger lives on /tickets.
 */
export default function NewTicketPage() {
  const { selectedId } = useEventContext();
  return <CaptureWorkspace key={selectedId ?? "none"} />;
}

function CaptureWorkspace() {
  const { selected, selectedId: eventId } = useEventContext();
  const eventPairs = useMemo(
    () => BENCHMARK_PAIRS.filter((pair) => pair.eventId === eventId),
    [eventId],
  );
  const { member } = useAuth();
  const canRunFresh = member?.role === "super_admin" || member?.role === "county_admin";
  const playground = Boolean(selected?.tags.includes("playground"));
  const [bypassCache, setBypassCache] = useState(false);
  const [keepFootage, setKeepFootage] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState<string>("");
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [customResult, setCustomResult] = useState<{
    ticket: Ticket;
    stages: PipelineStage[];
    filename?: string;
  } | null>(null);
  const [preparingUpload, setPreparingUpload] = useState(false);
  const router = useRouter();
  const ingest = useSubmitIngestJob();
  const latest = useLatestIngestJob(eventId);
  const queryClient = useQueryClient();
  const library = useQuery({
    queryKey: ["demo-videos", 0],
    queryFn: () => listDemoVideos(0),
    staleTime: 60_000,
  });
  const uploadLimits = useMemo(() => getUploadLimits(), []);
  const [autoCompress, setAutoCompress] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const analysisLimit = library.data?.analysis_max_bytes ?? uploadLimits.maxSizeBytes;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const rawTicket = preparingUpload || ingest.isPending ? null : (latest.data?.ticket ?? null);
  const [dismissedTicketId, setDismissedTicketId] = useState<string | null>(null);
  const resultTicket = customResult?.ticket ?? rawTicket;
  const activeTicket = resultTicket?.id === dismissedTicketId ? null : resultTicket;
  const processing = latest.data?.status === "accepted" || latest.data?.status === "running";
  const busy = preparingUpload || ingest.isPending || processing || compressing;
  useEffect(() => {
    if (!ingest.isPending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [ingest.isPending]);
  const [ignoredAttempt, setIgnoredAttempt] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [dismissedJobId, setDismissedJobId] = useState<string | null>(null);
  const [hasUploaded, setHasUploaded] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [showUploadManual, setShowUploadManual] = useState(false);
  const hideUploadBox = (hasUploaded || busy) && !showUploadManual;

  useEffect(() => {
    setDismissedJobId(null);
    setDismissedTicketId(null);
  }, [eventId]);

  const ticketPipeline = useQuery({
    queryKey: ["ticket-pipeline", rawTicket?.id],
    queryFn: () => getTicketPipeline(rawTicket!.id),
    enabled: Boolean(rawTicket?.id && !customResult),
    staleTime: 60_000,
  });

  const activeStages = customResult?.stages ?? ticketPipeline.data ?? null;

  const showcaseReadOnly = Boolean(selected?.tags.includes("read-only"));

  async function submit(file: File) {
    if (!canRunFresh) {
      setError(
        "Uploading footage and running AI analysis is available in Administrator mode. Use the saved video selector to replay existing analysis.",
      );
      return;
    }
    if (playground) {
      setError(
        "Sandbox is replay-only. Choose a saved video below; uploads and new AI analysis are disabled here.",
      );
      return;
    }
    if (showcaseReadOnly && !canRunFresh) {
      setError(
        "This event is read-only. Choose an existing video from the library dropdown below to preview its analysis and ticket.",
      );
      return;
    }
    const targetEventId = eventId;
    if (!targetEventId || busy || latest.isLoading) return;
    if (file.size === 0) {
      setError("This file is empty. Choose a truck video or image.");
      return;
    }
    if (file.type && !file.type.startsWith("video/") && !file.type.startsWith("image/")) {
      setError("Choose a video or image file.");
      return;
    }

    setError(null);
    setCustomResult(null);
    setDismissedTicketId(null);
    setPreparingUpload(true);
    setHasUploaded(true);
    setUploadedFileName(file.name);

    let check: Awaited<ReturnType<typeof validateUploadFile>>;
    try {
      check = await validateUploadFile(file, uploadLimits);
    } catch (err) {
      setPreparingUpload(false);
      setHasUploaded(false);
      setUploadedFileName(null);
      setError(
        err instanceof Error
          ? `Could not inspect this file: ${err.message}`
          : "Could not inspect this file. Choose another clip and try again.",
      );
      return;
    }
    if (!check.ok) {
      setPreparingUpload(false);
      setHasUploaded(false);
      setUploadedFileName(null);
      setError(check.error || "File did not pass validation.");
      return;
    }

    let fileToUpload = file;
    // Client-side compression if enabled and video exceeds threshold (e.g. 10MB)
    if (
      autoCompress &&
      file.type.startsWith("video/") &&
      file.size > uploadLimits.compressThresholdBytes
    ) {
      setCompressing(true);
      setCompressProgress(0);
      try {
        fileToUpload = await compressVideoClient(
          file,
          check.metadata,
          uploadLimits.targetCompressedBytes,
          (pct) => setCompressProgress(pct),
        );
      } catch (err) {
        console.warn("Client-side compression fallback to original:", err);
      } finally {
        setCompressing(false);
      }
    }

    if (latest.data?.id) setDismissedJobId(latest.data.id);
    setPreparingUpload(false);
    setUploadedFileName(fileToUpload.name);
    setShowUploadManual(false);
    const previousRun = queryClient.getQueryData<PipelineProgress | null>([
      "pipeline-progress",
      targetEventId,
    ]);
    setIgnoredAttempt(previousRun ? pipelineAttemptKey(previousRun) : undefined);
    ingest.mutate(
      {
        eventId: targetEventId,
        file: fileToUpload,
        bypassCache: canRunFresh && bypassCache,
        keepFootage,
      },
      {
        onError: (err) => setError(ingestErrorMessage(err)),
      },
    );
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void submit(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function processExistingVideo(filename: string) {
    if (!filename || busy || loadingExisting) return;
    const pair = eventPairs.find((p) => p.matchFilename === filename);
    if (!pair) return;

    setLoadingExisting(true);
    setError(null);
    setDismissedTicketId(null);
    if (latest.data?.id) setDismissedJobId(latest.data.id);
    setHasUploaded(true);
    setUploadedFileName(pair.matchFilename);
    setShowUploadManual(false);
    try {
      if (showcaseReadOnly || !playground) {
        // Replay the saved result directly; this path never invokes inference.
        const [ticketData, stagesData] = await Promise.all([
          getTicket(pair.ticketId),
          getTicketPipeline(pair.ticketId),
        ]);
        setCustomResult({
          ticket: ticketData,
          stages: stagesData,
          filename: pair.matchFilename,
        });
      } else {
        // Sandbox: create a reviewable copy using saved analysis only.
        if (!eventId) throw new Error("Please select an active event first.");
        const newTicket = await createPracticeTicket(eventId, pair.ticketId);
        const stagesData = await getTicketPipeline(newTicket.id);
        setCustomResult({
          ticket: newTicket,
          stages: stagesData,
          filename: pair.matchFilename,
        });
        queryClient.invalidateQueries({ queryKey: ["tickets"] });
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] });
        queryClient.invalidateQueries({ queryKey: ["event-dashboard"] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze video");
    } finally {
      setLoadingExisting(false);
    }
  }

  if (playground) return <SavedFootagePicker />;

  return (
    <AppShell section="New Ticket">
      <div className="lt-scroll lt-fab-safe flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-6">
        <div className="flex min-w-0 shrink-0 flex-col">
          <Link
            href="/tickets"
            className="mb-2 self-start text-[12px] text-muted-foreground hover:text-foreground"
          >
            ← All tickets
          </Link>
          <div className="flex items-center justify-between gap-3">
            <h1 className="lt-page-title">New Ticket</h1>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Upload evidence for{" "}
            <span className="font-medium text-foreground">{selected?.name ?? "this event"}</span> to
            identify the truck, estimate fill, and create a ticket. Only flagged results need
            review.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-4">
          {/* Once uploaded, hide the uploaded box and only keep the pipeline on the screen */}
          {hideUploadBox ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5 px-4 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid size-9 place-items-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                  <FilmIcon className="size-4.5" />
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {preparingUpload
                      ? "Preparing footage"
                      : ingest.isPending
                        ? "Uploading footage"
                        : "Footage uploaded"}
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">
                    {uploadedFileName ??
                      customResult?.filename ??
                      latest.data?.filename ??
                      "Current footage"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowUploadManual(true);
                    setHasUploaded(false);
                  }}
                  className="gap-1.5 text-xs font-medium cursor-pointer"
                >
                  <UploadCloudIcon className="size-3.5" />
                  <span>Upload different footage</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <FadeIn>
                <Card className="flex h-full flex-col gap-0 p-4">
                  <div
                    className={cn(
                      "relative z-10 mb-4 flex flex-wrap items-center gap-6 rounded-lg border border-border bg-secondary/20 px-3.5 py-2.5 text-xs text-muted-foreground",
                      showcaseReadOnly && "order-3",
                    )}
                  >
                    {canRunFresh && (
                      <label
                        title="Create a new result instead of reusing the saved one (may use paid AI calls)"
                        className="flex cursor-pointer select-none items-center gap-2 hover:text-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={bypassCache}
                          onChange={(e) => setBypassCache(e.target.checked)}
                          disabled={ingest.isPending || compressing}
                          className="size-4 shrink-0 cursor-pointer rounded border-border accent-[var(--brand)]"
                        />
                        <span className="font-medium text-foreground">Run AI again</span>
                      </label>
                    )}
                    <label
                      title="Keep the uploaded video in storage for later review and playback (works with Backblaze B2 when configured, or process memory)"
                      className="flex cursor-pointer select-none items-center gap-2 hover:text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={keepFootage}
                        onChange={(e) => setKeepFootage(e.target.checked)}
                        disabled={ingest.isPending || compressing}
                        className="size-4 shrink-0 cursor-pointer rounded border-border accent-[var(--brand)]"
                      />
                      <span className="font-medium text-foreground">Keep footage for replay</span>
                    </label>
                    <label
                      title="Automatically downscale and optimize video bitrate client-side before upload"
                      className="flex cursor-pointer select-none items-center gap-2 hover:text-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={autoCompress}
                        onChange={(e) => setAutoCompress(e.target.checked)}
                        disabled={ingest.isPending || compressing}
                        className="size-4 shrink-0 cursor-pointer rounded border-border accent-[var(--brand)]"
                      />
                      <span className="font-medium text-foreground">
                        Compress video (&gt;
                        {Math.round(uploadLimits.compressThresholdBytes / 1024 ** 2)}MB to{" "}
                        {Math.round(uploadLimits.targetCompressedBytes / 1024 ** 2)}MB)
                      </span>
                    </label>
                  </div>
                  <label
                    role="button"
                    aria-label="Choose truck video or image"
                    aria-disabled={
                      !canRunFresh || playground || busy || latest.isLoading || !eventId
                    }
                    tabIndex={
                      !canRunFresh || playground || busy || latest.isLoading || !eventId ? -1 : 0
                    }
                    onKeyDown={(e) => {
                      if (!canRunFresh || playground) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        inputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!canRunFresh || playground) return;
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) void submit(file);
                    }}
                    className={cn(
                      "order-2 flex cursor-pointer flex-col items-center justify-center gap-3 min-h-40 flex-1 rounded-xl border border-dashed px-6 py-6 text-center transition-colors",
                      showcaseReadOnly && "min-h-24 flex-none gap-2 px-4 py-3",
                      dragging
                        ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                        : "border-border hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]/40",
                      (!canRunFresh || playground || busy || latest.isLoading || !eventId) &&
                        "pointer-events-none opacity-70",
                    )}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      accept="video/*,image/*"
                      onChange={onPick}
                      className="hidden"
                      disabled={!canRunFresh || playground || busy || latest.isLoading || !eventId}
                    />
                    <span
                      className={cn(
                        "grid size-14 place-items-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
                        showcaseReadOnly && "size-9 rounded-xl",
                      )}
                    >
                      {compressing ? (
                        <Loader2Icon
                          className={cn("size-7 animate-spin", showcaseReadOnly && "size-5")}
                        />
                      ) : ingest.isPending ? (
                        <Loader2Icon
                          className={cn("size-7 animate-spin", showcaseReadOnly && "size-5")}
                        />
                      ) : (
                        <UploadCloudIcon className={cn("size-7", showcaseReadOnly && "size-5")} />
                      )}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={cn("text-[15px] font-semibold", showcaseReadOnly && "text-sm")}
                      >
                        {compressing
                          ? `Compressing video... (${compressProgress}%)`
                          : ingest.isPending
                            ? "Uploading clip"
                            : processing
                              ? latest.data?.bypass_cache
                                ? "Fresh analysis in progress"
                                : "Analysis in progress"
                              : !canRunFresh
                                ? "Upload disabled · Administrator mode required"
                                : playground
                                  ? "Sandbox · saved video replay only"
                                  : "Drop a clip here, or click to browse"}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {compressing
                          ? "Optimizing video size in browser before upload."
                          : ingest.isPending
                            ? "Your clip is being uploaded."
                            : processing
                              ? "Upload complete. Analysis is still processing."
                              : !canRunFresh
                                ? "Select an existing video below to replay saved AI analysis."
                                : playground
                                  ? "Choose a saved video below. Uploads and new AI calls are disabled in Sandbox."
                                  : `Max ${uploadLimits.maxDurationSeconds}s video · ${Math.round(uploadLimits.maxSizeBytes / 1024 ** 2)}MB limit (Files >${Math.round(uploadLimits.compressThresholdBytes / 1024 ** 2)}MB compress to ${Math.round(uploadLimits.targetCompressedBytes / 1024 ** 2)}MB).`}
                      </span>
                    </div>
                  </label>

                  {/* ── EXISTING VIDEO SELECTOR (USE EXISTING FROM HERE) ── */}
                  <div
                    className={cn(
                      "mt-4 flex flex-col gap-2 border-t border-border pt-4",
                      showcaseReadOnly && "order-1 mt-0 border-t-0 pt-0",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <label
                        htmlFor="existing-video-select"
                        className="text-xs font-semibold text-foreground flex items-center gap-1.5"
                      >
                        <FilmIcon className="size-3.5 text-primary" />
                        <span>Use existing video from library:</span>
                      </label>
                      <span className="text-[11px] text-muted-foreground">
                        Pick a processed benchmark clip
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        id="existing-video-select"
                        aria-label="Use existing video from library"
                        value={selectedExisting}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedExisting(val);
                          if (val) void processExistingVideo(val);
                        }}
                        disabled={busy || latest.isLoading || loadingExisting}
                        className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-xs text-foreground cursor-pointer focus:outline-primary"
                      >
                        <option value="">-- Select an existing video from here --</option>
                        {eventPairs.map((pair) => (
                          <option key={pair.id} value={pair.matchFilename}>
                            P{String(pair.pairNumber).padStart(2, "0")} · {pair.truckId} ·{" "}
                            {pair.debrisLabel} ({pair.measuredFillPct.toFixed(1)}% fill)
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!selectedExisting || busy || latest.isLoading || loadingExisting}
                        onClick={() => void processExistingVideo(selectedExisting)}
                        className="h-9 shrink-0 gap-1.5 px-3 text-xs font-medium cursor-pointer"
                      >
                        {loadingExisting ? (
                          <>
                            <Loader2Icon className="size-3.5 animate-spin" />
                            <span>Loading…</span>
                          </>
                        ) : (
                          <>
                            <SparklesIcon className="size-3.5" />
                            <span>Replay saved video</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>
              </FadeIn>
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-3">
            {latest.data &&
              !ingest.isPending &&
              latest.data.status === "failed" &&
              !customResult &&
              dismissedJobId !== latest.data.id && (
                <Card
                  className="gap-2 border-[var(--color-destructive)]/40 bg-[var(--color-danger-soft)] p-4"
                  role="alert"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-destructive)]">
                        Analysis did not complete
                      </p>
                      <p className="break-words text-xs text-muted-foreground">
                        {latest.data.filename}
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-destructive)]">
                        {latest.data.detail ?? "Upload again to retry."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (latest.data?.id) setDismissedJobId(latest.data.id);
                          setShowUploadManual(true);
                          setHasUploaded(false);
                        }}
                        className="shrink-0 gap-1.5 text-xs font-medium cursor-pointer"
                      >
                        <UploadCloudIcon className="size-3.5" />
                        <span>Upload another clip</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (latest.data?.id) setDismissedJobId(latest.data.id);
                        }}
                        className="size-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                        aria-label="Dismiss error banner"
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            {latest.isError && (
              <div role="alert" className="rounded-lg border border-border p-4 text-sm">
                Upload status could not be loaded.{" "}
                <button onClick={() => void latest.refetch()} className="text-primary underline">
                  Reconnect
                </button>
              </div>
            )}

            {error && (
              <Card
                role="alert"
                className="border-[var(--color-destructive)]/40 bg-[var(--color-danger-soft)] p-4"
              >
                <p className="text-[13px] text-[var(--color-destructive)]">{error}</p>
              </Card>
            )}

            {activeTicket && (
              <FadeIn>
                <Card className="gap-0 border-[var(--color-ok)]/40 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2Icon className="size-5 text-[var(--color-ok)]" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-[15px] font-semibold">Latest ticket</h2>
                          {showcaseReadOnly && (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {canRunFresh ? "AI-verified" : "Read-only reference"}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Generated from{" "}
                          {customResult?.filename ?? latest.data?.filename ?? "benchmark clip"}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/console?ticket=${activeTicket.id}`)}
                    >
                      Open ticket
                      <ArrowRightIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDismissedTicketId(activeTicket.id)}
                      aria-label="Hide ticket from this page"
                      title="Hide ticket and analysis from this page"
                      className="size-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Ticket" value={shortId(activeTicket.id)} />
                    <Field label="Truck" value={activeTicket.truck_id ?? "Unidentified"} />
                    <Field
                      label="Estimated value"
                      value={
                        Number.parseFloat(activeTicket.valuation.certified_cubic_yards) > 0
                          ? money(activeTicket.valuation.est_dollar_value)
                          : "Unavailable"
                      }
                    />
                    <Field
                      label="Estimated fill"
                      value={percent(activeTicket.valuation.est_fill_pct)}
                    />
                  </div>
                </Card>
              </FadeIn>
            )}
          </div>
        </div>
        <section className="min-h-64 flex-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
                {preparingUpload || processing || loadingExisting || ingest.isPending
                  ? "Live analysis workspace"
                  : activeTicket
                    ? "Latest analysis"
                    : "Live analysis"}
              </h2>
              <p className="text-xs text-muted-foreground">
                AI outlines the truck and load · estimates fill from video frames · ticket value is
                calculated from certified capacity and event rates.
              </p>
            </div>
            <Link href="/pipeline" className="text-xs font-medium text-primary hover:underline">
              All analysis runs →
            </Link>
          </div>

          {preparingUpload || processing || loadingExisting || ingest.isPending ? (
            <LivePipelineFlow
              eventId={eventId}
              active={preparingUpload || processing || ingest.isPending}
              preparing={preparingUpload}
              showIdle
              ignoredAttempt={ignoredAttempt}
              detailed
            />
          ) : activeTicket && activeStages && activeStages.length > 0 ? (
            <PipelineWorkbench
              key={activeTicket.id}
              stages={activeStages}
              summary={{
                truck: activeTicket.truck_id ?? "Unidentified",
                debris: activeTicket.debris_class ? debrisLabel(activeTicket.debris_class) : "N/A",
                value:
                  Number.parseFloat(activeTicket.valuation.certified_cubic_yards) > 0
                    ? money(activeTicket.valuation.est_dollar_value)
                    : "Unavailable",
                flags: activeTicket.anomaly_count ?? 0,
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <PipelineWorkbench stages={[]} />
              <p className="text-xs text-muted-foreground">
                Select an existing video from the library above or drop a truck clip to run this
                pipeline. Click any stage to inspect its purpose and model output in the sidebar
                inspector.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[14px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Replay saved evidence in any event; practice copies go only to the playground. */
function SavedFootagePicker({ onUpload }: { onUpload?: () => void }) {
  const { events, selected, setSelectedId } = useEventContext();
  const query = useQuery({ queryKey: ["practice-sources"], queryFn: listPracticeSources });
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const chosen = query.data?.find((ticket) => ticket.id === source) ?? query.data?.[0];
  const playground = selected?.tags.includes("playground")
    ? selected
    : events.find((event) => event.tags.includes("playground"));

  // Group tickets by event for clarity across the two Meta processed events
  const groupedTickets = useMemo(() => {
    if (!query.data?.length) return [];
    const eventMap = new Map<string, { eventName: string; tickets: Ticket[] }>();
    for (const ticket of query.data) {
      const ev = events.find((e) => e.id === ticket.event_id);
      const name = ev ? ev.name : "Meta-Processed Recovery";
      if (!eventMap.has(ticket.event_id)) {
        eventMap.set(ticket.event_id, { eventName: name, tickets: [] });
      }
      eventMap.get(ticket.event_id)!.tickets.push(ticket);
    }
    return Array.from(eventMap.entries());
  }, [query.data, events]);

  async function create() {
    if (!chosen || !playground || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ticket = await createPracticeTicket(playground.id, chosen.id);
      await qc.invalidateQueries({ queryKey: ["tickets"] });
      setSelectedId(playground.id);
      router.push(`/console?event=${playground.id}&ticket=${ticket.id}`);
    } catch (err) {
      setError(ingestErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell section="Add footage">
      <div className="lt-scroll lt-fab-safe min-h-0 flex-1 overflow-y-auto pb-6">
        <Card className="mx-auto w-full max-w-4xl gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Replay a processed video</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Watch saved footage from the two Meta-processed recovery events. No new AI calls or
                credits.
              </p>
            </div>
            {onUpload ? (
              <Button variant="outline" onClick={onUpload}>
                Upload new footage
              </Button>
            ) : selected?.tags.includes("playground") ? (
              <Button variant="outline" disabled title="Sandbox is replay-only">
                Upload unavailable in Sandbox
              </Button>
            ) : null}
          </div>
          <label htmlFor="practice-video" className="text-sm font-medium">
            Processed video
          </label>
          <select
            id="practice-video"
            className="min-h-11 w-full min-w-0 rounded-md border border-border bg-card px-3 text-foreground"
            value={chosen?.id ?? ""}
            onChange={(e) => setSource(e.target.value)}
            disabled={busy || query.isLoading || !query.data?.length}
          >
            {!query.data?.length ? (
              <option value="">
                {query.isLoading ? "Loading processed videos…" : "No processed videos available"}
              </option>
            ) : (
              groupedTickets.map(([eventId, { eventName, tickets }]) => (
                <optgroup key={eventId} label={eventName}>
                  {tickets.map((ticket) => (
                    <option key={ticket.id} value={ticket.id}>
                      {ticket.truck_id ?? "Unidentified truck"} · {debrisLabel(ticket.debris_class)}{" "}
                      · {percent(ticket.valuation.est_fill_pct)} fill · {ticket.id.slice(0, 8)}
                    </option>
                  ))}
                </optgroup>
              ))
            )}
          </select>
          {query.isError && (
            <p role="alert">
              Processed videos could not be loaded.{" "}
              <button className="underline" onClick={() => void query.refetch()}>
                Retry
              </button>
            </p>
          )}
          {chosen && (
            <>
              <div className="min-w-0" key={chosen.id}>
                <EvidenceCanvas ticket={chosen} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/console?event=${chosen.event_id}&ticket=${chosen.id}`}
                  onClick={() => setSelectedId(chosen.event_id)}
                  className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary"
                >
                  Open saved ticket
                </Link>
                {playground && (
                  <Button onClick={() => void create()} disabled={busy}>
                    {busy ? "Creating practice ticket…" : "Review a practice copy"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Replay keeps the original ticket unchanged. Practice copies are saved in the
                Practice Playground.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
