"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckCircle2Icon, Loader2Icon, UploadCloudIcon } from "lucide-react";

import {
  createPracticeTicket,
  listPracticeSources,
  ApiError,
  getTicketPipeline,
  listDemoVideos,
  type PipelineProgress,
} from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { LivePipelineFlow } from "@/components/ai/live-pipeline-flow";
import { DEFAULT_PIPELINE_STAGES, PipelineWorkbench } from "@/components/ai/pipeline-workbench";
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
        return err.message || "No truck or load was detected, so no ticket was drafted.";
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
 * fill and drafts a ticket for review. The event ledger lives on /tickets.
 */
export default function NewTicketPage() {
  const { selectedId } = useEventContext();
  return <CaptureWorkspace key={selectedId ?? "none"} />;
}

function CaptureWorkspace() {
  const { selected, selectedId: eventId } = useEventContext();
  const { can, member } = useAuth();
  const canRunFresh = member?.role === "super_admin";
  const [bypassCache, setBypassCache] = useState(false);
  const [keepFootage, setKeepFootage] = useState(true);
  const [showSaved, setShowSaved] = useState(false);
  const router = useRouter();
  const ingest = useSubmitIngestJob();
  const latest = useLatestIngestJob(eventId);
  const queryClient = useQueryClient();
  const library = useQuery({
    queryKey: ["demo-videos", 0],
    queryFn: () => listDemoVideos(0),
    staleTime: 60_000,
  });
  const analysisLimit = library.data?.analysis_max_bytes ?? 20 * 1024 ** 2;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const result = ingest.isPending ? null : (latest.data?.ticket ?? null);
  const processing = latest.data?.status === "accepted" || latest.data?.status === "running";
  const busy = ingest.isPending || processing;
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

  const ticketPipeline = useQuery({
    queryKey: ["ticket-pipeline", result?.id],
    queryFn: () => getTicketPipeline(result!.id),
    enabled: Boolean(result?.id),
    staleTime: 60_000,
  });

  const allowed = can("ingest") && canRunFresh;
  const showcaseReadOnly = Boolean(selected?.tags.includes("read-only"));

  function submit(file: File) {
    if (!eventId || showcaseReadOnly || !allowed || busy || latest.isLoading) return;
    if (file.size === 0) {
      setError("This file is empty. Choose a truck video or image.");
      return;
    }
    if (file.size > analysisLimit) {
      setError(
        `Analysis on this instance accepts clips up to ${Math.round(analysisLimit / 1024 ** 2)} MiB. Trim this clip, or save it in Demo Videos for later.`,
      );
      return;
    }
    if (file.type && !file.type.startsWith("video/") && !file.type.startsWith("image/")) {
      setError("Choose a video or image file.");
      return;
    }
    setError(null);
    const previousRun = queryClient.getQueryData<PipelineProgress | null>([
      "pipeline-progress",
      eventId,
    ]);
    setIgnoredAttempt(previousRun ? pipelineAttemptKey(previousRun) : undefined);
    ingest.mutate(
      { eventId, file, bypassCache: canRunFresh && bypassCache, keepFootage },
      {
        onError: (err) => setError(ingestErrorMessage(err)),
      },
    );
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) submit(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!allowed || showcaseReadOnly || selected?.tags.includes("playground") || showSaved) {
    return (
      <SavedFootagePicker
        onUpload={
          allowed && !showcaseReadOnly && !selected?.tags.includes("playground")
            ? () => setShowSaved(false)
            : undefined
        }
      />
    );
  }

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
            <Button variant="outline" onClick={() => setShowSaved(true)}>
              Replay a processed video
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Upload evidence for{" "}
            <span className="font-medium text-foreground">{selected?.name ?? "this event"}</span> to
            identify the truck, estimate fill from sampled frames, and draft a ticket for review.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-4">
          {/* Upload stays beside the live analysis and draft summary. */}
          <div className="min-w-0">
            <FadeIn>
              <Card className="h-full gap-0 p-4">
                {canRunFresh && (
                  <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                    <input
                      type="checkbox"
                      checked={bypassCache}
                      onChange={(e) => setBypassCache(e.target.checked)}
                      disabled={busy || latest.isLoading || showcaseReadOnly || !eventId}
                      className="mt-1 size-4 shrink-0 accent-[var(--brand)]"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Run fresh analysis (bypass cache)
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        Run the AI again instead of reusing saved analysis. Takes longer and may
                        incur additional model usage charges.
                      </span>
                    </span>
                  </label>
                )}
                {canRunFresh && (
                  <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                    <input
                      type="checkbox"
                      checked={keepFootage}
                      onChange={(e) => setKeepFootage(e.target.checked)}
                      disabled={busy || latest.isLoading || showcaseReadOnly || !eventId}
                      className="mt-1 size-4 shrink-0 accent-[var(--brand)]"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        Keep footage for later replay
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        Tickets and analysis are always saved. Uncheck to keep footage only in
                        server memory for up to seven days; replay ends sooner if memory is full or
                        the server restarts.
                      </span>
                    </span>
                  </label>
                )}
                <label
                  role="button"
                  aria-label="Choose truck video or image"
                  aria-disabled={busy || latest.isLoading || showcaseReadOnly || !eventId}
                  tabIndex={busy || latest.isLoading || showcaseReadOnly || !eventId ? -1 : 0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) submit(file);
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-3 min-h-40 flex-1 rounded-xl border border-dashed px-6 py-6 text-center transition-colors",
                    dragging
                      ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                      : "border-border hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]/40",
                    (busy || latest.isLoading || showcaseReadOnly || !eventId) &&
                      "pointer-events-none opacity-70",
                  )}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept="video/*,image/*"
                    onChange={onPick}
                    className="hidden"
                    disabled={busy || latest.isLoading || showcaseReadOnly || !eventId}
                  />
                  <span className="grid size-14 place-items-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                    {ingest.isPending ? (
                      <Loader2Icon className="size-7 animate-spin" />
                    ) : (
                      <UploadCloudIcon className="size-7" />
                    )}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">
                      {ingest.isPending
                        ? "Uploading clip"
                        : processing
                          ? latest.data?.bypass_cache
                            ? "Fresh analysis in progress"
                            : "Analysis in progress"
                          : showcaseReadOnly
                            ? "Preprocessed showcase event"
                            : "Drop a clip here, or click to browse"}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {ingest.isPending
                        ? "Your clip is being uploaded."
                        : processing
                          ? "Upload complete. Analysis is still processing."
                          : showcaseReadOnly
                            ? "Stored Meta results are shown read-only. Browsing them makes no Meta calls."
                            : `Choose a video or image up to ${Math.round(analysisLimit / 1024 ** 2)} MiB.`}
                    </span>
                  </div>
                </label>
              </Card>
            </FadeIn>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {latest.data && !ingest.isPending && latest.data.status === "failed" && (
              <Card
                className="gap-2 border-[var(--color-destructive)]/40 bg-[var(--color-danger-soft)] p-4"
                role="alert"
              >
                <p className="text-sm font-semibold text-[var(--color-destructive)]">
                  Analysis did not complete
                </p>
                <p className="break-words text-xs text-muted-foreground">{latest.data.filename}</p>
                <p className="text-sm text-[var(--color-destructive)]">
                  {latest.data.detail ?? "Upload again to retry."}
                </p>
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

            {result && (
              <FadeIn>
                <Card className="gap-0 border-[var(--color-ok)]/40 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2Icon className="size-5 text-[var(--color-ok)]" />
                      <div>
                        <h2 className="text-[15px] font-semibold">Latest ticket draft</h2>
                        {latest.data?.filename && (
                          <p className="text-[11px] text-muted-foreground">
                            Generated from {latest.data.filename}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => router.push(`/console?ticket=${result.id}`)}>
                      Open ticket
                      <ArrowRightIcon />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Ticket" value={shortId(result.id)} />
                    <Field label="Truck" value={result.truck_id ?? "Unidentified"} />
                    <Field
                      label="Estimated value"
                      value={
                        Number.parseFloat(result.valuation.certified_cubic_yards) > 0
                          ? money(result.valuation.est_dollar_value)
                          : "Unavailable"
                      }
                    />
                    <Field label="Estimated fill" value={percent(result.valuation.est_fill_pct)} />
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
                {processing
                  ? "Live analysis workspace"
                  : result
                    ? "Latest analysis"
                    : "Live analysis"}
              </h2>
              <p className="text-xs text-muted-foreground">
                SAM tracks the truck and load · Muse estimates fill from sampled frames · ticket
                value is calculated from certified capacity and event rates.
              </p>
            </div>
            <Link href="/pipeline" className="text-xs font-medium text-primary hover:underline">
              All AI pipeline runs →
            </Link>
          </div>

          {processing ? (
            <LivePipelineFlow
              eventId={eventId}
              active
              showIdle
              ignoredAttempt={ignoredAttempt}
              detailed
            />
          ) : result && ticketPipeline.data && ticketPipeline.data.length > 0 ? (
            <PipelineWorkbench
              key={result.id}
              stages={ticketPipeline.data}
              summary={{
                truck: result.truck_id ?? "Unidentified",
                debris: result.debris_class ? debrisLabel(result.debris_class) : "N/A",
                value:
                  Number.parseFloat(result.valuation.certified_cubic_yards) > 0
                    ? money(result.valuation.est_dollar_value)
                    : "Unavailable",
                flags: result.anomaly_count ?? 0,
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <PipelineWorkbench stages={DEFAULT_PIPELINE_STAGES} />
              <p className="text-xs text-muted-foreground">
                Drop a truck clip above to run this pipeline live on your footage. Click any stage
                to inspect its purpose and model output in the sidebar inspector.
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
                Watch saved footage and reuse its analysis. No new AI calls or credits.
              </p>
            </div>
            {onUpload && (
              <Button variant="outline" onClick={onUpload}>
                Upload new footage
              </Button>
            )}
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
            {!query.data?.length && (
              <option value="">
                {query.isLoading ? "Loading processed videos…" : "No processed videos available"}
              </option>
            )}
            {query.data?.map((ticket) => (
              <option key={ticket.id} value={ticket.id}>
                {ticket.truck_id ?? "Unidentified truck"} · {debrisLabel(ticket.debris_class)} ·{" "}
                {percent(ticket.valuation.est_fill_pct)} fill · {ticket.id.slice(0, 8)}
              </option>
            ))}
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
