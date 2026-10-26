"use client";

import { useEffect, useMemo, useState } from "react";

import { AppNav } from "@/components/app-nav";
import { ClipUploader } from "@/components/clip-uploader";
import { DashboardPanel } from "@/components/dashboard";
import { Pagination } from "@/components/pagination";
import { ReviewConsole } from "@/components/review-console";
import { TicketList } from "@/components/ticket-list";
import type { TicketStatus } from "@/lib/api";
import { useDashboard, useEvents, useTickets } from "@/lib/hooks";

const PAGE_SIZE = 10;

const STATUS_FILTERS: { value: TicketStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Needs review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "disputed", label: "Disputed" },
];

/**
 * Operator console: event header + dashboard roll-up, a paginated/filterable
 * review queue, and the review console for the selected ticket (PLAN.md §3).
 * Single seeded tenant in this build (§1a).
 */
export default function ConsolePage() {
  const events = useEvents();
  const eventId = events.data?.[0]?.id;

  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tickets = useTickets({
    eventId,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: PAGE_SIZE,
    offset,
  });
  const dashboard = useDashboard(eventId);

  const rows = useMemo(() => tickets.data?.items ?? [], [tickets.data]);
  const total = tickets.data?.total ?? 0;

  // Default-select the first over-called ticket (the money frame) on first load.
  useEffect(() => {
    if (selectedId || rows.length === 0) return;
    const hero = rows.find((t) => t.valuation.is_overbill) ?? rows[0];
    if (hero) setSelectedId(hero.id);
  }, [rows, selectedId]);

  const selected = rows.find((t) => t.id === selectedId) ?? null;

  function changeFilter(next: TicketStatus | "all") {
    setStatusFilter(next);
    setOffset(0);
    setSelectedId(null);
  }

  return (
    <>
      <AppNav />
      <main className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-muted)]">
            LoadTruth · Operator console
          </span>
          <h1 className="text-xl font-semibold sm:text-2xl">
            {events.data?.[0]?.name ?? "Loading event…"}
          </h1>
          {events.data?.[0]?.location && (
            <p className="text-sm text-[var(--color-muted)]">{events.data[0].location}</p>
          )}
          {eventId && <ClipUploader eventId={eventId} />}
        </header>

        {dashboard.data && <DashboardPanel d={dashboard.data} />}

        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => changeFilter(f.value)}
                    className="rounded-full px-3 py-1 text-xs transition-colors"
                    style={{
                      color: active ? "var(--color-text)" : "var(--color-muted)",
                      backgroundColor: active
                        ? "color-mix(in srgb, var(--color-accent) 14%, transparent)"
                        : "var(--color-surface)",
                      borderWidth: 1,
                      borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {tickets.isLoading ? (
              <p className="text-sm text-[var(--color-muted)]">Loading tickets…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No tickets match this filter.</p>
            ) : (
              <>
                <TicketList tickets={rows} selectedId={selectedId} onSelect={setSelectedId} />
                <Pagination total={total} limit={PAGE_SIZE} offset={offset} onOffset={setOffset} />
              </>
            )}
          </section>

          <section>
            {selected ? (
              <ReviewConsole key={selected.id} ticket={selected} />
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                Select a ticket from the queue to review.
              </p>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
