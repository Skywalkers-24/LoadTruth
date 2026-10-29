"use client";

import { useRef, useState } from "react";
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

import { ApiError, type Ticket } from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { LivePipelineFlow } from "@/components/ai/live-pipeline-flow";
import { shortId } from "@/components/console/ticket-metadata";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { FadeIn } from "@/components/ui/motion";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useIngest, useTickets } from "@/lib/hooks";
import { debrisLabel, money, relativeTime, signedMoney } from "@/lib/format";
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
 * the fill and drafts a ticket with a real valuation. Left: the capture flow.
 * Right: the tickets already captured for this event.
 */
export default function NewTicketPage() {
  const { selected, selectedId: eventId } = useEventContext();
  const { can } = useAuth();
  const router = useRouter();
  const ingest = useIngest();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tickets = useTickets({ eventId, limit: 100, offset: 0 });
  const recent = (tickets.data?.items ?? [])
    .slice()
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const allowed = can("ingest");
  const showcaseReadOnly = Boolean(selected?.tags.includes("read-only"));

  function submit(file: File) {
    if (!eventId || showcaseReadOnly) return;
    setError(null);
    setResult(null);
    ingest.mutate(
      { eventId, file },
      {
        onSuccess: (t) => setResult(t),
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:overflow-hidden">
        <div className="flex min-w-0 flex-col">
          <h1 className="lt-page-title">Capture a new ticket</h1>
          <p className="text-[12px] text-muted-foreground">
            Upload evidence for{" "}
            <span className="font-medium text-foreground">{selected?.name ?? "this event"}</span>{" "}
            and LoadTruth drafts a ticket from the measured load.
          </p>
        </div>

        <div className="grid min-h-[360px] gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
          {/* Upload stays beside the live analysis and draft summary. */}
          <div className="min-w-0">
            <FadeIn>
              <Card className="h-full gap-0 p-4">
                <label
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
                    (ingest.isPending || showcaseReadOnly) && "pointer-events-none opacity-70",
                  )}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept="video/*,image/*"
                    onChange={onPick}
                    className="hidden"
                    disabled={ingest.isPending || showcaseReadOnly}
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
                        ? "Analyzing the clip"
                        : showcaseReadOnly
                          ? "Preprocessed showcase event"
                        : "Drop a clip here, or click to browse"}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {ingest.isPending
                        ? "Measuring fill and drafting the ticket"
                        : showcaseReadOnly
                          ? "Stored Meta results are shown read-only. Browsing them makes no Meta calls."
                        : "Video or image, up to a few hundred MB"}
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
              active={ingest.isPending}
              showIdle
              onComplete={() => {
                void tickets.refetch();
              }}
            />

            {error && (
              <Card className="border-[var(--color-destructive)]/40 bg-[var(--color-danger-soft)] p-4">
                <p className="text-[13px] text-[var(--color-destructive)]">{error}</p>
              </Card>
            )}

            {result && (
              <FadeIn>
                <Card className="gap-0 border-[var(--color-ok)]/40 p-5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2Icon className="size-5 text-[var(--color-ok)]" />
                    <h2 className="text-[15px] font-semibold">Ticket drafted</h2>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Ticket" value={shortId(result.id)} />
                    <Field label="Truck" value={result.truck_id ?? "Unidentified"} />
                    <Field
                      label="Measured value"
                      value={money(result.valuation.est_dollar_value)}
                    />
                    <Field
                      label="Delta"
                      value={
                        result.valuation.delta_dollar_value
                          ? signedMoney(result.valuation.delta_dollar_value)
                          : "Not called"
                      }
                    />
                  </div>
                  <Button
                    className="mt-4 self-start"
                    size="sm"
                    onClick={() => router.push(`/console?ticket=${result.id}`)}
                  >
                    Open in Review Console
                    <ArrowRightIcon />
                  </Button>
                </Card>
              </FadeIn>
            )}

          </div>
        </div>

        {/* Full-width event ledger below the capture and analysis workspace. */}
        <Card className="lt-fab-safe flex min-h-[320px] flex-col gap-0 overflow-hidden py-0 lg:min-h-0 lg:flex-1">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[14px] font-semibold">Tickets in this event</h2>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {tickets.data?.total ?? recent.length} tickets
            </span>
          </header>
          <div className="lt-scroll min-h-0 flex-1 overflow-auto">
            {tickets.isLoading ? (
              <div className="flex flex-col gap-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                No tickets yet. Upload a clip to create the first one.
              </p>
            ) : (
              <>
                <div className="sticky top-0 z-10 hidden grid-cols-[minmax(110px,0.75fr)_minmax(220px,1.6fr)_minmax(120px,1fr)_minmax(130px,0.9fr)_minmax(100px,0.7fr)] items-center gap-3 border-b border-border bg-card px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                  <span>Ticket</span><span>Truck · debris</span><span>Captured</span><span>Status</span><span className="text-right">Delta</span>
                </div>
                <ul className="divide-y divide-border">
                  {recent.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => router.push(`/console?ticket=${t.id}`)}
                        className="grid w-full grid-cols-1 items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-accent md:grid-cols-[minmax(110px,0.75fr)_minmax(220px,1.6fr)_minmax(120px,1fr)_minmax(130px,0.9fr)_minmax(100px,0.7fr)] md:gap-3"
                      >
                        <span className="text-[13px] font-semibold tabular-nums">{shortId(t.id)}</span>
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-[12px] text-foreground">
                            <span className="tabular-nums">{t.truck_id ?? "Unidentified"}</span>
                            <span className="opacity-60"> · </span>
                            {debrisLabel(t.debris_class)}
                          </span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">{relativeTime(t.created_at)}</span>
                        <span><StatusBadge status={t.status} /></span>
                        <span className="text-left text-[13px] font-semibold tabular-nums text-[var(--color-money)] md:text-right">
                          {t.valuation.delta_dollar_value
                            ? signedMoney(t.valuation.delta_dollar_value)
                            : "N/A"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
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
