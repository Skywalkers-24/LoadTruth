"use client";

import type { Dashboard, ReportsSummary, Ticket } from "@/lib/api";
import { AreaTrend, ChartCard, ChartDatum, DonutChart, TrendPoint, VBarChart } from "@/components/ui/charts";
import { Metric } from "@/components/ui/metric";
import { CheckCircleIcon, ClipboardIcon, DollarIcon, GaugeIcon } from "@/components/ui/icons";
import { Skeleton, Unavailable } from "@/components/ui/primitives";
import { PriorityQueue } from "@/components/overview/priority-queue";
import { debrisLabel, money, statusLabel } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--color-accent)",
  confirmed: "var(--color-ok)",
  overridden: "var(--color-warn)",
  disputed: "var(--color-danger)",
};

/**
 * The Overview operator dashboard: headline KPIs, status + debris breakdowns,
 * and the priority action queue. Every figure is real backend data (dashboard +
 * reports-summary + tickets). No fabricated trend line or week-over-week deltas
 * — those endpoints don't exist, so we show the breakdowns we can actually back.
 */
export function OverviewDashboard({
  dashboard,
  summary,
  tickets,
  isLoading,
}: {
  dashboard: Dashboard | undefined;
  summary: ReportsSummary | undefined;
  tickets: Ticket[];
  isLoading: boolean;
}) {
  if (isLoading && !dashboard) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 lg:col-span-1" />
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-8 text-center text-[13px] text-[var(--color-muted)]">
        Overview is unavailable — the event roll-up didn’t load.
      </div>
    );
  }

  const d = dashboard;
  const reviewPct = d.ticket_count > 0 ? Math.round((d.reviewed_count / d.ticket_count) * 100) : 0;
  const needsReview = summary?.counts_by_status?.draft ?? d.ticket_count - d.reviewed_count;

  const statusRows: ChartDatum[] = summary
    ? Object.entries(summary.counts_by_status).map(([k, v]) => ({
        label: statusLabel(k),
        value: v,
        color: STATUS_COLOR[k] ?? "var(--color-muted)",
      }))
    : [];

  const debrisRows: ChartDatum[] = summary
    ? Object.entries(summary.counts_by_debris_class).map(([k, v]) => ({
        label: debrisLabel(k),
        value: v,
        color: "var(--color-info)",
      }))
    : [];

  // Cumulative flagged exposure across tickets, ordered oldest→newest. Real,
  // monotonic series (not a fabricated calendar trend).
  const trend: TrendPoint[] = (() => {
    const ordered = [...tickets].sort(
      (a, b) => +new Date(a.created_at) - +new Date(b.created_at),
    );
    let running = 0;
    const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    return ordered.map((t, i) => {
      if (t.valuation.is_overbill) {
        running += Number.parseFloat(t.valuation.delta_dollar_value ?? "0");
      }
      return {
        label: `#${i + 1}`,
        value: Math.round(running * 100) / 100,
        display: usd.format(running),
      };
    });
  })();

  const severityRows: ChartDatum[] = summary
    ? (["high", "warn", "info"] as const)
        .filter((k) => summary.anomaly_counts_by_severity[k] !== undefined)
        .map((k) => ({
          label: k === "high" ? "High" : k === "warn" ? "Warn" : "Info",
          value: summary.anomaly_counts_by_severity[k] ?? 0,
          color:
            k === "high"
              ? "var(--color-danger)"
              : k === "warn"
                ? "var(--color-warn)"
                : "var(--color-info)",
        }))
    : [];



  return (
    <div className="flex flex-col gap-5">
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          hero
          tone="money"
          icon={<DollarIcon size={16} />}
          label="Flagged $ exposure"
          value={money(summary?.overbill_dollar_value ?? d.total_delta_dollar_value)}
          hint="Summed dollar delta on over-called tickets (monitor − measured > 0). Estimated exposure pending review, not confirmed overbilling."
          sub={`${d.overbill_ticket_count} over-called ticket${d.overbill_ticket_count === 1 ? "" : "s"}`}
        />
        <Metric
          icon={<CheckCircleIcon size={16} />}
          label="Tickets reviewed"
          value={
            <span>
              {d.reviewed_count}
              <span className="text-[var(--color-subtle)]"> / {d.ticket_count}</span>
            </span>
          }
          hint="Tickets with a human decision (confirmed or overridden) out of all tickets."
          sub={`${reviewPct}% of the event`}
        />
        <Metric
          icon={<ClipboardIcon size={16} />}
          label="Awaiting review"
          value={String(needsReview)}
          tone={needsReview > 0 ? "accent" : undefined}
          hint="Draft tickets still awaiting a monitor decision."
          sub="action required"
        />
        <Metric
          icon={<GaugeIcon size={16} />}
          label="Fill accuracy"
          value={
            d.accuracy_within_10pct === null ? (
              <Unavailable label="no benchmark" />
            ) : (
              `${Math.round(d.accuracy_within_10pct * 100)}%`
            )
          }
          tone={d.accuracy_within_10pct !== null ? "ok" : undefined}
          hint="Share of tickets where LoadTruth's measured fill is within ±10 pp of the monitor's call."
          sub={d.accuracy_within_10pct === null ? "needs monitor calls" : "within ±10 pp of monitor"}
        />
      </div>

      {/* Cumulative flagged exposure trend */}
      {trend.length > 1 && (
        <ChartCard
          title="Cumulative flagged exposure"
          caption="Running total of over-call dollar deltas across tickets, oldest to newest. Not a calendar trend."
        >
          <AreaTrend
            data={trend}
            tone="money"
            formatTick={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`)}
          />
        </ChartCard>
      )}

      {/* Breakdown charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Ticket status distribution"
          caption="Review state across all tickets in this event."
        >
          <DonutChart
            data={statusRows}
            centerValue={String(d.ticket_count)}
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
      </div>

      {/* Priority queue */}
      <PriorityQueue tickets={tickets} isLoading={isLoading} />
    </div>
  );
}
