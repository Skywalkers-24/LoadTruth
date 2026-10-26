"use client";

import type { ReportsSummary } from "@/lib/api";
import { ChartCard, ChartDatum, DonutChart, VBarChart } from "@/components/ui/charts";
import { Metric } from "@/components/ui/metric";
import { Unavailable } from "@/components/ui/primitives";
import { debrisLabel, money, statusLabel } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--color-accent)",
  confirmed: "var(--color-ok)",
  overridden: "var(--color-warn)",
  disputed: "var(--color-danger)",
};

const SEVERITY_COLOR: Record<string, string> = {
  info: "var(--color-info)",
  warn: "var(--color-warn)",
  high: "var(--color-danger)",
};

/**
 * Event-level reporting workspace. Headline KPIs then labelled breakdowns. Each
 * metric clarifies whether it is estimated exposure, measured value, or review
 * state. Charts are simple labelled bars — no decorative donuts.
 */
export function ReportsPanel({ s }: { s: ReportsSummary }) {
  const statusRows: ChartDatum[] = Object.entries(s.counts_by_status).map(([k, v]) => ({
    label: statusLabel(k),
    value: v,
    color: STATUS_COLOR[k] ?? "var(--color-muted)",
  }));

  const debrisRows: ChartDatum[] = Object.entries(s.counts_by_debris_class).map(([k, v]) => ({
    label: debrisLabel(k),
    value: v,
    color: "var(--color-info)",
  }));

  const severityRows: ChartDatum[] = (["high", "warn", "info"] as const)
    .filter((k) => s.anomaly_counts_by_severity[k] !== undefined)
    .map((k) => ({
      label: k === "high" ? "High" : k === "warn" ? "Warn" : "Info",
      value: s.anomaly_counts_by_severity[k] ?? 0,
      color: SEVERITY_COLOR[k],
    }));

  const dollarRows: ChartDatum[] = [
    {
      label: "Flagged exposure",
      value: Number.parseFloat(s.overbill_dollar_value),
      color: "var(--color-money)",
      display: money(s.overbill_dollar_value),
    },
    {
      label: "Total measured",
      value: Number.parseFloat(s.total_est_dollar_value),
      color: "var(--color-info)",
      display: money(s.total_est_dollar_value),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          hero
          tone="money"
          label="Flagged $ exposure"
          value={money(s.overbill_dollar_value)}
          hint="Summed dollar delta on over-called tickets (monitor − measured > 0). Estimated exposure pending review, not confirmed overbilling."
          sub={`${s.overbill_ticket_count} over-called ticket${s.overbill_ticket_count === 1 ? "" : "s"}`}
        />
        <Metric
          label="Total measured value"
          value={money(s.total_est_dollar_value)}
          hint="Sum of LoadTruth's measured dollar value across every ticket."
          sub="across all tickets"
        />
        <Metric
          label="Reviewed vs pending"
          value={
            <span>
              {s.reviewed_count}
              <span className="text-[var(--color-subtle)]"> / {s.ticket_count}</span>
            </span>
          }
          hint="Tickets with a human decision out of all tickets."
          sub={`${s.pending_count} pending`}
        />
        <Metric
          label="Fill accuracy"
          value={
            s.accuracy_within_10pct === null ? (
              <Unavailable label="no benchmark" />
            ) : (
              `${Math.round(s.accuracy_within_10pct * 100)}%`
            )
          }
          tone={s.accuracy_within_10pct !== null ? "ok" : undefined}
          hint="Share of tickets within ±10 percentage points of the monitor's call."
          sub={s.accuracy_within_10pct === null ? "needs monitor calls" : "within ±10 pp of monitor"}
        />
      </div>

      {/* Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Ticket status distribution" caption="Tickets in each review state.">
          <DonutChart
            data={statusRows}
            centerValue={String(s.ticket_count)}
            centerLabel="total tickets"
          />
        </ChartCard>

        <ChartCard
          title="Tickets by debris class"
          caption="Distribution across FEMA debris categories."
        >
          <VBarChart data={debrisRows} />
        </ChartCard>

        <ChartCard
          title="Anomaly flags by severity"
          caption="info < warn < high. Flags are prompts for review, not proof."
        >
          {severityRows.length > 0 ? (
            <VBarChart data={severityRows} />
          ) : (
            <p className="py-10 text-center text-[13px] text-[var(--color-muted)]">
              No anomaly flags.
            </p>
          )}
        </ChartCard>

        <ChartCard title="Reviewed vs pending" caption="Review progress for this event.">
          <DonutChart
            data={[
              { label: "Reviewed", value: s.reviewed_count, color: "var(--color-ok)" },
              { label: "Pending", value: s.pending_count, color: "var(--color-accent)" },
            ]}
            centerValue={`${s.ticket_count > 0 ? Math.round((s.reviewed_count / s.ticket_count) * 100) : 0}%`}
            centerLabel="reviewed"
          />
        </ChartCard>

        <ChartCard
          title="Dollar exposure vs measured"
          caption="Flagged exposure relative to total measured value."
        >
          <VBarChart data={dollarRows} formatTick={(v) => `$${Math.round(v / 1000)}k`} />
        </ChartCard>
      </div>
    </div>
  );
}
