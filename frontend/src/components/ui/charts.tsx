"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useChartColors } from "@/lib/theme-colors";

/** Small labelled card wrapper for a chart section. */
export function ChartCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <div className="lt-card-shadow flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-semibold text-[var(--color-text)]">{title}</h3>
        {caption && <p className="text-[11px] text-[var(--color-subtle)]">{caption}</p>}
      </div>
      {children}
    </div>
  );
}

export interface ChartDatum {
  label: string;
  value: number;
  color?: string;
  /** Pre-formatted display value for tooltips/labels (e.g. "$1,402.38"). */
  display?: string;
}

/** Shared tooltip styled to the LoadTruth surface tokens. */
function useTooltipStyle() {
  const c = useChartColors();
  return {
    contentStyle: {
      backgroundColor: c["--surface"],
      border: `1px solid ${c["--border"]}`,
      borderRadius: 8,
      fontSize: 12,
      color: c["--text"],
      boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
    },
    labelStyle: { color: c["--muted"], fontSize: 11 },
    itemStyle: { color: c["--text"] },
  } as const;
}

/**
 * Donut chart with a centered total. Values are reinforced by a labelled legend
 * (never color-only). Used for ticket-status distribution.
 */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  height = 220,
}: {
  data: ChartDatum[];
  centerValue: string;
  centerLabel: string;
  height?: number;
}) {
  const c = useChartColors();
  const tip = useTooltipStyle();
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke={c["--surface"]}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.label} fill={d.color ?? c["--accent"]} />
              ))}
            </Pie>
            <Tooltip
              {...tip}
              formatter={(v, n) => [String(v), String(n)] as [string, string]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold tabular-nums text-[var(--color-text)]">
            {centerValue}
          </span>
          <span className="text-[11px] text-[var(--color-subtle)]">{centerLabel}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-2 text-[var(--color-muted)]">
              <span
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: d.color ?? c["--accent"] }}
                aria-hidden
              />
              {d.label}
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              <span className="font-semibold text-[var(--color-text)]">
                {d.display ?? d.value}
              </span>
              <span className="text-[var(--color-subtle)]">
                {total > 0 ? `${Math.round((d.value / total) * 100)}%` : "0%"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Vertical bar chart with themed axes and rounded bars. Each bar can carry its
 * own color; the category axis is always labelled.
 */
export function VBarChart({
  data,
  height = 220,
  formatTick,
}: {
  data: ChartDatum[];
  height?: number;
  formatTick?: (v: number) => string;
}) {
  const c = useChartColors();
  const tip = useTooltipStyle();

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
          <XAxis
            dataKey="label"
            stroke={c["--subtle"]}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: c["--border"] }}
            interval={0}
          />
          <YAxis
            stroke={c["--subtle"]}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={formatTick}
            allowDecimals={false}
          />
          <Tooltip
            {...tip}
            cursor={{ fill: c["--surface-2"] }}
            formatter={(v, _n, item) => {
              const d = (item?.payload as ChartDatum | undefined)?.display;
              return [d ?? String(v), ""] as [string, string];
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={56}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color ?? c["--accent"]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface TrendPoint {
  label: string;
  value: number;
  display?: string;
}

/**
 * Smooth gradient area chart for a running trend. Used for cumulative flagged
 * exposure across tickets (ordered by creation) — a real, monotonic series, not
 * a fabricated daily trend. `tone` picks the stroke/fill color token.
 */
export function AreaTrend({
  data,
  height = 240,
  tone = "money",
  formatTick,
}: {
  data: TrendPoint[];
  height?: number;
  tone?: "money" | "accent" | "info";
  formatTick?: (v: number) => string;
}) {
  const c = useChartColors();
  const tip = useTooltipStyle();
  const stroke =
    tone === "money" ? c["--money"] : tone === "info" ? c["--info"] : c["--accent"];
  const gradId = `lt-area-${tone}`;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={c["--border"]} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={c["--subtle"]}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke={c["--subtle"]}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={formatTick}
          />
          <Tooltip
            {...tip}
            formatter={(v, _n, item) => {
              const d = (item?.payload as TrendPoint | undefined)?.display;
              return [d ?? String(v), ""] as [string, string];
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2.5}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, fill: stroke, stroke: c["--surface"], strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
