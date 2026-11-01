"use client";

import { useQuery } from "@tanstack/react-query";
import { CpuIcon, DatabaseZapIcon, GaugeIcon } from "lucide-react";

import { getPipelineStats } from "@/lib/api";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { StatusChip } from "@/components/ui/status-chip";

const STAGE_LABEL: Record<string, string> = {
  sam_track: "SAM track",
  spark_ocr: "Spark OCR",
  spark_classify: "Spark classify",
  geometry: "Fill estimation",
  capacity: "Capacity",
  anomalies: "Anomalies",
  dollar_math: "Rate valuation",
};

/**
 * AI pipeline insight (PLAN.md §1a): model status, per-stage run counts, cache
 * hit rate, and spend against the budget cap. Reads the live cost ledger.
 */
export function PipelineStats() {
  const q = useQuery({
    queryKey: ["pipeline-stats"],
    queryFn: getPipelineStats,
    refetchInterval: 15_000,
  });

  if (q.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (q.isError || !q.data) {
    return (
      <p className="text-[13px] text-muted-foreground">Pipeline stats are unavailable right now.</p>
    );
  }
  const s = q.data;
  const cacheRate = Math.round(s.cache_hit_rate * 100);
  const stages = Object.entries(s.per_stage).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        LoadTruth uses AI to outline trucks and loads, read truck numbers, estimate fill, and
        identify materials. This page shows recent analyses and their usage.
      </p>

      {/* Model status */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile
          icon={<CpuIcon className="size-4" />}
          label="Vision model"
          value={s.sam_model}
          sub="Truck and load outlines"
        />
        <Tile
          icon={<CpuIcon className="size-4" />}
          label="Reasoning model"
          value={s.spark_model}
          sub="Truck number, material, and review flags"
        />
      </div>

      {/* Run + cache + spend */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          icon={<GaugeIcon className="size-4" />}
          label="AI Pipeline runs"
          value={String(s.total_runs)}
          sub={`${s.cache_hits} served from cache`}
        />
        <Tile
          icon={<DatabaseZapIcon className="size-4" />}
          label="Cache hit rate"
          value={`${cacheRate}%`}
          sub="Repeat clips cost nothing"
        />
        <Tile
          icon={<GaugeIcon className="size-4" />}
          label="Spend"
          value={`$${s.spent_usd.toFixed(2)}`}
          sub={`of $${s.hard_cap_usd.toFixed(0)} cap`}
        />
      </div>

      {/* Mode */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-muted-foreground">Model source:</span>
        <StatusChip tone={s.mode === "live" ? "ok" : "info"}>
          {s.mode === "live" ? "Live model APIs" : "Fixtures (zero-cost demo)"}
        </StatusChip>
      </div>

      {/* Per-stage */}
      {stages.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Stage</th>
                <th className="px-3 py-2 text-right font-semibold">Runs</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {stages.map(([stage, count]) => (
                <tr key={stage} className="border-t border-border">
                  <td className="px-3 py-2">{STAGE_LABEL[stage] ?? stage}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          {icon}
        </span>
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="mt-2 text-[18px] font-bold tabular-nums">{value}</div>
      <div className="text-[12px] text-muted-foreground">{sub}</div>
    </div>
  );
}
