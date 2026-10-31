"use client";

import Link from "next/link";
import { useState } from "react";
import { PlusIcon, RefreshCwIcon, TicketIcon, Trash2Icon } from "lucide-react";

import type { Ticket, TicketStatus } from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Pagination } from "@/components/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { shortId } from "@/components/console/ticket-metadata";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useDeleteTicket, useTickets } from "@/lib/hooks";
import { debrisLabel, money, relativeTime } from "@/lib/format";

const PAGE_SIZE = 25;

export default function TicketsPage() {
  const { selectedId: eventId } = useEventContext();
  // Remount filters and pagination with the event so stale records cannot
  // briefly appear as though they belong to a newly selected event.
  return (
    <AppShell section="Tickets">
      <TicketList key={eventId ?? "none"} eventId={eventId} />
    </AppShell>
  );
}

function TicketList({ eventId }: { eventId: string | undefined }) {
  const { selected } = useEventContext();
  const isReadOnly = Boolean(selected?.tags.includes("read-only"));
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [offset, setOffset] = useState(0);
  const [deletingTicket, setDeletingTicket] = useState<Ticket | null>(null);
  const deleteTicketMutation = useDeleteTicket();

  const tickets = useTickets({
    eventId,
    status: status === "all" ? undefined : status,
    limit: PAGE_SIZE,
    offset,
    sort: "created",
    order: "desc",
  });
  const rows = tickets.data?.items ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="lt-page-title">Tickets</h1>
            {isReadOnly && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
                Read-only
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Every load ticket in this event, with its estimated value and evidence.
          </p>
        </div>
        <Link
          href="/add"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground"
        >
          <PlusIcon className="size-4" />
          New Ticket
        </Link>
      </header>
      <Card className="lt-fab-safe flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <label className="flex items-center gap-2 text-[13px]">
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as TicketStatus | "all");
                setOffset(0);
              }}
              className="h-9 rounded-md border border-border bg-background px-3 text-foreground"
            >
              <option value="all">All tickets</option>
              <option value="draft">Flagged for review</option>
              <option value="confirmed">Confirmed</option>
              <option value="overridden">Overridden</option>
              <option value="disputed">Disputed</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void tickets.refetch()}
            disabled={!eventId || tickets.isFetching}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCwIcon className="size-3.5" />
            Refresh
          </button>
        </div>
        <div className="lt-scroll min-h-0 flex-1 overflow-auto" aria-busy={tickets.isFetching}>
          {!eventId ? (
            <p className="p-8 text-sm text-muted-foreground">
              Select an event to browse its tickets.
            </p>
          ) : tickets.isError ? (
            <div role="alert" className="p-8 text-sm">
              <p>Tickets could not be loaded.</p>
              <button
                onClick={() => void tickets.refetch()}
                className="mt-3 text-primary underline"
              >
                Try again
              </button>
            </div>
          ) : tickets.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <TicketIcon className="size-8 text-muted-foreground" />
              <h2 className="font-semibold">
                {status === "all" ? "No tickets yet" : "No tickets with this status"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {status === "all"
                  ? "Upload truck footage to generate a ticket automatically."
                  : "Choose another status to see more tickets."}
              </p>
              {offset > 0 && (
                <button onClick={() => setOffset(0)} className="text-sm text-primary underline">
                  Return to first page
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((t) => (
                <li key={t.id} className="group relative flex items-stretch transition-colors hover:bg-accent/40">
                  <Link
                    href={`/console?ticket=${t.id}`}
                    className="grid flex-1 min-w-0 gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {t.truck_id ?? "Unidentified truck"}{" "}
                        <span className="font-normal text-muted-foreground">· {shortId(t.id)}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {debrisLabel(t.debris_class)} · {relativeTime(t.created_at)}
                      </span>
                    </div>
                    <div className="self-center">
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="self-center sm:text-right">
                      <span className="block text-sm font-semibold tabular-nums text-[var(--color-money)]">
                        {Number.parseFloat(t.valuation.certified_cubic_yards) > 0
                          ? money(t.valuation.est_dollar_value)
                          : "Unavailable"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">Estimated value</span>
                    </div>
                  </Link>
                  {!isReadOnly && (
                    <div className="flex items-center px-3">
                      <button
                        type="button"
                        title="Delete ticket"
                        aria-label={`Delete ticket ${shortId(t.id)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeletingTicket(t);
                        }}
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none"
                      >
                        <Trash2Icon className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {eventId && tickets.data && !tickets.isError && (
          <div className="border-t border-border p-4">
            <Pagination
              total={tickets.data.total}
              limit={PAGE_SIZE}
              offset={offset}
              onOffset={setOffset}
            />
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deletingTicket)}
        title="Delete ticket?"
        description={`Are you sure you want to delete ticket ${shortId(deletingTicket?.id ?? "")}${deletingTicket?.truck_id ? ` (${deletingTicket.truck_id})` : ""}? All associated analysis and evidence will be permanently deleted.`}
        confirmLabel="Delete ticket"
        confirmVariant="danger"
        busy={deleteTicketMutation.isPending}
        onConfirm={() => {
          if (deletingTicket) {
            deleteTicketMutation.mutate(deletingTicket.id, {
              onSuccess: () => setDeletingTicket(null),
            });
          }
        }}
        onCancel={() => setDeletingTicket(null)}
      />
    </div>
  );
}
