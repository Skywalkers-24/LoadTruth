"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  CircleCheckIcon,
  CircleDollarSignIcon,
  GaugeIcon,
  LayersIcon,
} from "lucide-react";

import type { Dashboard, ReportsSummary, Ticket } from "@/lib/api";
import { AreaTrend, type TrendPoint } from "@/components/ui/charts-v2";
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
  const exposure =
    Number.parseFloat(summary?.overbill_dollar_value ?? d.total_delta_dollar_value) || 0;
  const measuredValue = summary ? Number.parseFloat(summary.total_est_dollar_value) : null;

  const ordered = [...tickets].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));

  const trend: TrendPoint[] = (() => {
    let running = 0;
    return ordered.map((t, i) => {
      if (t.valuation.is_overbill)
        running += Number.parseFloat(t.valuation.delta_dollar_value ?? "0");
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

      {/* KPIs — compact. items-stretch + h-full so all four cards match height. */}
      <Stagger className="grid grid-rows-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem className="h-full">
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
        <StaggerItem className="h-full">
          <StatCard
            icon={<LayersIcon className="size-4" />}
            label="Measured value"
            value={
              measuredValue === null ? (
                "N/A"
              ) : (
                <CountUp value={measuredValue} format={(n) => money(n)} />
              )
            }
            trend={measuredSpark}
            hint="Total dollar value of every load as measured by LoadTruth."
            sub={`${d.ticket_count} tickets in this event`}
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            tone="ok"
            icon={<CircleCheckIcon className="size-4" />}
            label="Review progress"
            value={
              <span>
                {d.reviewed_count}
                <span className="text-[16px] font-semibold text-muted-foreground">
                  {" "}
                  / {d.ticket_count}
                </span>
              </span>
            }
            progress={reviewPct}
            trend={reviewedSpark}
            hint="Tickets with a confirmed or overridden decision."
            sub={`${needsReview} awaiting a decision`}
          />
        </StaggerItem>
        <StaggerItem className="h-full">
          <StatCard
            tone="primary"
            icon={<GaugeIcon className="size-4" />}
            label="Agreement with monitor"
            value={
              d.accuracy_within_10pct === null ? (
                "N/A"
              ) : (
                <CountUp
                  value={d.accuracy_within_10pct * 100}
                  format={(n) => `${Math.round(n)}%`}
                />
              )
            }
            progress={d.accuracy_within_10pct ?? undefined}
            hint="Share of reviewed tickets where the measured fill lands within 10 percentage points of the monitor's call. This is agreement with the human reviewer, not benchmark accuracy against a known volume."
            sub="Within 10 points of the monitor"
          />
        </StaggerItem>
      </Stagger>

      {/* Charts + queue — grows to fill the remaining height */}
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-3">
        {/* Left: exposure trend on top, breakdowns below */}
        <FadeIn className="flex min-h-0 flex-col gap-3 xl:col-span-2" delay={0.05}>
          <Card className="flex min-h-0 flex-[3] flex-col gap-0 overflow-hidden py-0">
            <div className="flex items-baseline justify-between px-4 pt-3">
              <h3 className="text-[13px] font-semibold">Flagged exposure, running total</h3>
              <span className="text-[11px] text-muted-foreground">
                Cumulative over-call value by capture order
              </span>
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

          {/* Breakdown row: decision review, debris classes, anomaly severity */}
          <div className="grid shrink-0 gap-3 sm:grid-cols-3">
            <BreakdownCard
              title="Review decisions"
              rows={statusBreakdown(summary)}
              empty="No tickets yet"
            />
            <BreakdownCard
              title="Debris classes"
              rows={debrisBreakdown(summary)}
              empty="No tickets yet"
            />
            <BreakdownCard
              title="Anomaly flags"
              rows={anomalyBreakdown(summary, d.anomaly_count)}
              empty="No flags raised"
            />
          </div>
        </FadeIn>

        <FadeIn className="min-h-0" delay={0.1}>
          <Card className="flex h-full flex-col gap-0 overflow-hidden py-0">
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
              <h3 className="text-[13px] font-semibold">Highest value to review</h3>
              <Link
                href="/console"
                className="text-[12px] font-medium text-[var(--color-brand)] hover:underline"
              >
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

interface BreakdownRow {
  label: string;
  count: number;
  color: string;
}

const DEBRIS_LABEL: Record<string, string> = {
  vegetative: "Vegetative",
  construction_demolition: "C&D",
  white_goods: "White goods",
  hazardous: "Hazardous",
  other: "Other",
};

const DEBRIS_COLOR: Record<string, string> = {
  vegetative: "var(--chart-2)",
  construction_demolition: "var(--chart-1)",
  white_goods: "var(--chart-4)",
  hazardous: "var(--chart-5)",
  other: "var(--chart-3)",
};

const SEVERITY_META: { key: string; label: string; color: string }[] = [
  { key: "high", label: "High", color: "var(--color-destructive)" },
  { key: "warn", label: "Warn", color: "var(--color-warn)" },
  { key: "info", label: "Info", color: "var(--color-info)" },
];

function statusBreakdown(summary: ReportsSummary | undefined): BreakdownRow[] {
  if (!summary) return [];
  return (["draft", "confirmed", "overridden", "disputed"] as const)
    .map((k) => ({
      label: statusLabel(k),
      count: summary.counts_by_status[k] ?? 0,
      color: STATUS_COLOR[k] ?? "var(--chart-3)",
    }))
    .filter((r) => r.count > 0);
}

function debrisBreakdown(summary: ReportsSummary | undefined): BreakdownRow[] {
  if (!summary) return [];
  return Object.entries(summary.counts_by_debris_class)
    .map(([k, count]) => ({
      label: DEBRIS_LABEL[k] ?? k,
      count,
      color: DEBRIS_COLOR[k] ?? "var(--chart-3)",
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

function anomalyBreakdown(summary: ReportsSummary | undefined, total: number): BreakdownRow[] {
  const counts = summary?.anomaly_counts_by_severity ?? {};
  const rows = SEVERITY_META.map((s) => ({
    label: s.label,
    count: counts[s.key] ?? 0,
    color: s.color,
  })).filter((r) => r.count > 0);
  if (rows.length === 0 && total > 0)
    return [{ label: "Flags", count: total, color: "var(--color-warn)" }];
  return rows;
}

/** A compact labeled breakdown with proportional bars, from real event data. */
function BreakdownCard({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: BreakdownRow[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="flex flex-col gap-2 p-3">
      <h4 className="text-[12px] font-semibold text-muted-foreground">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground opacity-70">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-[11px] text-foreground">{r.label}</span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(r.count / max) * 100}%`, backgroundColor: r.color }}
                />
              </span>
              <span className="w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
                {r.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
