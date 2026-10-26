"use client";

import { AppShell } from "@/components/shell/app-shell";
import { ReportsPanel } from "@/components/reports/reports-panel";
import { LinkButton } from "@/components/ui/button";
import { DownloadIcon, FileIcon } from "@/components/ui/icons";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useReportsSummary } from "@/lib/hooks";

/** Event-level reporting workspace: KPIs, breakdowns, and exports. */
export default function ReportsPage() {
  const { selected, selectedId: eventId, isError: eventsError } = useEventContext();
  const summary = useReportsSummary(eventId);

  return (
    <AppShell section="Reports">
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[20px] font-semibold text-[var(--color-text)]">
              {selected?.name ?? "Reports"}
            </h1>
            <p className="text-[13px] text-[var(--color-muted)]">
              Historical analysis and audit exports for this event.
            </p>
          </div>
          {eventId && (
            <div className="flex flex-wrap gap-2">
              <LinkButton href={api.exportCsvUrl(eventId)} icon={<DownloadIcon size={15} />}>
                Export CSV
              </LinkButton>
              <LinkButton
                href={api.auditPacketUrl(eventId)}
                icon={<FileIcon size={15} />}
                external
              >
                FEMA-format audit packet
              </LinkButton>
            </div>
          )}
        </header>

        <p className="text-[11px] text-[var(--color-subtle)]">
          “FEMA-format audit packet” describes the document layout only. LoadTruth is not affiliated
          with or endorsed by FEMA.
        </p>

        {eventsError ? (
          <ErrorState title="Events unavailable" description="The backend didn’t return any events." />
        ) : summary.isLoading ? (
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-44" />
              ))}
            </div>
          </div>
        ) : summary.isError ? (
          <ErrorState description="Couldn’t load the report." onRetry={() => summary.refetch()} />
        ) : summary.data ? (
          <ReportsPanel s={summary.data} />
        ) : (
          <EmptyState title="No report data" description="This event has no tickets yet." />
        )}
      </div>
    </AppShell>
  );
}
