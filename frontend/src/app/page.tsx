"use client";

import { AppShell } from "@/components/shell/app-shell";
import { EventActions } from "@/components/console/event-actions";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { ErrorState } from "@/components/ui/primitives";
import { useEventContext } from "@/lib/event-context";
import { useDashboard, useReportsSummary, useTickets } from "@/lib/hooks";

/** Overview: what needs action now for the active event. Fits one desktop screen. */
export default function OverviewPage() {
  const { selected, selectedId: eventId, isError: eventsError } = useEventContext();
  const dashboard = useDashboard(eventId);
  const summary = useReportsSummary(eventId);
  const tickets = useTickets({ eventId, limit: 100, offset: 0 });

  return (
    <AppShell section="Overview">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-[20px] font-semibold tracking-tight">{selected?.name ?? "Overview"}</h1>
            <p className="truncate text-[12px] text-muted-foreground">
              {selected?.location
                ? `${selected.location} · Video-verified load tickets measured by the cubic yard.`
                : "Video-verified load tickets measured by the cubic yard."}
            </p>
          </div>
          {eventId && <EventActions eventId={eventId} uploadVariant="secondary" />}
        </div>

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
