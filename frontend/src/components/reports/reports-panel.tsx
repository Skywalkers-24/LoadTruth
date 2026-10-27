"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, CircleDollarSignIcon, GaugeIcon, LayersIcon } from "lucide-react";

import type { ReportsSummary, Ticket } from "@/lib/api";
import { DonutChart, RankedBars, type Datum } from "@/components/ui/charts-v2";
import type { ChartConfig } from "@/components/ui/shadcn/chart";
import { Card } from "@/components/ui/shadcn/card";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { CountUp } from "@/components/ui/motion";
import { shortId } from "@/components/console/ticket-metadata";
import { cubicYards, dateTime, debrisLabel, money, percent, signedMoney, statusLabel } from "@/lib/format";

export interface PerEvent {
  id: string;
  name: string;
  ticketCount: number;
  measured: string;
  flagged: string;
}

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--chart-1)",
  confirmed: "var(--chart-2)",
  overridden: "var(--chart-3)",
  disputed: "var(--chart-5)",
};

const classConfig: ChartConfig = { value: { label: "Flagged", color: "var(--chart-3)" } };
const statusConfig: ChartConfig = {
  draft: { label: "Needs review", color: "var(--chart-1)" },
  confirmed: { label: "Confirmed", color: "var(--chart-2)" },
  overridden: { label: "Overridden", color: "var(--chart-3)" },
  disputed: { label: "Disputed", color: "var(--chart-5)" },
};

/**
 * Reports: the analytical view. Event totals, where the exposure comes from, a
 * status breakdown, and a sortable ticket ledger. When `perEvent` is given
 * (admin "All events" mode) a per-event comparison replaces the single-event
 * debris breakdown.
 */
