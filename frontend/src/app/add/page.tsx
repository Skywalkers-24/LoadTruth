"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckCircle2Icon, Loader2Icon, UploadCloudIcon } from "lucide-react";

import { ApiError, getTicketPipeline, listDemoVideos, type PipelineProgress } from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { LivePipelineFlow } from "@/components/ai/live-pipeline-flow";
import { DEFAULT_PIPELINE_STAGES, PipelineWorkbench } from "@/components/ai/pipeline-workbench";
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
 * New Ticket: upload a clip or image of a loaded truck; the pipeline measures
 * the fill and drafts a ticket. The event ledger lives on /tickets.
 */
export default function NewTicketPage() {
  const { selectedId } = useEventContext();
  return <CaptureWorkspace key={selectedId ?? "none"} />;
}

function CaptureWorkspace() {
  const { selected, selectedId: eventId } = useEventContext();
  const { can } = useAuth();
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

  const allowed = can("ingest");
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
      { eventId, file },
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

  if (!allowed) {
    return (
      <AppShell section="New Ticket">
        <Card className="mx-auto mt-10 max-w-md p-8 text-center">
          <h1 className="text-[16px] font-semibold">Not available for your role</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Capturing tickets requires review access. Ask an admin if you need it.
          </p>
        </Card>
      </AppShell>
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
            <Link href="/demos" className="text-sm font-medium text-primary hover:underline">
              Choose a demo video →
            </Link>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Upload evidence for{" "}
            <span className="font-medium text-foreground">{selected?.name ?? "this event"}</span> —
            identify the truck, measure the load, and calculate its value automatically.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-4">
          {/* Upload stays beside the live analysis and draft summary. */}
          <div className="min-w-0">
            <FadeIn>
              <Card className="h-full gap-0 p-4">
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
                    {busy ? (
                      <Loader2Icon className="size-7 animate-spin" />
                    ) : (
                      <UploadCloudIcon className="size-7" />
                    )}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">
                      {ingest.isPending
                        ? "Uploading — keep this tab open"
                        : processing
                          ? "Uploaded — queued or analyzing"
                          : showcaseReadOnly
                            ? "Preprocessed showcase event"
                            : "Drop a clip here, or click to browse"}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {ingest.isPending
                        ? "Wait for the upload confirmation before refreshing."
                        : processing
                          ? "You can refresh or return later to follow this run."
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
            {latest.data && !ingest.isPending && (
              <Card className="gap-2 p-4" role="status">
                <p className="text-sm font-medium">
                  {processing
                    ? "Clip uploaded. Analysis is queued or running."
                    : latest.data.status === "failed"
                      ? "Analysis did not complete"
                      : "Latest upload completed"}
                </p>
                <p className="break-words text-xs text-muted-foreground">{latest.data.filename}</p>
                {processing && (
                  <p className="text-xs text-muted-foreground">
                    It is safe to refresh this page. Updates and the resulting ticket will reappear
                    here.
                  </p>
                )}
                {latest.data.status === "failed" && (
                  <p className="text-sm text-[var(--color-destructive)]">
                    {latest.data.detail ?? "Upload again to retry."}
                  </p>
                )}
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
                      <h2 className="text-[15px] font-semibold">Ticket drafted</h2>
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
                      value={money(result.valuation.est_dollar_value)}
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
              <h2 className="text-sm font-semibold">Live analysis workspace</h2>
              <p className="text-xs text-muted-foreground">
                Meta SAM 3.1 segmentation → Muse Spark understanding → measured load value.
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
                value: money(result.valuation.est_dollar_value),
                flags: result.anomaly_count ?? 0,
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <PipelineWorkbench stages={DEFAULT_PIPELINE_STAGES} />
              <p className="text-xs text-muted-foreground">
                Drop a truck clip above to run this pipeline live on your footage. Click any stage to inspect its purpose and model output in the 38% right-side drawer.
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
