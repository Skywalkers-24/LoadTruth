"use client";

import { useMemo, useState } from "react";
import { DownloadIcon, FileTextIcon } from "lucide-react";

import type { ReportsSummary, Ticket } from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { ReportsPanel, type PerEvent } from "@/components/reports/reports-panel";
import { Button } from "@/components/ui/shadcn/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useAllReports, useReportsSummary, useTickets } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Scope = "event" | "all";

/** Sum per-event summaries into one combined summary for the "All events" view. */
function aggregate(parts: { eventId: string; summary: ReportsSummary; tickets: Ticket[] }[]): {
  summary: ReportsSummary;
  tickets: Ticket[];
} {
  const addMap = (acc: Record<string, number>, m: Record<string, number>) => {
    for (const [k, v] of Object.entries(m)) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  };
  const num = (s: string) => Number.parseFloat(s) || 0;
  const summary: ReportsSummary = {
    event_id: "all",
    ticket_count: 0,
    counts_by_status: {},
    counts_by_debris_class: {},
    total_est_dollar_value: "0",
    total_delta_dollar_value: "0",
    overbill_ticket_count: 0,
    overbill_dollar_value: "0",
    anomaly_counts_by_severity: {},
    reviewed_count: 0,
    pending_count: 0,
    accuracy_within_10pct: null,
  };
  let est = 0;
  let delta = 0;
  let overbill = 0;
  let accNum = 0;
  let accDen = 0;
  for (const p of parts) {
    const s = p.summary;
    summary.ticket_count += s.ticket_count;
    addMap(summary.counts_by_status, s.counts_by_status);
    addMap(summary.counts_by_debris_class, s.counts_by_debris_class);
    addMap(summary.anomaly_counts_by_severity, s.anomaly_counts_by_severity);
    summary.reviewed_count += s.reviewed_count;
    summary.pending_count += s.pending_count;
    summary.overbill_ticket_count += s.overbill_ticket_count;
    est += num(s.total_est_dollar_value);
    delta += num(s.total_delta_dollar_value);
    overbill += num(s.overbill_dollar_value);
    if (s.accuracy_within_10pct !== null) {
      accNum += s.accuracy_within_10pct * s.ticket_count;
      accDen += s.ticket_count;
    }
  }
  summary.total_est_dollar_value = est.toFixed(2);
  summary.total_delta_dollar_value = delta.toFixed(2);
  summary.overbill_dollar_value = overbill.toFixed(2);
  summary.accuracy_within_10pct = accDen > 0 ? accNum / accDen : null;
  const tickets = parts.flatMap((p) => p.tickets);
  return { summary, tickets };
}

/** Reports: event totals, exposure breakdowns, the ticket ledger, and exports. */
export default function ReportsPage() {
  const { selected, selectedId: eventId, events, isError: eventsError } = useEventContext();
  const { can } = useAuth();
  const canAll = can("manage_events");
  const [scope, setScope] = useState<Scope>("event");
  const allMode = canAll && scope === "all";

  const summary = useReportsSummary(allMode ? undefined : eventId);
  const tickets = useTickets({ eventId: allMode ? undefined : eventId, limit: 100, offset: 0 });
  const all = useAllReports(
    events.map((e) => e.id),
    allMode,
  );

  const combined = useMemo(() => (all.data ? aggregate(all.data) : null), [all.data]);
  const perEvent: PerEvent[] | undefined = useMemo(() => {
    if (!all.data) return undefined;
    const byId = new Map(events.map((e) => [e.id, e.name] as const));
    return all.data.map((p) => ({
      id: p.eventId,
      name: byId.get(p.eventId) ?? "Event",
      ticketCount: p.summary.ticket_count,
      measured: p.summary.total_est_dollar_value,
      flagged: p.summary.overbill_dollar_value,
    }));
  }, [all.data, events]);

  const loading = allMode ? all.isLoading : summary.isLoading || tickets.isLoading;
  const errored = allMode ? all.isError : summary.isError;
  const panelSummary = allMode ? combined?.summary : summary.data;
  const panelTickets = allMode ? (combined?.tickets ?? []) : (tickets.data?.items ?? []);

  return (
    <AppShell section="Reports">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-[20px] font-semibold tracking-tight">
              {allMode ? "All events" : (selected?.name ?? "Reports")}
            </h1>
            <p className="truncate text-[12px] text-muted-foreground">
              Totals, where the exposure comes from, and the full ticket ledger.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canAll && (
              <div className="flex rounded-lg border border-border p-0.5">
                {(["event", "all"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                      scope === s ? "bg-[var(--color-brand-fill)] text-white" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s === "event" ? "This event" : "All events"}
                  </button>
                ))}
              </div>
            )}
            {eventId && !allMode && (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={api.exportCsvUrl(eventId)}>
                    <DownloadIcon />
                    Export CSV
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={api.auditPacketUrl(eventId)} target="_blank" rel="noreferrer">
                    <FileTextIcon />
                    Audit packet
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="lt-scroll min-h-0 flex-1 overflow-y-auto pr-1">
          {eventsError ? (
            <ErrorState title="Events unavailable" description="The server did not return any events." />
          ) : loading ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[104px] rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-[280px] rounded-xl" />
            </div>
          ) : errored ? (
            <ErrorState description="Could not load the report." onRetry={() => (allMode ? all.refetch() : summary.refetch())} />
          ) : panelSummary && panelSummary.ticket_count > 0 ? (
            <ReportsPanel s={panelSummary} tickets={panelTickets} perEvent={allMode ? perEvent : undefined} />
          ) : (
            <EmptyState title="No tickets yet" description="Reports appear once tickets are captured." />
          )}
        </div>
      </div>
    </AppShell>
  );
}