export function ReportsPanel({
  s,
  tickets,
  perEvent,
}: {
  s: ReportsSummary;
  tickets: Ticket[];
  perEvent?: PerEvent[];
}) {
  const measured = Number.parseFloat(s.total_est_dollar_value);
  const flagged = Number.parseFloat(s.overbill_dollar_value);
  const exposureRate = measured > 0 ? flagged / measured : 0;
  const disputed = s.counts_by_status.disputed ?? 0;

  const byClass = useMemo<Datum[]>(() => {
    const sums = new Map<string, number>();
    for (const t of tickets) {
      if (!t.valuation.is_overbill) continue;
      const k = t.debris_class;
      sums.set(k, (sums.get(k) ?? 0) + Number.parseFloat(t.valuation.delta_dollar_value ?? "0"));
    }
    return [...sums.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: debrisLabel(k), value: Math.round(v * 100) / 100, display: money(v) }));
  }, [tickets]);

  const statusRows: Datum[] = (["draft", "confirmed", "overridden", "disputed"] as const)
    .filter((k) => (s.counts_by_status[k] ?? 0) > 0)
    .map((k) => ({ label: statusLabel(k), value: s.counts_by_status[k] ?? 0, color: STATUS_COLOR[k] }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hero
          tone="money"
          icon={<CircleDollarSignIcon className="size-4" />}
          label="Flagged exposure"
          value={<CountUp value={flagged} format={(n) => money(n)} />}
          hint="Sum of dollar deltas on tickets where the monitor called the load higher than measured."
          sub={`${s.overbill_ticket_count} over-called tickets`}
        />
        <StatCard
          tone="money"
          icon={<GaugeIcon className="size-4" />}
          label="Exposure rate"
          value={<CountUp value={exposureRate * 100} format={(n) => `${n.toFixed(1)}%`} />}
          progress={exposureRate}
          hint="Flagged exposure as a share of the total measured value."
          sub={`Of ${money(measured)} measured`}
        />
        <StatCard
          icon={<LayersIcon className="size-4" />}
          label="Measured value"
          value={<CountUp value={measured} format={(n) => money(n)} />}
          hint="Total dollar value of every load as measured by LoadTruth."
          sub={`${s.ticket_count} tickets · ${s.counts_by_status.draft ?? 0} awaiting review`}
        />
        <StatCard
          tone={disputed > 0 ? "default" : "default"}
          icon={<AlertTriangleIcon className="size-4" />}
          label="Disputed"
          value={String(disputed)}
          hint="Tickets flagged for resolution with the contractor."
          sub="Open disputes"
        />
      </div>

      <div className="grid min-h-0 gap-4 xl:grid-cols-3">
        <Card className="gap-0 py-0 xl:col-span-2">
          <div className="flex items-baseline justify-between px-4 pt-3">
            <h3 className="text-[13px] font-semibold">
              {perEvent ? "Events compared" : "Flagged exposure by debris class"}
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {perEvent ? "Measured value and flagged exposure per event" : "Where the over-call dollars come from"}
            </span>
          </div>
          <div className="px-2 pb-3 pt-1">
            {perEvent ? <PerEventTable rows={perEvent} /> : <RankedBars data={byClass} config={classConfig} />}
          </div>
        </Card>
        <Card className="gap-0 py-0">
          <div className="flex items-baseline justify-between px-4 pt-3">
            <h3 className="text-[13px] font-semibold">Status mix</h3>
          </div>
          <div className="px-2 pb-4">
            <DonutChart data={statusRows} config={statusConfig} centerValue={String(s.ticket_count)} centerLabel="tickets" height={200} />
            <ul className="mt-1 flex flex-col gap-1.5 px-2">
              {statusRows.map((row) => (
                <li key={row.label} className="flex items-center gap-2 text-[12px]">
                  <span className="size-2.5 rounded-[3px]" style={{ background: row.color }} aria-hidden />
                  <span className="flex-1 text-muted-foreground">{row.label}</span>
                  <span className="font-semibold tabular-nums">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Ledger tickets={tickets} />
    </div>
  );
}

function PerEventTable({ rows }: { rows: PerEvent[] }) {
  return (
    <div className="overflow-hidden rounded-lg">
      <table className="w-full text-[13px]">
        <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Event</th>
            <th className="px-3 py-2 text-right font-semibold">Tickets</th>
            <th className="px-3 py-2 text-right font-semibold">Measured</th>
            <th className="px-3 py-2 text-right font-semibold">Flagged</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-2.5 font-medium">{r.name}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{r.ticketCount}</td>
              <td className="px-3 py-2.5 text-right">{money(r.measured)}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-[var(--color-money)]">{money(r.flagged)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SortCol = "created" | "delta" | "measured" | "value";

function Ledger({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "delta", dir: -1 });

  const rows = useMemo(() => {
    // Returns the sort value, or null for "no value" rows (e.g. uncalled
    // tickets have no delta). Null rows are always pushed to the end,
    // independent of sort direction, so they don't masquerade as extreme values.
    const key = (t: Ticket): number | null => {
      switch (sort.col) {
        case "created":
          return +new Date(t.created_at);
        case "delta":
          return t.valuation.delta_dollar_value === null
            ? null
            : Number.parseFloat(t.valuation.delta_dollar_value);
        case "measured":
          // The "Measured" column shows volume (cubic yards); sort by it.
          return Number.parseFloat(t.valuation.est_cubic_yards);
        case "value":
          return Number.parseFloat(t.valuation.est_dollar_value);
      }
    };
    return [...tickets].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1; // a sinks to the end
      if (kb === null) return -1; // b sinks to the end
      return (ka - kb) * sort.dir;
    });
  }, [tickets, sort]);

  function header(col: SortCol, label: string, align: "left" | "right" = "right") {
    const active = sort.col === col;
    return (
      <th className={`px-4 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => setSort((st) => ({ col, dir: st.col === col ? ((st.dir * -1) as 1 | -1) : -1 }))}
          className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground ${active ? "text-foreground" : ""}`}
          aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
        >
          {label}
          <span aria-hidden className="text-[10px]">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex flex-col">
          <h3 className="text-[14px] font-semibold">Ticket ledger</h3>
          <span className="text-[12px] text-muted-foreground">Select a row to open the ticket.</span>
        </div>
        <span className="text-[12px] tabular-nums text-muted-foreground">{tickets.length} tickets</span>
      </header>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted text-[11px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider">Ticket</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider">Truck</th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider">Debris</th>
              {header("measured", "Measured")}
              <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider">Called</th>
              {header("value", "Value")}
              {header("delta", "Delta")}
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider">Status</th>
              {header("created", "Captured", "left")}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((t) => {
              const v = t.valuation;
              const d = Number.parseFloat(v.delta_dollar_value ?? "0");
              return (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/console?ticket=${t.id}`)}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-accent"
                >
                  <td className="px-4 py-2.5 font-semibold">{shortId(t.id)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{t.truck_id ?? "Unidentified"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{debrisLabel(t.debris_class)}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-money)]">
                    {percent(v.est_fill_pct)} <span className="text-muted-foreground">· {cubicYards(v.est_cubic_yards)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{v.monitor_fill_pct ? percent(v.monitor_fill_pct) : "Not called"}</td>
                  <td className="px-4 py-2.5 text-right">{money(v.est_dollar_value)}</td>
                  <td
                    className="px-4 py-2.5 text-right font-semibold"
                    style={{ color: v.delta_dollar_value === null ? "var(--muted-foreground)" : d > 0.005 ? "var(--color-money)" : "var(--color-ok)" }}
                  >
                    {v.delta_dollar_value === null ? "Not called" : signedMoney(v.delta_dollar_value)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{dateTime(t.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
