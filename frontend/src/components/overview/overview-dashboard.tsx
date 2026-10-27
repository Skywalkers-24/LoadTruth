"use client";

import Link from "next/link";

import type { Dashboard, ReportsSummary, Ticket } from "@/lib/api";
import { AreaTrend, ChartCard, ChartDatum, DonutChart, type TrendPoint } from "@/components/ui/charts";
import { Metric } from "@/components/ui/metric";
import { CheckCircleIcon, ChevronRightIcon, DollarIcon, GaugeIcon, LayersIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton, Unavailable } from "@/components/ui/primitives";
import { PriorityQueue } from "@/components/overview/priority-queue";
import { money, statusLabel } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--color-accent)",
  confirmed: "var(--color-ok)",
  overridden: "var(--color-warn)",
  disputed: "var(--color-danger)",
};

/**
 * Overview: the operational view of the active event. Leads with what needs
 * action now, then the money picture, then where the queue stands.
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
        <Skeleton className="h-[120px] rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-10 text-center text-[13px] text-[var(--color-muted)]">
        The event summary could not be loaded. Refresh to try again.
      </div>
    );
  }

  const d = dashboard;
  const reviewPct = d.ticket_count > 0 ? d.reviewed_count / d.ticket_count : 0;
  const needsReview = summary?.counts_by_status?.draft ?? d.ticket_count - d.reviewed_count;
  const exposure = summary?.overbill_dollar_value ?? d.total_delta_dollar_value;

  const statusRows: ChartDatum[] = summary
    ? (["draft", "confirmed", "overridden", "disputed"] as const)
        .filter((k) => (summary.counts_by_status[k] ?? 0) > 0)
        .map((k) => ({ label: statusLabel(k), value: summary.counts_by_status[k] ?? 0, color: STATUS_COLOR[k] }))
    : [];

  const trend: TrendPoint[] = (() => {
    const ordered = [...tickets].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    let running = 0;
    return ordered.map((t, i) => {
      if (t.valuation.is_overbill) running += Number.parseFloat(t.valuation.delta_dollar_value ?? "0");
      return { label: `${i + 1}`, value: Math.round(running * 100) / 100, display: money(running) };
    });
  })();

  return (
    <div className="flex flex-col gap-5">
      {/* Action banner */}
      <section
        className="lt-card-shadow relative overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] p-5 sm:p-6"
        style={{
          background:
            "linear-gradient(120deg, color-mix(in srgb, var(--color-accent) 14%, var(--color-surface)) 0%, var(--color-surface) 55%, color-mix(in srgb, var(--color-money) 10%, var(--color-surface)) 100%)",
        }}
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
              {needsReview > 0 ? "Action needed" : "All caught up"}
            </span>
            <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-[26px]">
              {needsReview > 0 ? (
                <>
                  {needsReview} ticket{needsReview === 1 ? "" : "s"} awaiting review with{" "}
                  <span className="text-[var(--color-money)]">{money(exposure)}</span> flagged
                </>
              ) : (
                "Every ticket in this event has a decision"
              )}
            </h2>
            <p className="text-[13px] text-[var(--color-muted)]">
              {d.reviewed_count} of {d.ticket_count} reviewed. Highest-value over-calls are listed first.
            </p>
          </div>
          {needsReview > 0 && (
            <Link
              href="/console"
              className="group inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-lg bg-[var(--color-accent-fill)] px-5 text-[14px] font-semibold text-[var(--color-on-accent)] shadow-[0_6px_20px_color-mix(in_srgb,var(--color-accent)_35%,transparent)] transition-all hover:bg-[var(--color-accent)] md:self-center"
            >
              Start reviewing
              <ChevronRightIcon size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
            <div
              className="h-full rounded-full bg-[var(--color-ok)] transition-[width] duration-700"
              style={{ width: `${Math.round(reviewPct * 100)}%` }}
            />
          </div>
          <span className="text-[12px] font-semibold tabular-nums text-[var(--color-muted)]">
            {Math.round(reviewPct * 100)}% reviewed
          </span>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          hero
          tone="money"
          icon={<DollarIcon size={15} />}
          label="Flagged exposure"
          value={money(exposure)}
          hint="Sum of dollar deltas on tickets where the monitor called the load higher than measured. Estimated, pending review."
          sub={`Across ${d.overbill_ticket_count} over-called ticket${d.overbill_ticket_count === 1 ? "" : "s"}`}
        />
        <Metric
          icon={<LayersIcon size={15} />}
          label="Measured value"
          value={summary ? money(summary.total_est_dollar_value) : <Unavailable label="Loading" />}
          hint="Total dollar value of every load as measured by LoadTruth."
          sub={`${d.ticket_count} tickets in this event`}
        />
        <Metric
          tone="ok"
          icon={<CheckCircleIcon size={15} />}
          label="Review progress"
          value={
            <span>
              {d.reviewed_count}
              <span className="text-[18px] font-semibold text-[var(--color-subtle)]"> / {d.ticket_count}</span>
            </span>
          }
          progress={reviewPct}
          hint="Tickets with a confirmed or overridden decision."
          sub={`${needsReview} awaiting a decision`}
        />
        <Metric
          tone="accent"
          icon={<GaugeIcon size={15} />}
          label="Fill accuracy"
          value={
            d.accuracy_within_10pct === null ? <Unavailable label="No benchmark" /> : `${Math.round(d.accuracy_within_10pct * 100)}%`
          }
          progress={d.accuracy_within_10pct ?? undefined}
          hint="Share of tickets where the measured fill is within 10 percentage points of the monitor's call."
          sub="Within 10 points of the monitor"
        />
      </div>

      {/* Money + status */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title="Flagged exposure, running total"
            caption="Cumulative over-call value as tickets were captured."
          >
            <AreaTrend
              data={trend}
              tone="money"
              height={260}
              formatTick={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`)}
            />
          </ChartCard>
        </div>
        <ChartCard title="Queue status" caption="Where every ticket stands.">
          <DonutChart data={statusRows} centerValue={String(d.ticket_count)} centerLabel="tickets" />
        </ChartCard>
      </div>

      <PriorityQueue tickets={tickets} isLoading={isLoading} />

      <p className="hidden items-center justify-center gap-1.5 text-[12px] text-[var(--color-subtle)] lg:flex">
        Press <Kbd>⌘K</Kbd> to jump to any ticket or truck.
      </p>
    </div>
  );
}
