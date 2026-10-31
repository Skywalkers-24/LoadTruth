"use client";

import type { Ticket } from "@/lib/api";
import { StatusBadge } from "@/components/ui/badge";
import { AlertIcon, TruckIcon } from "@/components/ui/icons";
import { percent, relativeTime, signedMoney } from "@/lib/format";
import { shortId } from "@/components/console/ticket-metadata";

/**
 * Console queue. Each row leads with the unique ticket ID (a truck appears on
 * many tickets), shows truck, debris, and capture time, a compact fill gauge
 * comparing measured fill with the monitor's call, and the dollar delta.
 */
export function TicketQueue({
  tickets,
  selectedId,
  onSelect,
  showStatus = true,
}: {
  tickets: Ticket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Hide the status pill when the queue is already filtered to one status. */
  showStatus?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-1.5" role="listbox" aria-label="Console tickets">
      {tickets.map((t) => (
        <TicketRow
          key={t.id}
          ticket={t}
          selected={t.id === selectedId}
          showStatus={showStatus}
          onSelect={() => onSelect(t.id)}
        />
      ))}
    </ul>
  );
}

function TicketRow({
  ticket,
  selected,
  showStatus,
  onSelect,
}: {
  ticket: Ticket;
  selected: boolean;
  showStatus: boolean;
  onSelect: () => void;
}) {
  const v = ticket.valuation;
  const hasCall = v.monitor_fill_pct !== null && v.delta_dollar_value !== null;
  const delta = hasCall ? Number.parseFloat(v.delta_dollar_value ?? "0") : 0;
  const deltaColor = !hasCall
    ? "var(--color-subtle)"
    : delta > 0.005
      ? "var(--color-money)"
      : "var(--color-ok)";

  return (
    <li>
      <button
        id={`ticket-${ticket.id}`}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className="relative w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left transition-all hover:border-[var(--color-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        style={{
          borderColor: selected
            ? "color-mix(in srgb, var(--color-accent) 60%, var(--color-border))"
            : "var(--color-border)",
          backgroundColor: selected ? "var(--color-accent-soft)" : "var(--color-surface)",
        }}
      >
        {selected && (
          <span
            className="absolute inset-y-0 left-0 w-[3px] bg-[var(--color-accent)]"
            aria-hidden
          />
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold tabular-nums text-[var(--color-text)]">
              {ticket.truck_id ?? "Unidentified truck"}
            </span>
            {ticket.anomaly_count > 0 && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[var(--color-danger)]"
                title={`${ticket.anomaly_count} review flag${ticket.anomaly_count === 1 ? "" : "s"}`}
              >
                <AlertIcon size={12} />
                {ticket.anomaly_count}
              </span>
            )}
          </span>
          <span className="text-[12px] font-medium tabular-nums" style={{ color: deltaColor }}>
            {hasCall ? signedMoney(v.delta_dollar_value) : ""}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
          <TruckIcon size={12} className="shrink-0 text-[var(--color-subtle)]" />
          <span className="truncate tabular-nums">{shortId(ticket.id)}</span>
          <span aria-hidden className="text-[var(--color-subtle)]">
            ·
          </span>
          <span className="shrink-0 text-[var(--color-subtle)]">
            {relativeTime(ticket.created_at)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          {/* Compact numbers without repeating the words "measured"/"called" on
              every row — the gauge + column context already convey them. */}
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-subtle)]">
            <span className="text-muted-foreground">{percent(v.est_fill_pct)} estimated</span>
            {v.monitor_fill_pct !== null && (
              <>
                {" "}
                / <span className="text-[var(--color-text)]">{percent(v.monitor_fill_pct)}</span>
              </>
            )}
          </span>
          {showStatus && <StatusBadge status={ticket.status} />}
        </div>
      </button>
    </li>
  );
}
