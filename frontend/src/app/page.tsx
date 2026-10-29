"use client";

import { AppShell } from "@/components/shell/app-shell";
import { EventActions } from "@/components/console/event-actions";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { ErrorState } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useDashboard, useReportsSummary, useTickets } from "@/lib/hooks";

/** Time-of-day greeting for the overview header. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Overview: what needs action now for the active event. Fits one desktop screen. */
export default function OverviewPage() {
  const { member } = useAuth();
  const {
    selected,
    selectedId: eventId,
    isError: eventsError,
    isWakingUp,
    refetch: refetchEvents,
  } = useEventContext();
  const dashboard = useDashboard(eventId);
  const summary = useReportsSummary(eventId);
  const tickets = useTickets({ eventId, limit: 100, offset: 0 });

  return (
    <AppShell section="Overview">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="lt-page-title truncate">
              {greeting()}
              {member?.full_name ? `, ${member.full_name.split(" ")[0]}` : ""}
            </h1>
            <p className="truncate text-[12px] text-muted-foreground">
              {selected?.name ?? "Overview"}
              {selected?.location ? ` · ${selected.location}` : ""} · Video-verified load tickets by
              the cubic yard.
            </p>
          </div>
          {eventId && <EventActions eventId={eventId} uploadVariant="secondary" />}
        </div>

        {eventsError ? (
          <ErrorState
            title={isWakingUp ? "Backend server is waking up" : "Events unavailable"}
            description={
              isWakingUp
                ? "The backend is hosted on Render (free tier), which spins down after 15 minutes of inactivity. The container is starting up (takes ~30–60 seconds). Retrying automatically..."
                : "The server did not return any events. Click below to try again."
            }
            onRetry={refetchEvents}
          />
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
