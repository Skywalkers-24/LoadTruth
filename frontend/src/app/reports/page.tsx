"use client";

import { AppNav } from "@/components/app-nav";
import { ReportsSummaryPanel } from "@/components/reports-summary";
import { api } from "@/lib/api";
import { useEvents, useReportsSummary } from "@/lib/hooks";

/** Reports page: event-level summary breakdowns + export actions. */
export default function ReportsPage() {
  const events = useEvents();
  const eventId = events.data?.[0]?.id;
  const summary = useReportsSummary(eventId);

  return (
    <>
      <AppNav />
      <main className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-muted)]">
              LoadTruth · Reports
            </span>
            <h1 className="text-xl font-semibold sm:text-2xl">
              {events.data?.[0]?.name ?? "Loading…"}
            </h1>
          </div>
          {eventId && (
            <div className="flex flex-wrap gap-2">
              <a
                href={api.exportCsvUrl(eventId)}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]"
              >
                Export CSV
              </a>
              <a
                href={api.auditPacketUrl(eventId)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]"
              >
                Audit packet
              </a>
            </div>
          )}
        </header>

        {summary.isLoading ? (
          <p className="text-sm text-[var(--color-muted)]">Loading summary…</p>
        ) : summary.data ? (
          <ReportsSummaryPanel s={summary.data} />
        ) : (
          <p className="text-sm text-[var(--color-muted)]">No report data yet.</p>
        )}
      </main>
    </>
  );
}
