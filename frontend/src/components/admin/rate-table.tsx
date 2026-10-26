"use client";

import { useEffect, useState } from "react";

import type { EventSummary } from "@/lib/api";
import { useUpdateEvent } from "@/lib/hooks";
import { debrisLabel } from "@/lib/format";

const CLASSES = ["vegetative", "construction_demolition", "white_goods", "hazardous", "other"];

/** Edit the event's $/CY rate card per debris class. */
export function RateTableEditor({ event }: { event: EventSummary }) {
  const update = useUpdateEvent();
  const [rates, setRates] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const c of CLASSES) initial[c] = String(event.rate_table[c] ?? 0);
    setRates(initial);
  }, [event]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const rate_table: Record<string, number> = {};
    for (const c of CLASSES) {
      const n = Number.parseFloat(rates[c] ?? "0");
      rate_table[c] = Number.isNaN(n) ? 0 : n;
    }
    update.mutate(
      { id: event.id, body: { rate_table } },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-4 text-sm font-semibold">Rate table ($/CY by debris class)</h2>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CLASSES.map((c) => (
            <label key={c} className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
              {debrisLabel(c)}
              <div className="flex items-center gap-1">
                <span className="text-[var(--color-muted)]">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rates[c] ?? ""}
                  onChange={(e) => setRates((p) => ({ ...p, [c]: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm tabular-nums text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending}
            className="w-fit rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
          >
            Save rates
          </button>
          {saved && <span className="text-xs text-[var(--color-ok)]">Saved.</span>}
        </div>
      </form>
    </section>
  );
}
