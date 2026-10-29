"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityIcon, CpuIcon, TruckIcon } from "lucide-react";

import type { PipelineJob } from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { LivePipelineFlow } from "@/components/ai/live-pipeline-flow";
import { PipelineWorkbench } from "@/components/ai/pipeline-workbench";
import { StatusChip } from "@/components/ui/status-chip";
import { Card } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Pagination } from "@/components/pagination";
import { usePipelineJobs } from "@/lib/hooks";
import { useEventContext } from "@/lib/event-context";
import { debrisLabel, money, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const JOBS_PAGE_SIZE = 20;

const OUTCOME_TONE = {
  drafted: "ok",
  cached: "info",
  no_truck: "warn",
  running: "brand",
} as const;

const OUTCOME_LABEL = {
  drafted: "Drafted",
  cached: "Cached",
  no_truck: "No truck",
  running: "Running",
} as const;

/**
 * AI Pipeline: a live view of every clip run through the models. Each job shows
 * its outcome and the stage-by-stage trace (what SAM and Muse Spark produced).
 */
export default function PipelinePage() {
  const { selectedId: eventId } = useEventContext();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  // Reset to the first page whenever the event scope changes.
  useEffect(() => {
    setOffset(0);
    setSelected(null);
  }, [eventId]);

  const jobs = usePipelineJobs({ eventId, limit: JOBS_PAGE_SIZE, offset });
  const pageRows: PipelineJob[] = jobs.data?.items ?? [];
  const total = jobs.data?.total ?? 0;
  // The selected trace must be on the current page (server-side paging returns
  // only this page's jobs); fall back to the first row of the page.
  const active = pageRows.find((j) => j.content_hash === selected) ?? pageRows[0] ?? null;

  useEffect(() => {
    if (pageRows.length > 0 && !pageRows.some((j) => j.content_hash === selected)) {
      setSelected(pageRows[0]!.content_hash);
    }
  }, [pageRows, selected]);

  return (
    <AppShell section="AI Pipeline Run">
      <div className="lt-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            <ActivityIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h1 className="lt-page-title">AI Pipeline Run</h1>
            <p className="text-[12px] text-muted-foreground">
              Meta SAM segmentation → Muse Spark understanding → measured load value.
            </p>
          </div>
          <Link
            href="/add"
            className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            New AI run →
          </Link>
        </div>

        {/* Live run: lights up each stage left to right as a clip is analysed,
            then refreshes the jobs list when it finishes. */}
        <LivePipelineFlow eventId={eventId} detailed onlyActive onComplete={() => jobs.refetch()} />

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Jobs list */}
          <Card className="flex max-h-56 shrink-0 flex-col gap-0 overflow-hidden py-0">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-[14px] font-semibold">Run history</h2>
              <span className="text-[12px] tabular-nums text-muted-foreground">{total}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {jobs.isError ? (
                <div role="alert" className="p-4 text-sm">
                  <p>Run history could not be loaded.</p>
                  <button
                    onClick={() => void jobs.refetch()}
                    className="mt-2 text-primary underline"
                  >
                    Try again
                  </button>
                </div>
              ) : !eventId ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Select an event to see its runs.
                </p>
              ) : jobs.isLoading ? (
                <div className="flex flex-col gap-2 p-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : total === 0 ? (
                <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                  No AI pipeline runs yet. Capture a ticket to see the AI stages here.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {pageRows.map((j) => {
                    const isActive = active?.content_hash === j.content_hash;
                    return (
                      <li key={j.content_hash}>
                        <button
                          type="button"
                          onClick={() => setSelected(j.content_hash)}
                          aria-pressed={isActive}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent",
                            isActive && "bg-[var(--color-brand-soft)]",
                          )}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                            <TruckIcon className="size-4" />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col leading-tight">
                            <span className="truncate text-[13px] font-semibold tabular-nums">
                              {j.truck_id ?? "Unidentified truck"}
                            </span>
                            <span className="truncate text-[11px] text-muted-foreground">
                              {j.debris_class ? debrisLabel(j.debris_class) : "No load"} ·{" "}
                              {j.stages.length} stages ·{" "}
                              {relativeTime(new Date(j.started_at * 1000).toISOString())}
                            </span>
                          </span>
                          {j.dollar_value != null && (
                            <span className="text-[12px] font-semibold tabular-nums text-[var(--color-money)]">
                              {money(j.dollar_value)}
                            </span>
                          )}
                          <StatusChip tone={OUTCOME_TONE[j.outcome]}>
                            {OUTCOME_LABEL[j.outcome]}
                          </StatusChip>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {total > JOBS_PAGE_SIZE && (
              <div className="border-t border-border px-4 py-2.5">
                <Pagination
                  total={total}
                  limit={JOBS_PAGE_SIZE}
                  offset={offset}
                  onOffset={setOffset}
                />
              </div>
            )}
          </Card>

          {/* Selected trace */}
          <Card className="flex min-h-[420px] flex-1 flex-col gap-0 overflow-hidden py-0">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <CpuIcon className="size-4 text-[var(--color-brand)]" />
              <h2 className="text-[14px] font-semibold">
                Run workspace · select a stage to inspect its output
              </h2>
            </header>
            <div className="lt-scroll lt-fab-safe min-h-0 flex-1 overflow-y-auto p-4">
              {!active ? (
                <p className="text-[13px] text-muted-foreground">
                  Select a job to see how the AI produced it.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/40 p-3 sm:grid-cols-4">
                    <Field label="Truck" value={active.truck_id ?? "Unidentified"} />
                    <Field
                      label="Debris"
                      value={active.debris_class ? debrisLabel(active.debris_class) : "N/A"}
                    />
                    <Field
                      label="Value"
                      value={active.dollar_value != null ? money(active.dollar_value) : "N/A"}
                    />
                    <Field label="Flags" value={String(active.anomaly_count)} />
                  </div>
                  <PipelineWorkbench
                    key={`${eventId}:${active.content_hash}`}
                    stages={active.stages}
                  />
                  {active.ticket_id && (
                    <button
                      type="button"
                      onClick={() => router.push(`/console?ticket=${active.ticket_id}`)}
                      className="self-start text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                    >
                      Open ticket in Review Console
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate text-[13px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}
