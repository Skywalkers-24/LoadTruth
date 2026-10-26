"use client";

import { useEffect, useMemo, useState } from "react";

import type { EventSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useUpdateEvent } from "@/lib/hooks";
import { debrisLabel } from "@/lib/format";

const CLASSES = ["vegetative", "construction_demolition", "white_goods", "hazardous", "other"];

/**
 * Edit the event's $/CY rate card per debris class. Validates numeric input,
 * tracks unsaved changes, and confirms before applying — because rates affect
 * future calculations. Historical tickets are not retroactively recalculated.
 */
export function RateTableEditor({ event }: { event: EventSummary }) {
  const update = useUpdateEvent();
  const toast = useToast();
  const [rates, setRates] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const c of CLASSES) initial[c] = String(event.rate_table[c] ?? 0);
    setRates(initial);
  }, [event]);

  const dirty = useMemo(
    () => CLASSES.some((c) => String(event.rate_table[c] ?? 0) !== (rates[c] ?? "")),
    [event, rates],
  );

  const invalid = CLASSES.some((c) => {
    const n = Number.parseFloat(rates[c] ?? "");
    return Number.isNaN(n) || n < 0;
  });

  function save() {
    const rate_table: Record<string, number> = {};
    for (const c of CLASSES) {
      const n = Number.parseFloat(rates[c] ?? "0");
      rate_table[c] = Number.isNaN(n) ? 0 : n;
    }
    update.mutate(
      { id: event.id, body: { rate_table } },
      {
        onSuccess: () => {
          toast.push("ok", "Rate table saved. Future tickets use the new rates.");
          setConfirming(false);
        },
        onError: () => {
          toast.push("danger", "Couldn’t save the rate table.");
          setConfirming(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CLASSES.map((c) => (
          <label key={c} className="flex flex-col gap-1 text-[12px] text-[var(--color-muted)]">
            {debrisLabel(c)}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--color-subtle)]">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rates[c] ?? ""}
                onChange={(e) => setRates((p) => ({ ...p, [c]: e.target.value }))}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] tabular-nums text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              />
              <span className="text-[11px] text-[var(--color-subtle)]">/CY</span>
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!dirty || invalid} onClick={() => setConfirming(true)}>
          Save rates
        </Button>
        {dirty && <span className="text-[12px] text-[var(--color-warn)]">Unsaved changes</span>}
        {invalid && (
          <span className="text-[12px] text-[var(--color-danger)]">
            Rates must be non-negative numbers.
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Apply new rates?"
        description="New rates apply to tickets calculated from now on. Existing tickets are not retroactively recalculated."
        confirmLabel="Save rates"
        busy={update.isPending}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
