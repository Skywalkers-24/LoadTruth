"use client";

import type { Ticket } from "@/lib/api";
import { AnomalyBadge, StatusBadge } from "@/components/badges";
import { cubicYards, debrisLabel, money, percent } from "@/lib/format";

/** The review queue: one row per ticket, selectable. Mobile-friendly rows. */
export function TicketList({
  tickets,
  selectedId,
  onSelect,
}: {
  tickets: Ticket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2" role="listbox" aria-label="Review queue">
      {tickets.map((t) => {
        const selected = t.id === selectedId;
        const overbill = t.valuation.is_overbill;
        return (
          <li key={t.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(t.id)}
              className="w-full rounded-lg border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              style={{
                borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                backgroundColor: selected
                  ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                  : "var(--color-surface)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium tabular-nums">
                  {t.truck_id ?? "unidentified"}
                </span>
                <StatusBadge status={t.status} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
                <span>
                  {debrisLabel(t.debris_class)} · {percent(t.valuation.est_fill_pct)} ·{" "}
                  {cubicYards(t.valuation.est_cubic_yards)}
                </span>
                <AnomalyBadge count={t.anomaly_count} />
              </div>
              {overbill && (
                <div className="mt-1 text-xs font-medium" style={{ color: "var(--color-accent)" }}>
                  +{money(t.valuation.delta_dollar_value)} over monitor call
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
