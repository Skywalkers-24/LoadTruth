"use client";

import { useState } from "react";

import type { Ticket } from "@/lib/api";
import { AnomalyBadge, StatusBadge } from "@/components/badges";
import { EvidenceCanvas } from "@/components/evidence-canvas";
import { MoneyFrame } from "@/components/money-frame";
import { useSetMonitorCall, useSetStatus } from "@/lib/hooks";
import { debrisLabel } from "@/lib/format";

/**
 * The demo centerpiece (PLAN.md §3.3): evidence canvas on the left, structured
 * fields + the money frame + confirm/override on the right. Responsive: the
 * right rail stacks below the canvas on small screens.
 */
export function ReviewConsole({ ticket }: { ticket: Ticket }) {
  const [call, setCall] = useState(ticket.valuation.monitor_fill_pct ?? "");
  const setMonitorCall = useSetMonitorCall();
  const setStatus = useSetStatus();

  const busy = setMonitorCall.isPending || setStatus.isPending;

  function submitCall(e: React.FormEvent) {
    e.preventDefault();
    const pct = call.trim();
    if (pct === "") return;
    setMonitorCall.mutate({ id: ticket.id, pct });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section className="flex flex-col gap-3">
        <EvidenceCanvas ticket={ticket} />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Truck" value={ticket.truck_id ?? "—"} />
          <Field label="Debris" value={debrisLabel(ticket.debris_class)} />
          <Field label="Certified" value={`${ticket.valuation.certified_cubic_yards} CY`} />
          <Field label="Rate" value={`$${ticket.valuation.rate_per_cy}/CY`} />
        </dl>
      </section>

      <aside className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between">
          <StatusBadge status={ticket.status} />
          <AnomalyBadge count={ticket.anomaly_count} />
        </div>

        <MoneyFrame v={ticket.valuation} />

        <form onSubmit={submitCall} className="flex flex-col gap-2">
          <label htmlFor="monitor-call" className="text-xs text-[var(--color-muted)]">
            Monitor&apos;s fill-% call
          </label>
          <div className="flex gap-2">
            <input
              id="monitor-call"
              type="number"
              min={0}
              max={100}
              step={1}
              inputMode="numeric"
              value={call}
              onChange={(e) => setCall(e.target.value)}
              className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm tabular-nums focus:border-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              placeholder="%"
            />
            <button
              type="submit"
              disabled={busy || call.trim() === ""}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
            >
              Compare
            </button>
          </div>
        </form>

        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus.mutate({ id: ticket.id, status: "confirmed" })}
            className="flex-1 rounded-lg border border-[var(--color-ok)] px-3 py-2 text-sm font-medium text-[var(--color-ok)] disabled:opacity-40"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus.mutate({ id: ticket.id, status: "overridden" })}
            className="flex-1 rounded-lg border border-[var(--color-warn)] px-3 py-2 text-sm font-medium text-[var(--color-warn)] disabled:opacity-40"
          >
            Override
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus.mutate({ id: ticket.id, status: "disputed" })}
            className="flex-1 rounded-lg border border-[var(--color-danger)] px-3 py-2 text-sm font-medium text-[var(--color-danger)] disabled:opacity-40"
          >
            Dispute
          </button>
        </div>

        {ticket.evidence_frames.length > 0 && (
          <div className="text-xs text-[var(--color-muted)]">
            Evidence: {ticket.evidence_frames.join(", ")}
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <dt className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
