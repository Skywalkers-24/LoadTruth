"use client";

import Link from "next/link";
import { ArrowRightIcon, CircleCheckIcon, CircleDollarSignIcon, GaugeIcon, LayersIcon } from "lucide-react";

import type { Dashboard, ReportsSummary, Ticket } from "@/lib/api";
import { AreaTrend, DonutChart, type Datum, type TrendPoint } from "@/components/ui/charts-v2";
import type { ChartConfig } from "@/components/ui/shadcn/chart";
import { Card } from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { Progress } from "@/components/ui/shadcn/progress";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { CountUp, FadeIn, Stagger, StaggerItem } from "@/components/ui/motion";
import { PriorityQueue } from "@/components/overview/priority-queue";
import { money, statusLabel } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--chart-1)",
  confirmed: "var(--chart-2)",
  overridden: "var(--chart-3)",
  disputed: "var(--chart-5)",
};

const statusConfig: ChartConfig = {
  draft: { label: "Needs review", color: "var(--chart-1)" },
  confirmed: { label: "Confirmed", color: "var(--chart-2)" },
  overridden: { label: "Overridden", color: "var(--chart-3)" },
  disputed: { label: "Disputed", color: "var(--chart-5)" },
};

const trendConfig: ChartConfig = {
  value: { label: "Flagged exposure", color: "var(--chart-3)" },
};

/**
 * Overview: the operational view of the active event, sized to fit one desktop
 * screen. Banner and KPIs are fixed height; the charts row grows to fill the
 * rest, with the priority queue scrolling internally if it overflows.
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
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Skeleton className="h-[84px] rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <Card className="p-10 text-center text-[13px] text-muted-foreground">
        The event summary could not be loaded. Refresh to try again.
      </Card>
    );
  }

  const d = dashboard;
  const reviewPct = d.ticket_count > 0 ? d.reviewed_count / d.ticket_count : 0;
  const needsReview = summary?.counts_by_status?.draft ?? d.ticket_count - d.reviewed_count;
  const exposure = Number.parseFloat(summary?.overbill_dollar_value ?? d.total_delta_dollar_value) || 0;
  const measuredValue = summary ? Number.parseFloat(summary.total_est_dollar_value) : null;

  const statusRows: Datum[] = summary
    ? (["draft", "confirmed", "overridden", "disputed"] as const)
        .filter((k) => (summary.counts_by_status[k] ?? 0) > 0)
        .map((k) => ({ label: statusLabel(k), value: summary.counts_by_status[k] ?? 0, color: STATUS_COLOR[k] }))
    : [];

  const ordered = [...tickets].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  const trend: TrendPoint[] = (() => {
    let running = 0;
    return ordered.map((t, i) => {
      if (t.valuation.is_overbill) running += Number.parseFloat(t.valuation.delta_dollar_value ?? "0");
      return { label: `${i + 1}`, value: Math.round(running * 100) / 100, display: money(running) };
    });
  })();

  // Small sparkline series for the KPI cards, derived from real ticket order.
  const exposureSpark = trend.map((p) => p.value);
  const measuredSpark = (() => {
    let run = 0;
    return ordered.map((t) => (run += Number.parseFloat(t.valuation.est_dollar_value ?? "0")));
  })();
  const reviewedSpark = (() => {
    let run = 0;
    return ordered.map((t) => (run += t.status === "draft" ? 0 : 1));
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Action banner — compact */}
      <FadeIn>
        <Card className="relative gap-0 overflow-hidden border-[var(--color-brand)]/30 p-4">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "linear-gradient(120deg, color-mix(in srgb, var(--color-brand) 14%, transparent) 0%, transparent 55%, color-mix(in srgb, var(--color-money) 12%, transparent) 100%)",
            }}
          />
          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-brand)]">
                {needsReview > 0 ? "Action needed" : "All caught up"}
              </span>
              <h2 className="text-[19px] font-semibold leading-tight tracking-tight">
                {needsReview > 0 ? (
                  <>
                    {needsReview} ticket{needsReview === 1 ? "" : "s"} awaiting review with{" "}
                    <span className="text-[var(--color-money)]">{money(exposure)}</span> flagged
                  </>
                ) : (
                  "Every ticket in this event has a decision"
                )}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <div className="hidden items-center gap-2 sm:flex">
                <Progress value={Math.round(reviewPct * 100)} className="h-2 w-28" />
                <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">
                  {Math.round(reviewPct * 100)}%
                </span>
              </div>
              {needsReview > 0 && (
                <Button asChild size="sm" className="group">
                  <Link href="/console">
                    Start reviewing
                    <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </Card>
      </FadeIn>

      {/* KPIs — compact */}
      <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard
            hero
            tone="money"
            icon={<CircleDollarSignIcon className="size-4" />}
            label="Flagged exposure"
            value={<CountUp value={exposure} format={(n) => money(n)} />}
            trend={exposureSpark}
            hint="Sum of dollar deltas on tickets where the monitor called the load higher than measured. Estimated, pending review."
            sub={`Across ${d.overbill_ticket_count} over-called ticket${d.overbill_ticket_count === 1 ? "" : "s"}`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            icon={<LayersIcon className="size-4" />}
            label="Measured value"
            value={measuredValue === null ? "N/A" : <CountUp value={measuredValue} format={(n) => money(n)} />}
            trend={measuredSpark}
            hint="Total dollar value of every load as measured by LoadTruth."
            sub={`${d.ticket_count} tickets in this event`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            tone="ok"
            icon={<CircleCheckIcon className="size-4" />}
            label="Review progress"
            value={
              <span>
                {d.reviewed_count}
                <span className="text-[16px] font-semibold text-muted-foreground"> / {d.ticket_count}</span>
              </span>
            }
            progress={reviewPct}
            trend={reviewedSpark}
            hint="Tickets with a confirmed or overridden decision."
            sub={`${needsReview} awaiting a decision`}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            tone="primary"
            icon={<GaugeIcon className="size-4" />}
            label="Fill accuracy"
            value={
              d.accuracy_within_10pct === null ? "N/A" : (
                <CountUp value={d.accuracy_within_10pct * 100} format={(n) => `${Math.round(n)}%`} />
              )
            }
            progress={d.accuracy_within_10pct ?? undefined}
            hint="Share of tickets where the measured fill is within 10 percentage points of the monitor's call."
            sub="Within 10 points of the monitor"
          />
        </StaggerItem>
      </Stagger>

      {/* Charts + queue — grows to fill the remaining height */}
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-3">
        <FadeIn className="min-h-0 xl:col-span-2" delay={0.05}>
          <Card className="flex h-full flex-col gap-0 overflow-hidden py-0">
            <div className="flex items-baseline justify-between px-4 pt-3">
              <h3 className="text-[13px] font-semibold">Flagged exposure, running total</h3>
              <span className="text-[11px] text-muted-foreground">Cumulative over-call value by capture order</span>
            </div>
            <div className="min-h-0 flex-1 px-2 pb-3">
              <AreaTrend
                data={trend}
                config={trendConfig}
                height="100%"
                formatTick={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`)}
              />
            </div>
          </Card>
        </FadeIn>

        <FadeIn className="min-h-0" delay={0.1}>
          <Card className="flex h-full flex-col gap-0 overflow-hidden py-0">
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
              <h3 className="text-[13px] font-semibold">Highest value to review</h3>
              <Link href="/console" className="text-[12px] font-medium text-[var(--color-brand)] hover:underline">
                View all
              </Link>
            </div>
            <div className="lt-scroll lt-fab-safe min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              <PriorityQueue tickets={tickets} isLoading={isLoading} bare />
            </div>
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
