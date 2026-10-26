"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { QueueFilters, type SortKey, type StatusFilter } from "@/components/console/queue-filters";
import { ReviewWorkspace } from "@/components/console/review-workspace";
import { TicketQueue } from "@/components/console/ticket-queue";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon } from "@/components/ui/icons";
import { EmptyState, ErrorState, Panel, Skeleton } from "@/components/ui/primitives";
import type { Ticket } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useTickets } from "@/lib/hooks";

const PAGE_SIZE = 12;

/**
 * Review Console — detail review of a single ticket. A dense, self-scrolling
 * queue on the left and the selected ticket's evidence/money/review workspace on
 * the right. Event-level KPIs live on Overview; this screen stays focused on the
 * one task and fits a desktop viewport without page scroll.
 */
export default function ConsolePage() {
  const { selectedId: eventId, isError: eventsError } = useEventContext();

  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const tickets = useTickets({
    eventId,
    status: status === "all" ? undefined : status,
    limit: PAGE_SIZE,
    offset,
  });

  const page = useMemo(() => tickets.data?.items ?? [], [tickets.data]);
  const total = tickets.data?.total ?? 0;
  const rows = useMemo(() => filterAndSort(page, search, sort), [page, search, sort]);

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) => {
      if (cur && rows.some((t) => t.id === cur)) return cur;
      const hero = rows.find((t) => t.valuation.is_overbill) ?? rows[0];
      return hero?.id ?? null;
    });
  }, [rows]);

  const selected = rows.find((t) => t.id === selectedId) ?? null;

  function selectTicket(id: string) {
    setSelectedId(id);
    setMobileDetail(true);
  }

  const queuePanel = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-3">
        <QueueFilters
          search={search}
          onSearch={setSearch}
          status={status}
          onStatus={(s) => {
            setStatus(s);
            setOffset(0);
          }}
          sort={sort}
          onSort={setSort}
        />
        <div className="text-[11px] tabular-nums text-[var(--color-subtle)]">
          Showing {rows.length} of {total} ticket{total === 1 ? "" : "s"}
        </div>
      </div>

      <div className="lt-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        {tickets.isLoading ? (
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px]" />
            ))}
          </div>
        ) : tickets.isError ? (
          <ErrorState description="Couldn’t load the ticket queue." onRetry={() => tickets.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No tickets match"
            description={
              search ? "No tickets on this page match your search." : "No tickets for this filter yet."
            }
          />
        ) : (
          <TicketQueue tickets={rows} selectedId={selectedId} onSelect={selectTicket} />
        )}
      </div>

      {!tickets.isLoading && !tickets.isError && rows.length > 0 && (
        <div className="border-t border-[var(--color-border)] pt-3">
          <Pagination total={total} limit={PAGE_SIZE} offset={offset} onOffset={setOffset} />
        </div>
      )}
    </div>
  );

  const workspacePanel = selected ? (
    <ReviewWorkspace ticket={selected} />
  ) : (
    <Panel className="h-full">
      <EmptyState
        title="Select a ticket"
        description="Choose a ticket from the queue to review its evidence, money frame, and anomalies."
      />
    </Panel>
  );

  if (eventsError) {
    return (
      <AppShell section="Review Console">
        <ErrorState title="Events unavailable" description="The backend didn’t return any events." />
      </AppShell>
    );
  }

  return (
    <AppShell section="Review Console">
      {/* Desktop: fixed-height two-pane that fills the viewport (no page scroll). */}
      <div className="hidden h-[calc(100dvh-108px)] gap-5 lg:grid lg:grid-cols-[minmax(300px,32%)_1fr]">
        <Panel className="min-h-0 overflow-hidden">{queuePanel}</Panel>
        <div className="lt-scroll min-h-0 min-w-0 overflow-y-auto pr-1">{workspacePanel}</div>
      </div>

      {/* Mobile/tablet: queue, slide to detail. */}
      <div className="lg:hidden">
        {!mobileDetail ? (
          <Panel>{queuePanel}</Panel>
        ) : (
          <div className="flex flex-col gap-3">
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronDownIcon size={14} className="rotate-90" />}
              onClick={() => setMobileDetail(false)}
              className="w-fit"
            >
              Back to queue
            </Button>
            {workspacePanel}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function filterAndSort(items: Ticket[], search: string, sort: SortKey): Ticket[] {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((t) => `${t.truck_id ?? ""} ${t.id}`.toLowerCase().includes(q))
    : items;
  const sorted = [...filtered];
  if (sort === "delta") {
    sorted.sort(
      (a, b) =>
        Math.abs(Number.parseFloat(b.valuation.delta_dollar_value ?? "0")) -
        Math.abs(Number.parseFloat(a.valuation.delta_dollar_value ?? "0")),
    );
  } else if (sort === "severity") {
    sorted.sort((a, b) => b.anomaly_count - a.anomaly_count);
  } else {
    sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }
  return sorted;
}
