"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontalIcon } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { OPEN_TICKET_EVENT } from "@/components/shell/command-palette";
import {
  QueueFilters,
  statusFilterLabel,
  type SortKey,
  type StatusFilter,
} from "@/components/console/queue-filters";
import { ReviewWorkspace, type TicketNav } from "@/components/console/review-workspace";
import { TicketQueue } from "@/components/console/ticket-queue";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, ClipboardIcon } from "@/components/ui/icons";
import { EmptyState, ErrorState, Panel, Skeleton } from "@/components/ui/primitives";
import type { Ticket } from "@/lib/api";
import { isJudgeMode, judgeTicketId } from "@/lib/app-mode";
import { useEventContext } from "@/lib/event-context";
import { useTicket, useTickets } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useFitCount } from "@/lib/use-fit-count";
import { isTypingTarget, useMediaQuery } from "@/lib/use-media-query";

// Queue page size on phones and portrait tablets, where the queue scrolls with
// the page.
// On desktop the page size is however many rows fit the queue column, so a tall
// monitor shows more tickets and a short laptop screen shows fewer.
const PAGE_SIZE = 6;
const TALL_PAGE_SIZE = 10;
const ROW_ESTIMATE_PX = 80; // matches the skeleton row height below
const ROW_GAP_PX = 6; // gap-1.5 in TicketQueue
// List padding (p-2, top and bottom) plus the pinned pager row.
const QUEUE_RESERVE_PX = 16 + 46;

