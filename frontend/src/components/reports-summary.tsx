"use client";

import type { ReportsSummary } from "@/lib/api";
import { debrisLabel, money } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  draft: "Needs review",
  confirmed: "Confirmed",
  overridden: "Overridden",
  disputed: "Disputed",
};

const SEVERITY_COLOR: Record<string, string> = {
  info: "var(--color-muted)",
  warn: "var(--color-warn)",
  high: "var(--color-danger)",
};

/** Reports-page roll-up: headline money, status/debris/anomaly breakdowns. */
export function ReportsSummaryPanel({ s }: { s: ReportsSummary }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Disputed volume flagged"
          value={money(s.overbill_dollar_value)}
          sub={`${s.overbill_ticket_count} over-called ticket${s.overbill_ticket_count === 1 ? "" : "s"}`}
          accent="var(--color-accent)"
          emphasize
        />
        <Stat
          label="Total estimated value"
          value={money(s.total_est_dollar_value)}
          sub="across all tickets"
        />
        <Stat
          label="Reviewed"
          value={`${s.reviewed_count} / ${s.ticket_count}`}
          sub={`${s.pending_count} pending`}
        />
        <Stat
          label="Fill-% accuracy"
          value={
            s.accuracy_within_10pct === null ? "—" : `${Math.round(s.accuracy_within_10pct * 100)}%`
          }
          sub={s.accuracy_within_10pct === null ? "no benchmark" : "within ±10% of human"}
          accent={s.accuracy_within_10pct !== null ? "var(--color-ok)" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown
          title="By status"
          rows={Object.entries(s.counts_by_status).map(([k, v]) => ({
            label: STATUS_LABEL[k] ?? k,
            value: v,
          }))}
        />
        <Breakdown
          title="By debris class"
          rows={Object.entries(s.counts_by_debris_class).map(([k, v]) => ({
            label: debrisLabel(k),
            value: v,
          }))}
        />
        <Breakdown
          title="Anomalies by severity"
          rows={Object.entries(s.anomaly_counts_by_severity).map(([k, v]) => ({
            label: k,
            value: v,
            color: SEVERITY_COLOR[k],
          }))}
        />
      </div>
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

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; color?: string }[];
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="mb-3 text-sm font-medium text-[var(--color-muted)]">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">None.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 capitalize">
                {r.color && (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: r.color }}
                    aria-hidden
                  />
                )}
                {r.label}
              </span>
              <span className="tabular-nums font-medium">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
