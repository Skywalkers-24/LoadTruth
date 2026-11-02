"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/shadcn/chart";

/**
 * Dashboard charts built on shadcn's ChartContainer (which wraps Recharts and
 * applies our CSS-variable theme). Each chart animates on first render and uses
 * the --chart-1..5 tokens so colors are consistent across light and dark.
 */

export interface Datum {
  label: string;
  value: number;
  /** Pre-formatted string for the tooltip/label, e.g. "$1,402.38". */
  display?: string;
  /** Optional explicit series color (CSS value). Defaults to --chart-1. */
  color?: string;
}

export interface TrendPoint {
  label: string;
  value: number;
  display?: string;
}

export interface MultiTrendPoint {
  label: string;
  [key: string]: string | number;
}

/** Multi-series cumulative chart for ticket workflow and anomaly trends. */
export function MultiLineTrend({
  data,
  config,
  height = 260,
}: {
  data: MultiTrendPoint[];
  config: ChartConfig;
  height?: number | string;
}) {
  const keys = Object.keys(config);
  return (
    <ChartContainer config={config} className="h-full w-full" style={{ height }}>
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          fontSize={11}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} fontSize={11} />
        <ChartTooltip
          cursor={{ strokeDasharray: "4 4" }}
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="font-mono font-medium tabular-nums">{value}</span>
              )}
            />
          }
        />
        {keys.map((key) => (
          <Line
            key={key}
            dataKey={key}
            name={String(config[key]?.label ?? key)}
            type="monotone"
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive
            animationDuration={700}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

/** Smooth gradient area chart for a cumulative running total. */
export function AreaTrend({
  data,
  config,
  height = 260,
  formatTick,
}: {
  data: TrendPoint[];
  config: ChartConfig;
  height?: number | string;
  formatTick?: (v: number) => string;
}) {
  const key = Object.keys(config)[0] ?? "value";
  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full" style={{ height }}>
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="lt-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`var(--color-${key})`} stopOpacity={0.35} />
            <stop offset="100%" stopColor={`var(--color-${key})`} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          fontSize={11}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          fontSize={11}
          tickFormatter={formatTick ? (v) => formatTick(Number(v)) : undefined}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: "4 4" }}
          content={
            <ChartTooltipContent
              formatter={(_v, _n, item) => (
                <span className="font-mono font-medium tabular-nums">
                  {(item?.payload as TrendPoint)?.display ?? item?.value}
                </span>
              )}
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke={`var(--color-${key})`}
          strokeWidth={2}
          fill="url(#lt-area)"
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-out"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/** Donut with a centered total. Colors come from each datum's `color`. */
export function DonutChart({
  data,
  config,
  centerValue,
  centerLabel,
  height = 240,
}: {
  data: Datum[];
  config: ChartConfig;
  centerValue: string;
  centerLabel?: string;
  height?: number;
}) {
  return (
    <ChartContainer config={config} className="mx-auto w-full" style={{ height }}>
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, name) => (
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-mono font-medium tabular-nums">{value}</span>
                </span>
              )}
            />
          }
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="62%"
          outerRadius="92%"
          paddingAngle={2}
          strokeWidth={2}
          isAnimationActive
          animationDuration={800}
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.color ?? `var(--chart-${(i % 5) + 1})`}
              stroke="var(--color-card)"
            />
          ))}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              const { cx, cy } = viewBox as { cx: number; cy: number };
              return (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={cx} y={cy} className="fill-foreground text-2xl font-bold tabular-nums">
                    {centerValue}
                  </tspan>
                  {centerLabel && (
                    <tspan x={cx} y={cy + 20} className="fill-muted-foreground text-xs">
                      {centerLabel}
                    </tspan>
                  )}
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

/** Horizontal ranked bars with value labels. Used for exposure by class, etc. */
export function RankedBars({
  data,
  config,
  height,
  valueColor = "var(--chart-3)",
}: {
  data: Datum[];
  config: ChartConfig;
  height?: number;
  valueColor?: string;
}) {
  const h = height ?? Math.max(120, data.length * 44 + 16);
  return (
    <ChartContainer config={config} className="w-full" style={{ height: h }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 56, top: 4, bottom: 4 }}>
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={110}
          fontSize={12}
          tick={{ fill: "var(--color-foreground)" }}
        />
        <XAxis type="number" hide />
        <Bar
          dataKey="value"
          radius={[4, 4, 4, 4]}
          fill={valueColor}
          isAnimationActive
          animationDuration={700}
          barSize={16}
        >
          <LabelList dataKey="display" position="right" className="fill-foreground" fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
