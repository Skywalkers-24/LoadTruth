"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  CameraIcon,
  CheckCircle2Icon,
  GaugeIcon,
  Loader2Icon,
  TicketIcon,
  UploadCloudIcon,
} from "lucide-react";

import { ApiError, type PipelineProgress } from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { LivePipelineFlow } from "@/components/ai/live-pipeline-flow";
import { shortId } from "@/components/console/ticket-metadata";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { FadeIn } from "@/components/ui/motion";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useLatestIngestJob, useSubmitIngestJob } from "@/lib/hooks";
import { pipelineAttemptKey } from "@/lib/pipeline-progress";
import { money, percent } from "@/lib/format";
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

  const allowed = can("ingest");
  const showcaseReadOnly = Boolean(selected?.tags.includes("read-only"));

  function submit(file: File) {
    if (!eventId || showcaseReadOnly || !allowed || busy || latest.isLoading) return;
    if (file.size === 0) {
      setError("This file is empty. Choose a truck video or image.");
      return;
    }
    if (file.size > 1024 ** 3) {
      setError("This file exceeds 1 GiB. Choose a shorter clip.");
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
      <div className="lt-scroll flex min-h-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
        <div className="flex min-w-0 shrink-0 flex-col">
          <Link
            href="/tickets"
            className="mb-2 self-start text-[12px] text-muted-foreground hover:text-foreground"
          >
            ← All tickets
          </Link>
          <h1 className="lt-page-title">New Ticket</h1>
          <p className="text-[12px] text-muted-foreground">
            Upload evidence for{" "}
            <span className="font-medium text-foreground">{selected?.name ?? "this event"}</span>{" "}
            and LoadTruth drafts a ticket from the measured load.
          </p>
        </div>

        <div className="grid shrink-0 items-start gap-4 lg:grid-cols-2">
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
                    "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
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
                          ? "Upload received — analyzing on server"
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
                            : "Upload a short truck video or image"}
                    </span>
                  </div>
                </label>

                {/* How it works */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Step icon={<CameraIcon className="size-4" />} label="Capture" />
                  <Step icon={<GaugeIcon className="size-4" />} label="Measure fill" />
                  <Step icon={<TicketIcon className="size-4" />} label="Draft ticket" />
                </div>
              </Card>
            </FadeIn>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <LivePipelineFlow
              eventId={eventId}
              active={busy}
              showIdle
              ignoredAttempt={ignoredAttempt}
              detailed
            />

            {latest.data && !ingest.isPending && (
              <Card className="gap-2 p-4" role="status">
                <p className="text-sm font-medium">
                  {processing
                    ? "Upload received. Processing continues on the server."
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
      </div>
    </AppShell>
  );
}

function Step({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-2.5 py-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
        {icon}
      </span>
      <span className="text-[11px] font-medium leading-tight">{label}</span>
    </div>
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
