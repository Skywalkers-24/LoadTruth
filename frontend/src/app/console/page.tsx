"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { AssistantWidget } from "@/components/ai/assistant-widget";
import { OPEN_TICKET_EVENT } from "@/components/shell/command-palette";
import { QueueFilters, type SortKey, type StatusFilter } from "@/components/console/queue-filters";
import { ReviewWorkspace } from "@/components/console/review-workspace";
import { TicketQueue } from "@/components/console/ticket-queue";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, ClipboardIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { EmptyState, ErrorState, Panel, Skeleton } from "@/components/ui/primitives";
import type { Ticket } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { useTicket, useTickets } from "@/lib/hooks";
import { isTypingTarget, useMediaQuery } from "@/lib/use-media-query";

const PAGE_SIZE = 12;

/**
 * Review Console: single-ticket review. A self-scrolling queue on the left and
 * the selected ticket's money frame, evidence, and decision rail on the right.
 * Keyboard: J/K or arrow keys move through the queue, C/O/D decide.
 */
export default function ConsolePage() {
  // useSearchParams requires a Suspense boundary during static rendering.
  return (
    <Suspense fallback={null}>
      <ConsoleView />
    </Suspense>
  );
}

function ConsoleView() {
  const { selectedId: eventId, isError: eventsError } = useEventContext();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const searchParams = useSearchParams();
  const urlTicket = searchParams.get("ticket");

  const [status, setStatus] = useState<StatusFilter>("draft");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("delta");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const tickets = useTickets({
    eventId,
    status: status === "all" ? undefined : status,
    limit: PAGE_SIZE,
    offset,
  });

  const page = useMemo(() => tickets.data?.items ?? [], [tickets.data]);
  const total = tickets.data?.total ?? 0;
  const rows = useMemo(() => filterAndSort(page, search, sort), [page, search, sort]);

  // Deep link (?ticket=): react to the search param so client-side navigations
  // (e.g. clicking a row in the Reports ledger) always open the requested
  // ticket, not just the first mount. This is the fix for "wrong ticket opens".
  useEffect(() => {
    if (!urlTicket) return;
    setRequestedId(urlTicket);
    setSelectedId(urlTicket);
    setMobileDetail(true);
  }, [urlTicket]);

  // Command-palette requests (open a specific ticket without a URL change).
  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      setRequestedId(id);
      setSelectedId(id);
      setMobileDetail(true);
    }
    window.addEventListener(OPEN_TICKET_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TICKET_EVENT, onOpen);
  }, []);

  // A requested ticket may not be on the current page; fetch it directly.
  const pinned = useTicket(requestedId && !rows.some((t) => t.id === requestedId) ? requestedId : null);

  // Once the requested ticket actually appears in the queue (after paging or a
  // filter change), drop the "requested" pin so normal queue navigation resumes.
  useEffect(() => {
    if (requestedId && rows.some((t) => t.id === requestedId)) setRequestedId(null);
  }, [rows, requestedId]);

  useEffect(() => {
    if (requestedId) return;
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) => (cur && rows.some((t) => t.id === cur) ? cur : (rows[0]?.id ?? null)));
  }, [rows, requestedId]);

  // If the list shrinks (e.g. after a decision) and the current page is now
  // beyond the end, snap back to the first page so the user isn't stranded.
  useEffect(() => {
    if (offset > 0 && offset >= total) setOffset(0);
  }, [offset, total]);

  const selected =
    rows.find((t) => t.id === selectedId) ?? (pinned.data?.id === selectedId ? pinned.data : null) ?? null;

  const selectTicket = useCallback((id: string) => {
    setRequestedId(null);
    setSelectedId(id);
    setMobileDetail(true);
    workspaceRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // J/K and arrow-key navigation through the queue.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key;
      const down = k === "j" || k === "J" || k === "ArrowDown";
      const up = k === "k" || k === "K" || k === "ArrowUp";
      if (!down && !up) return;
      e.preventDefault();
      const idx = rows.findIndex((t) => t.id === selectedId);
      const next = rows[Math.min(rows.length - 1, Math.max(0, idx + (down ? 1 : -1)))];
      if (next) {
        selectTicket(next.id);
        document.getElementById(`ticket-${next.id}`)?.scrollIntoView({ block: "nearest" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selectedId, selectTicket]);

  const queuePanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-3">
        <QueueFilters
          search={search}
          onSearch={setSearch}
          status={status}
          onStatus={(s) => {
            setStatus(s);
            setOffset(0);
            setRequestedId(null);
          }}
          sort={sort}
          onSort={setSort}
        />
        <div className="flex items-center justify-between text-[12px] tabular-nums text-muted-foreground">
          <span>
            {total} ticket{total === 1 ? "" : "s"}
            {search && ` · ${rows.length} match${rows.length === 1 ? "" : "es"}`}
          </span>
          <span className="hidden items-center gap-1 lg:flex">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> to move
          </span>
        </div>
      </div>

      <div className="lt-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {tickets.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px]" />
            ))}
          </div>
        ) : tickets.isError ? (
          <ErrorState description="Could not load the ticket queue." onRetry={() => tickets.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardIcon size={20} />}
            title={status === "draft" && !search ? "Queue is clear" : "No tickets match"}
            description={
              status === "draft" && !search
                ? "Every ticket in this event has a decision."
                : "Try a different filter or search term."
            }
          />
        ) : (
          <TicketQueue
            tickets={rows}
            selectedId={selectedId}
            onSelect={selectTicket}
            showStatus={status === "all"}
          />
        )}
      </div>

      {!tickets.isLoading && !tickets.isError && total > PAGE_SIZE && (
        <div className="border-t border-border px-3 py-2.5">
          <Pagination total={total} limit={PAGE_SIZE} offset={offset} onOffset={setOffset} />
        </div>
      )}
    </div>
  );

  const workspacePanel = selected ? (
    <ReviewWorkspace key={selected.id} ticket={selected} />
  ) : pinned.isLoading ? (
    <Skeleton className="h-[520px]" />
  ) : (
    <Panel className="flex h-full items-center justify-center">
      <EmptyState
        icon={<ClipboardIcon size={20} />}
        title="Select a ticket"
        description="Choose a ticket from the queue to review its money frame, evidence, and anomaly flags."
      />
    </Panel>
  );

  if (eventsError) {
    return (
      <AppShell section="Review">
        <ErrorState title="Events unavailable" description="The server did not return any events." />
      </AppShell>
    );
  }

  return (
    <AppShell section="Review">
      {isDesktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,30%)_1fr] gap-4">
          <div className="min-h-0 overflow-hidden rounded-xl border border-border bg-card">
            {queuePanel}
          </div>
          <div ref={workspaceRef} className="lt-scroll min-h-0 min-w-0 overflow-y-auto pr-1">
            {workspacePanel}
          </div>
        </div>
      ) : !mobileDetail || !selected ? (
        <div className="lt-card-shadow overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {queuePanel}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="sticky top-14 z-10 -mx-4 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 sm:-mx-6 sm:px-6">
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronDownIcon size={14} className="rotate-90" />}
              onClick={() => {
                setMobileDetail(false);
                setRequestedId(null);
              }}
            >
              Back to queue
            </Button>
          </div>
          {workspacePanel}
        </div>
      )}
      <AssistantWidget />
    </AppShell>
  );
}

function filterAndSort(items: Ticket[], search: string, sort: SortKey): Ticket[] {
  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((t) => `${t.truck_id ?? ""} ${t.id}`.toLowerCase().includes(q)) : items;
  const sorted = [...filtered];
  if (sort === "delta") {
    sorted.sort(
      (a, b) =>
        Number.parseFloat(b.valuation.delta_dollar_value ?? "-1e9") -
        Number.parseFloat(a.valuation.delta_dollar_value ?? "-1e9"),
    );
  } else if (sort === "severity") {
    sorted.sort((a, b) => b.anomaly_count - a.anomaly_count);
  } else {
    sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }
  return sorted;
}
