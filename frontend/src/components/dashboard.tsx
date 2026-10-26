"use client";

import type { Dashboard } from "@/lib/api";
import { cubicYards, money } from "@/lib/format";

/**
 * County dashboard roll-up (PLAN.md §3.4). Headline is the summed dollar-delta
 * — the money frame at event scale — plus review progress, anomalies, and the
 * accuracy signal from the benchmark.
 */
export function DashboardPanel({ d }: { d: Dashboard }) {
  const reviewPct = d.ticket_count > 0 ? Math.round((d.reviewed_count / d.ticket_count) * 100) : 0;
  const accuracy = d.accuracy_within_10pct;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Disputed volume flagged"
        value={money(d.total_delta_dollar_value)}
        sub={`${cubicYards(d.total_delta_cubic_yards)} across ${d.overbill_ticket_count} ticket${d.overbill_ticket_count === 1 ? "" : "s"}`}
        accent="var(--color-accent)"
        emphasize
      />
      <Stat
        label="Tickets reviewed"
        value={`${d.reviewed_count} / ${d.ticket_count}`}
        sub={`${reviewPct}% of the event`}
      />
      <Stat
        label="Anomaly flags"
        value={String(d.anomaly_count)}
        sub="across all tickets"
        accent={d.anomaly_count > 0 ? "var(--color-danger)" : undefined}
      />
      <Stat
        label="Fill-% accuracy"
        value={accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`}
        sub={accuracy === null ? "no benchmark yet" : "within ±10% of human"}
        accent={accuracy !== null ? "var(--color-ok)" : undefined}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  emphasize = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className="rounded-xl border bg-[var(--color-surface)] p-4"
      style={{
        borderColor:
          emphasize && accent
            ? `color-mix(in srgb, ${accent} 40%, var(--color-border))`
            : "var(--color-border)",
      }}
    >
      <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
      <div
        className={`mt-1 font-semibold tabular-nums ${emphasize ? "text-3xl" : "text-2xl"}`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</div>
    </div>
  );
}
