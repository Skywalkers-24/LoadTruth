"use client";

import { AppShell } from "@/components/shell/app-shell";
import { EventActions } from "@/components/console/event-actions";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { ErrorState } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/page-header";
import { useEventContext } from "@/lib/event-context";
import { useDashboard, useReportsSummary, useTickets } from "@/lib/hooks";

/** Overview: what needs action now for the active event. */
export default function OverviewPage() {
  const { selected, selectedId: eventId, isError: eventsError } = useEventContext();
  const dashboard = useDashboard(eventId);
  const summary = useReportsSummary(eventId);
  const tickets = useTickets({ eventId, limit: 100, offset: 0 });

  return (
    <AppShell section="Overview">
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Overview"
          title={selected?.name ?? "Overview"}
          description={
            selected?.location
              ? `${selected.location} · Video-verified load tickets measured by the cubic yard.`
              : "Video-verified load tickets measured by the cubic yard."
          }
          actions={eventId ? <EventActions eventId={eventId} uploadVariant="secondary" /> : undefined}
        />

        {eventsError ? (
          <ErrorState title="Events unavailable" description="The server did not return any events. Refresh to try again." />
        ) : (
          <OverviewDashboard
            dashboard={dashboard.data}
            summary={summary.data}
            tickets={tickets.data?.items ?? []}
            isLoading={dashboard.isLoading || tickets.isLoading}
          />
        )}
      </div>
    </AppShell>
  );
}
