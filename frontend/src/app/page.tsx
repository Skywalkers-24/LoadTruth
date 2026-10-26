"use client";

import Link from "next/link";

import { AppShell } from "@/components/shell/app-shell";
import { EventActions } from "@/components/console/event-actions";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { Button } from "@/components/ui/button";
import { ClipboardIcon } from "@/components/ui/icons";
import { ErrorState } from "@/components/ui/primitives";
import { useEventContext } from "@/lib/event-context";
import { useDashboard, useReportsSummary, useTickets } from "@/lib/hooks";

/**
 * Overview — the operator dashboard landing. Headline KPIs, status/debris
 * breakdowns, and the priority action queue, all from real backend data. Shows
 * the active event context via the app shell.
 */
export default function OverviewPage() {
  const { selected, selectedId: eventId, isError: eventsError } = useEventContext();

  const dashboard = useDashboard(eventId);
  const summary = useReportsSummary(eventId);
  // A generous page for the priority queue ranking (API max limit is 100).
  const tickets = useTickets({ eventId, limit: 100, offset: 0 });

  return (
    <AppShell section="Overview">
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[20px] font-semibold text-[var(--color-text)]">
              {selected?.name ?? "Overview"}
            </h1>
            <p className="text-[13px] text-[var(--color-muted)]">
              Video-verified load tickets. Measured fill compared with the monitor&apos;s call, by the
              cubic yard.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/console">
              <Button variant="primary" icon={<ClipboardIcon size={15} />}>
                Open review console
              </Button>
            </Link>
            {eventId && <EventActions eventId={eventId} />}
          </div>
        </header>

        {eventsError ? (
          <ErrorState
            title="Events unavailable"
            description="The backend didn’t return any events. Start it, then reload."
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