/**
 * Review Console: single-ticket review that fits one screen. A narrow queue on
 * the left; the selected ticket in the center with the decision bar pinned to
 * its bottom; the AI analysis and anomaly flags in a right rail.
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

  // Judge mode opens on the headline over-call: show every ticket, sorted by
  // dollar delta, so the pinned result is the first row (Winner.md B7).
  const judge = isJudgeMode();
  const [status, setStatus] = useState<StatusFilter>(judge ? "all" : "draft");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>(judge ? "delta" : "newest");
  // One-shot: auto-select the pinned (or highest-delta) ticket on first load.
  const judgeSelectedRef = useRef(false);
  const [offset, setOffset] = useState(0);
  // Seed both from the URL so the very first render already knows which ticket
  // was asked for (a cached, stale queue must not win the first selection).
  const [selectedId, setSelectedId] = useState<string | null>(urlTicket);
  const [requestedId, setRequestedId] = useState<string | null>(urlTicket);
  // Set synchronously when a specific ticket is requested, before React applies
  // the matching state, so the queue-selection effect in the same commit can't
  // overwrite it with the first row.
  const requestRef = useRef<string | null>(urlTicket);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // A portrait tablet has room for a longer list than a phone.
  const tallScreen = useMediaQuery("(min-height: 1000px)", false);
  const queueBodyRef = useRef<HTMLDivElement>(null);
  const [rowsKey, setRowsKey] = useState(0);
  const pageSize = useFitCount(queueBodyRef, {
    enabled: isDesktop,
    fallback: tallScreen ? TALL_PAGE_SIZE : PAGE_SIZE,
    itemSelector: '[role="option"]',
    estimatePx: ROW_ESTIMATE_PX,
    gapPx: ROW_GAP_PX,
    reservePx: QUEUE_RESERVE_PX,
    min: 3,
    max: 30,
    remeasureKey: rowsKey,
  });

  // Keep the first visible ticket on screen when the page size changes.
  useEffect(() => {
    setOffset((o) => Math.floor(o / pageSize) * pageSize);
  }, [pageSize]);

  const tickets = useTickets({
    eventId,
    status: status === "all" ? undefined : status,
    limit: pageSize,
    offset,
  });

  const page = useMemo(() => tickets.data?.items ?? [], [tickets.data]);
  const total = tickets.data?.total ?? 0;
  const rows = useMemo(() => filterAndSort(page, search, sort), [page, search, sort]);

  // Re-read the real row height once rows (not skeletons) are rendered.
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (hasRows) setRowsKey((k) => k + 1);
  }, [hasRows]);

  // Deep link (?ticket=): react to the search param so client-side navigations
  // (e.g. clicking a row in the Reports ledger) always open the requested
  // ticket, not just the first mount. This is the fix for "wrong ticket opens".
  useEffect(() => {
    if (!urlTicket) return;
    requestRef.current = urlTicket;
    setRequestedId(urlTicket);
    setSelectedId(urlTicket);
    setMobileDetail(true);
  }, [urlTicket]);

  // Command-palette requests (open a specific ticket without a URL change).
  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      requestRef.current = id;
      setRequestedId(id);
      setSelectedId(id);
      setMobileDetail(true);
    }
    window.addEventListener(OPEN_TICKET_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TICKET_EVENT, onOpen);
  }, []);

  // Judge mode: on first load (no deep link), open the pinned ticket if one is
  // configured, else the highest-delta ticket (first row of the delta sort).
  useEffect(() => {
    if (!judge || judgeSelectedRef.current || urlTicket) return;
    const pinnedId = judgeTicketId();
    if (pinnedId) {
      requestRef.current = pinnedId;
      setRequestedId(pinnedId);
      setSelectedId(pinnedId);
      judgeSelectedRef.current = true;
      return;
    }
    const first = rows[0];
    if (first) {
      setSelectedId(first.id);
      judgeSelectedRef.current = true;
    }
  }, [judge, urlTicket, rows]);

  // A requested ticket may not be on the current page; fetch it directly.
  const pinned = useTicket(
    requestedId && !rows.some((t) => t.id === requestedId) ? requestedId : null,
  );

  // Once the requested ticket actually appears in the queue (after paging or a
  // filter change), drop the "requested" pin so normal queue navigation resumes.
  useEffect(() => {
    if (requestedId && rows.some((t) => t.id === requestedId)) {
      requestRef.current = null;
      setRequestedId(null);
    }
  }, [rows, requestedId]);

  useEffect(() => {
    if (requestedId || requestRef.current) return;
    // Don't override a deep-linked/pinned selection that is still loading or is
    // being served from the direct fetch rather than the current page.
    if (pinned.isLoading) return;
    if (selectedId && pinned.data?.id === selectedId) return;
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((cur) => (cur && rows.some((t) => t.id === cur) ? cur : (rows[0]?.id ?? null)));
  }, [rows, requestedId, pinned.isLoading, pinned.data, selectedId]);

  // If the list shrinks (e.g. after a decision) and the current page is now
  // beyond the end, snap back to the first page so the user isn't stranded.
  useEffect(() => {
    if (offset > 0 && offset >= total) setOffset(0);
  }, [offset, total]);

  const selected =
    (pinned.data?.id === selectedId ? pinned.data : null) ??
    rows.find((t) => t.id === selectedId) ??
    null;

  const selectTicket = useCallback((id: string) => {
    requestRef.current = null;
    setRequestedId(null);
    setSelectedId(id);
    setMobileDetail(true);
  }, []);

  // Previous/next through the current page, for the ticket header stepper.
  const selectedIndex = rows.findIndex((t) => t.id === selectedId);
  const nav: TicketNav | undefined =
    selectedIndex >= 0
      ? {
          index: selectedIndex,
          total: rows.length,
          onPrev: () => {
            const prev = rows[selectedIndex - 1];
            if (prev) selectTicket(prev.id);
          },
          onNext: () => {
            const next = rows[selectedIndex + 1];
            if (next) selectTicket(next.id);
          },
        }
      : undefined;

  const filtersActive = status !== "draft" || sort !== "newest";

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
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1.5">
              <h2 className="lt-card-title whitespace-nowrap">Review queue</h2>
              <span
                className="rounded-full bg-[var(--color-surface-2)] px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums text-muted-foreground"
                aria-label={`${total} ticket${total === 1 ? "" : "s"}`}
              >
                {total}
              </span>
            </div>
            <span className="truncate text-[12px] leading-snug tabular-nums text-muted-foreground">
              {statusFilterLabel(status)}
              {search && ` · ${rows.length} match${rows.length === 1 ? "" : "es"}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors",
              filtersOpen
                ? "border-[var(--color-accent)] text-[var(--color-text)]"
                : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-text)]",
            )}
          >
            <SlidersHorizontalIcon className="size-3.5" />
            {/* Icon only in the narrow laptop/tablet queue column. */}
            <span className="lg:max-xl:sr-only">Filter</span>
            {filtersActive && (
              <span
                className="absolute -right-1 -top-1 size-2 rounded-full bg-[var(--color-accent)]"
                aria-label="Filters applied"
              />
            )}
          </button>
        </div>
        <QueueFilters
          compact
          showControls={filtersOpen}
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
      </div>

      {/* Measured by useFitCount: its height decides the desktop page size. */}
      <div ref={queueBodyRef} className="flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            "lt-scroll min-h-0 flex-1 overflow-y-auto p-2",
            // The floating launcher sits over the right rail on desktop, not here.
            !isDesktop && "lt-fab-safe",
          )}
        >
          {tickets.isLoading ? (
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: pageSize }).map((_, i) => (
                <Skeleton key={i} className="h-[80px]" />
              ))}
            </div>
          ) : tickets.isError ? (
            <ErrorState
              description="Could not load the ticket queue."
              onRetry={() => tickets.refetch()}
            />
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

        {!tickets.isLoading && !tickets.isError && total > pageSize && (
          <div className="border-t border-border px-2.5 py-2">
            <Pagination total={total} limit={pageSize} offset={offset} onOffset={setOffset} />
          </div>
        )}
      </div>
    </div>
  );

  const workspacePanel = selected ? (
    <ReviewWorkspace key={selected.id} ticket={selected} nav={nav} />
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
        <ErrorState
          title="Events unavailable"
          description="The server did not return any events."
        />
      </AppShell>
    );
  }

  return (
    <AppShell section="Review" fluid>
      {isDesktop ? (
        // Fixed-height grid: the queue column scrolls its list with the pager
        // pinned; the workspace lays out its own columns and scroll areas.
        <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)] gap-3 xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-4 2xl:grid-cols-[19rem_minmax(0,1fr)]">
          <div className="min-h-0 overflow-hidden rounded-xl border border-border bg-card">
            {queuePanel}
          </div>
          <div className="min-h-0 min-w-0">{workspacePanel}</div>
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
