"use client";

import { useMemo } from "react";
import { CircleDollarSignIcon, ClockIcon, LayersIcon, ReceiptIcon } from "lucide-react";

import type { BillingSummary } from "@/lib/api";
import { AreaTrend, RankedBars, type Datum, type TrendPoint } from "@/components/ui/charts-v2";
import type { ChartConfig } from "@/components/ui/shadcn/chart";
import { Card } from "@/components/ui/shadcn/card";
import { StatCard } from "@/components/ui/stat-card";
import { CountUp } from "@/components/ui/motion";
import { cubicYards, debrisLabel, money } from "@/lib/format";

const amountConfig: ChartConfig = { value: { label: "Billed", color: "var(--chart-2)" } };
const classConfig: ChartConfig = { value: { label: "Billed", color: "var(--chart-2)" } };

/** "2026-03" -> "Mar 2026". Falls back to the raw key if it can't parse. */
function monthLabel(period: string): string {
  const [y, m] = period.split("-").map((n) => Number.parseInt(n, 10));
  if (!y || !m) return period;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Billing: the money a county owes the contractor. Headline totals, a billed
 * amount history chart, a breakdown by debris class, and the invoice line items.
 */
export function BillingPanel({ b }: { b: BillingSummary }) {
  const total = Number.parseFloat(b.total_amount);
  const settled = Number.parseFloat(b.settled_amount);
  const pending = Number.parseFloat(b.pending_amount);
  const settledShare = total > 0 ? settled / total : 0;

  const history = useMemo<TrendPoint[]>(
    () =>
      b.history.map((p) => ({
        label: monthLabel(p.period),
        value: Math.round(Number.parseFloat(p.amount) * 100) / 100,
        display: money(p.amount),
      })),
    [b.history],
  );

  const byClass = useMemo<Datum[]>(
    () =>
      b.lines.map((line) => ({
        label: debrisLabel(line.debris_class),
        value: Math.round(Number.parseFloat(line.amount) * 100) / 100,
        display: money(line.amount),
      })),
    [b.lines],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hero
          tone="money"
          icon={<CircleDollarSignIcon className="size-4" />}
          label="Amount due"
          value={<CountUp value={total} format={(n) => money(n)} />}
          hint="Total the county owes the contractor across these loads, billed on credited volume at the contracted rate per debris class."
          sub={`${b.ticket_count} loads · ${cubicYards(b.total_cubic_yards)}`}
        />
        <StatCard
          tone="ok"
          icon={<ReceiptIcon className="size-4" />}
          label="Settled"
          value={<CountUp value={settled} format={(n) => money(n)} />}
          progress={settledShare}
          hint="Amount from loads a monitor has confirmed or overridden. These are final."
          sub={`${b.billed_count} reviewed loads`}
        />
        <StatCard
          icon={<ClockIcon className="size-4" />}
          label="Pending review"
          value={<CountUp value={pending} format={(n) => money(n)} />}
          hint="Expected amount from loads still awaiting a monitor's call. Finalizes once reviewed."
          sub={`${b.pending_count} loads awaiting review`}
        />
        <StatCard
          icon={<LayersIcon className="size-4" />}
          label="Credited volume"
          value={
            <CountUp value={Number.parseFloat(b.total_cubic_yards)} format={(n) => cubicYards(n)} />
          }
          hint="Total credited cubic yards billed across every load."
          sub={`${b.lines.length} debris classes`}
        />
      </div>

      <div className="grid min-h-0 gap-4 xl:grid-cols-3">
        <Card className="gap-0 py-0 xl:col-span-2">
          <div className="flex items-baseline justify-between px-4 pt-3">
            <h3 className="lt-card-title">Billed amount by month</h3>
            <span className="text-[11px] text-muted-foreground">County payable over time</span>
          </div>
          <div className="px-2 pb-3 pt-2" style={{ height: 240 }}>
            {history.length > 1 ? (
              <AreaTrend
                data={history}
                config={amountConfig}
                height="100%"
                formatTick={(n) => money(n)}
              />
            ) : history.length === 1 ? (
              <SingleMonth point={history[0]!} />
            ) : (
              <div className="grid h-full place-items-center text-[12px] text-muted-foreground">
                No billed loads in this period yet.
              </div>
            )}
          </div>
        </Card>
        <Card className="gap-0 py-0">
          <div className="flex items-baseline justify-between px-4 pt-3">
            <h3 className="lt-card-title">By debris class</h3>
          </div>
          <div className="px-2 pb-4 pt-2">
            {byClass.length > 0 ? (
              <RankedBars data={byClass} config={classConfig} valueColor="var(--chart-2)" />
            ) : (
              <div className="grid h-[120px] place-items-center text-[12px] text-muted-foreground">
                No line items yet.
              </div>
            )}
          </div>
        </Card>
      </div>

      <InvoiceLines b={b} />
    </div>
  );
}

/** Billing started this period, so there is a single month to show. One bar
 * reads clearly where an area trend cannot draw a line from a single point. */
function SingleMonth({ point }: { point: TrendPoint }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <div className="text-[13px] text-muted-foreground">{point.label}</div>
      <div className="h-24 w-16 rounded-t-md bg-[var(--chart-2)]" aria-hidden />
      <div className="text-[22px] font-bold tabular-nums text-[var(--color-money)]">
        {point.display ?? money(point.value)}
      </div>
      <div className="text-[12px] text-muted-foreground">
        Billing started this period. A trend appears as more months are invoiced.
      </div>
    </div>
  );
}

function InvoiceLines({ b }: { b: BillingSummary }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex flex-col">
          <h3 className="text-[14px] font-semibold">Invoice line items</h3>
          <span className="text-[12px] text-muted-foreground">
            {b.scope}
            {b.location ? ` · ${b.location}` : ""}
          </span>
        </div>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {b.lines.length} line items
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left font-semibold">Debris class</th>
              <th className="px-4 py-2.5 text-right font-semibold">Loads</th>
              <th className="px-4 py-2.5 text-right font-semibold">Cubic yards</th>
              <th className="px-4 py-2.5 text-right font-semibold">Rate / CY</th>
              <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {b.lines.map((line) => (
              <tr key={line.debris_class} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium">{debrisLabel(line.debris_class)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {line.ticket_count}
                </td>
                <td className="px-4 py-2.5 text-right">{cubicYards(line.cubic_yards)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">
                  {money(line.rate_per_cy)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground/80">
              <td className="px-4 py-3 font-semibold">Total</td>
              <td className="px-4 py-3 text-right font-semibold">{b.ticket_count}</td>
              <td className="px-4 py-3 text-right font-semibold">
                {cubicYards(b.total_cubic_yards)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right text-[15px] font-bold text-[var(--color-money)]">
                {money(b.total_amount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
