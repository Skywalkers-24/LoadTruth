"use client";

import type { Ticket } from "@/lib/api";
import { AnomalyBadge, StatusBadge } from "@/components/ui/badge";
import { cubicYards, debrisLabel, percent, signedMoney } from "@/lib/format";
import { shortId } from "@/components/console/ticket-metadata";

/**
 * The dense, scrollable review queue. One row per ticket. Selection is
 * unmistakable: a strong amber left border, a selected surface, and an
 * accessible selected state. Mobile rows invoke the same onSelect.
 */
export function TicketQueue({
  tickets,
  selectedId,
  onSelect,
}: {
  tickets: Ticket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul
      className="flex flex-col gap-1.5"
      role="listbox"
      aria-label="Review queue"
      aria-activedescendant={selectedId ? `ticket-${selectedId}` : undefined}
    >
      {tickets.map((t) => (
        <TicketRow
          key={t.id}
          ticket={t}
          selected={t.id === selectedId}
          onSelect={() => onSelect(t.id)}
        />
      ))}
    </ul>
  );
}

function TicketRow({
  ticket,
  selected,
  onSelect,
}: {
  ticket: Ticket;
  selected: boolean;
  onSelect: () => void;
}) {
  const v = ticket.valuation;
  const hasCall = v.monitor_fill_pct !== null && v.delta_dollar_value !== null;
  const overbill = v.is_overbill;
  const deltaColor = overbill ? "var(--color-money)" : "var(--color-ok)";

  return (
    <li>
      <button
        id={`ticket-${ticket.id}`}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className="w-full rounded-md border border-l-[3px] px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        style={{
          borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
          borderLeftColor: selected ? "var(--color-accent)" : "var(--color-border)",
          backgroundColor: selected ? "var(--color-accent-soft)" : "var(--color-surface)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold tabular-nums text-[var(--color-text)]">
            {ticket.truck_id ?? "Unidentified"}
          </span>
          <StatusBadge status={ticket.status} />
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums text-[var(--color-subtle)]">
          <span>{shortId(ticket.id)}</span>
          <span aria-hidden>·</span>
          <span>{debrisLabel(ticket.debris_class)}</span>
          <span aria-hidden>·</span>
          <span>{cubicYards(v.est_cubic_yards)}</span>
        </div>

        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div className="flex flex-col gap-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
            <span>
              Measured <span className="text-[var(--color-text)]">{percent(v.est_fill_pct)}</span>
            </span>
            <span>
              Monitor{" "}
              <span className="text-[var(--color-text)]">
                {hasCall ? percent(v.monitor_fill_pct) : "—"}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AnomalyBadge count={ticket.anomaly_count} />
            {hasCall && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums"
                style={{
                  color: deltaColor,
                  backgroundColor: `color-mix(in srgb, ${deltaColor} 12%, transparent)`,
                }}
              >
                {signedMoney(v.delta_dollar_value)}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
