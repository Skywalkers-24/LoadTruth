"use client";

import { AppShell } from "@/components/shell/app-shell";
import { ReportsPanel } from "@/components/reports/reports-panel";
import { LinkButton } from "@/components/ui/button";
import { DownloadIcon, FileIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useReportsSummary, useTickets } from "@/lib/hooks";

/** Reports: event totals, exposure breakdowns, the ticket ledger, and exports. */
export default function ReportsPage() {
  const { selected, selectedId: eventId, isError: eventsError } = useEventContext();
  const summary = useReportsSummary(eventId);
  const tickets = useTickets({ eventId, limit: 100, offset: 0 });

  return (
    <AppShell section="Reports">
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Reports"
          title={selected?.name ?? "Reports"}
          description="Event totals, where the exposure comes from, and the full ticket ledger."
          actions={
            eventId && (
              <>
                <LinkButton href={api.exportCsvUrl(eventId)} icon={<DownloadIcon size={15} />}>
                  Export CSV
                </LinkButton>
                <Tooltip content="Printable packet in the layout FEMA reviewers expect. LoadTruth is not affiliated with or endorsed by FEMA.">
                  <span>
                    <LinkButton href={api.auditPacketUrl(eventId)} icon={<FileIcon size={15} />} external>
                      Audit packet
                    </LinkButton>
                  </span>
                </Tooltip>
              </>
            )
          }
        />

        {eventsError ? (
          <ErrorState title="Events unavailable" description="The server did not return any events." />
        ) : summary.isLoading || tickets.isLoading ? (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[132px] rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-[300px] rounded-xl" />
            <Skeleton className="h-[400px] rounded-xl" />
          </div>
        ) : summary.isError ? (
          <ErrorState description="Could not load the report." onRetry={() => summary.refetch()} />
        ) : summary.data && summary.data.ticket_count > 0 ? (
          <ReportsPanel s={summary.data} tickets={tickets.data?.items ?? []} />
        ) : (
          <EmptyState title="No tickets yet" description="Reports appear once tickets are captured for this event." />
        )}
      </div>
    </AppShell>
  );
}
