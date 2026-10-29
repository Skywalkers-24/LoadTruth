"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActivityIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CpuIcon,
  HistoryIcon,
  TruckIcon,
} from "lucide-react";

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
          {/* TOP SECTION: Run workspace (Active job trace inspection - full natural height, never squashed) */}
          <Card className="flex shrink-0 flex-col gap-0 border-border bg-card shadow-xs">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/15 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                  <CpuIcon className="size-4" />
                </span>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[14px] font-semibold">Run workspace</h2>
                  <span className="text-[11px] text-muted-foreground">
                    Click any stage to inspect details
                  </span>
                </div>
              </div>
              {active?.ticket_id && (
                <button
                  type="button"
                  onClick={() => router.push(`/console?ticket=${active.ticket_id}`)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  <span>Open in Review Console</span>
                  <ArrowRightIcon className="size-3.5" />
                </button>
              )}
            </header>

            <div className="p-3.5">
              {!active ? (
                <p className="py-8 text-center text-[13px] text-muted-foreground">
                  Select a pipeline run below to inspect its AI analysis trace.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <PipelineWorkbench
                    key={`${eventId}:${active.content_hash}`}
                    stages={active.stages}
                    summary={{
                      truck: active.truck_id ?? "Unidentified",
                      debris: active.debris_class ? debrisLabel(active.debris_class) : "N/A",
                      value: active.dollar_value != null ? money(active.dollar_value) : "N/A",
                      flags: active.anomaly_count,
                    }}
                  />
                  {active.ticket_id && (
                    <div className="flex items-center justify-end border-t border-border pt-1.5 text-[11px] text-muted-foreground">
                      <span>
                        Ticket ID: <span className="font-mono text-foreground">{active.ticket_id}</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* BOTTOM SECTION: Run history (Expanded height, prominent listing) */}
          <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0 border-border bg-card shadow-xs">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/15 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-lg bg-secondary text-foreground">
                  <HistoryIcon className="size-4" />
                </span>
                <div>
                  <h2 className="text-[14px] font-semibold">Run history</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Chronological record of recent video clips processed through the AI pipeline.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-secondary/80 px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground border border-border">
                  {total === 0
                    ? "0 runs"
                    : `${offset + 1}–${Math.min(offset + pageRows.length, total)} of ${total} runs`}
                </span>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto lt-scroll">
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
                <p className="px-4 py-12 text-center text-[13px] text-muted-foreground">
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
                            "group relative flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors border-l-4",
                            isActive
                              ? "border-l-primary bg-primary/10 dark:bg-primary/15 font-medium shadow-xs"
                              : "border-l-transparent hover:bg-muted/60 dark:hover:bg-muted/40",
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                "grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors",
                                isActive
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "bg-secondary group-hover:bg-accent group-hover:text-foreground",
                              )}
                            >
                              <TruckIcon className="size-4.5" />
                            </span>
                            <div className="flex min-w-0 flex-col leading-snug">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-[13px] font-semibold tabular-nums text-foreground">
                                  {j.truck_id ?? "Unidentified truck"}
                                </span>
                                {j.anomaly_count > 0 && (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                    <AlertTriangleIcon className="size-3" />
                                    <span>
                                      {j.anomaly_count} {j.anomaly_count === 1 ? "flag" : "flags"}
                                    </span>
                                  </span>
                                )}
                              </div>
                              <span className="truncate text-[12px] text-muted-foreground">
                                {j.debris_class ? debrisLabel(j.debris_class) : "No load detected"} ·{" "}
                                {j.stages.length} stages ·{" "}
                                {relativeTime(new Date(j.started_at * 1000).toISOString())}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-3">
                            {j.dollar_value != null && (
                              <span className="text-[13px] font-semibold tabular-nums text-[var(--color-money)]">
                                {money(j.dollar_value)}
                              </span>
                            )}
                            <StatusChip tone={OUTCOME_TONE[j.outcome]}>
                              {OUTCOME_LABEL[j.outcome]}
                            </StatusChip>
                            <span
                              className={cn(
                                "text-xs transition-transform",
                                isActive
                                  ? "font-bold text-primary translate-x-0.5"
                                  : "text-muted-foreground/50 group-hover:text-muted-foreground",
                              )}
                            >
                              →
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {total > JOBS_PAGE_SIZE && (
              <div className="border-t border-border bg-secondary/10 px-4 py-2.5">
                <Pagination
                  total={total}
                  limit={JOBS_PAGE_SIZE}
                  offset={offset}
                  onOffset={setOffset}
                />
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
