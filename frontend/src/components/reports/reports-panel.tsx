"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ReportsSummary, Ticket } from "@/lib/api";
import { ChartCard, type ChartDatum, DonutChart, RankedBars } from "@/components/ui/charts";
import { StatusBadge } from "@/components/ui/badge";
import { Metric } from "@/components/ui/metric";
import { AlertIcon, DollarIcon, GaugeIcon, LayersIcon } from "@/components/ui/icons";
import { shortId } from "@/components/console/ticket-metadata";
import { cubicYards, dateTime, debrisLabel, money, percent, signedMoney, statusLabel } from "@/lib/format";

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--color-accent)",
  confirmed: "var(--color-ok)",
  overridden: "var(--color-warn)",
  disputed: "var(--color-danger)",
};

/**
 * Reports: the analytical view. Event totals, where the exposure comes from,
 * and a full ticket ledger that can be sorted and exported.
 */
export function ReportsPanel({ s, tickets }: { s: ReportsSummary; tickets: Ticket[] }) {
  const measured = Number.parseFloat(s.total_est_dollar_value);
  const flagged = Number.parseFloat(s.overbill_dollar_value);
  const exposureRate = measured > 0 ? flagged / measured : 0;
  const disputed = s.counts_by_status.disputed ?? 0;

  // Flagged dollars by debris class, computed from the ticket list.
  const byClass = useMemo<ChartDatum[]>(() => {
    const sums = new Map<string, number>();
    for (const t of tickets) {
      if (!t.valuation.is_overbill) continue;
      const k = t.debris_class;
      sums.set(k, (sums.get(k) ?? 0) + Number.parseFloat(t.valuation.delta_dollar_value ?? "0"));
    }
    return [...sums.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: debrisLabel(k), value: Math.round(v * 100) / 100, display: money(v), color: "var(--color-money)" }));
  }, [tickets]);

  const statusRows: ChartDatum[] = (["draft", "confirmed", "overridden", "disputed"] as const)
    .filter((k) => (s.counts_by_status[k] ?? 0) > 0)
    .map((k) => ({ label: statusLabel(k), value: s.counts_by_status[k] ?? 0, color: STATUS_COLOR[k] }));

  const severityRows: ChartDatum[] = (["high", "warn", "info"] as const)
    .filter((k) => (s.anomaly_counts_by_severity[k] ?? 0) > 0)
    .map((k) => ({
      label: k === "high" ? "High" : k === "warn" ? "Warning" : "Info",
      value: s.anomaly_counts_by_severity[k] ?? 0,
      color: k === "high" ? "var(--color-danger)" : k === "warn" ? "var(--color-warn)" : "var(--color-info)",
    }));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          hero
          tone="money"
          icon={<DollarIcon size={15} />}
          label="Flagged exposure"
          value={money(s.overbill_dollar_value)}
          hint="Sum of dollar deltas on tickets where the monitor called the load higher than measured."
          sub={`${s.overbill_ticket_count} over-called tickets`}
        />
        <Metric
          tone="warn"
          icon={<GaugeIcon size={15} />}
          label="Exposure rate"
          value={`${(exposureRate * 100).toFixed(1)}%`}
          progress={exposureRate}
          hint="Flagged exposure as a share of the total measured value."
          sub={`Of ${money(measured)} measured`}
        />
        <Metric
          icon={<LayersIcon size={15} />}
          label="Measured value"
          value={money(s.total_est_dollar_value)}
          hint="Total dollar value of every load as measured by LoadTruth."
          sub={`${s.ticket_count} tickets · ${s.counts_by_status.draft ?? 0} awaiting review`}
        />
        <Metric
          tone={disputed > 0 ? "danger" : undefined}
          icon={<AlertIcon size={15} />}
          label="Disputed"
          value={String(disputed)}
          hint="Tickets flagged for resolution with the contractor."
          sub="Open disputes"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Flagged exposure by debris class" caption="Where the over-call dollars come from.">
          <RankedBars data={byClass} />
        </ChartCard>
        <ChartCard title="Status mix" caption="Review state across all tickets.">
          <DonutChart data={statusRows} centerValue={String(s.ticket_count)} centerLabel="tickets" />
        </ChartCard>
        <ChartCard title="Anomaly flags" caption="Prompts for review, by severity.">
          <RankedBars data={severityRows} />
        </ChartCard>
      </div>

      <Ledger tickets={tickets} />
    </div>
  );
}

type SortCol = "created" | "delta" | "measured" | "value";

function Ledger({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "delta", dir: -1 });

  const rows = useMemo(() => {
    const key = (t: Ticket): number => {
      switch (sort.col) {
        case "created":
          return +new Date(t.created_at);
        case "delta":
          return Number.parseFloat(t.valuation.delta_dollar_value ?? "-1e9");
        case "measured":
          return Number.parseFloat(t.valuation.est_fill_pct);
        case "value":
          return Number.parseFloat(t.valuation.est_dollar_value);
      }
    };
    return [...tickets].sort((a, b) => (key(a) - key(b)) * sort.dir);
  }, [tickets, sort]);

  function header(col: SortCol, label: string, align: "left" | "right" = "right") {
    const active = sort.col === col;
    return (
      <th className={`px-4 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ col, dir: s.col === col ? ((s.dir * -1) as 1 | -1) : -1 }))}
          className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--color-text)] ${active ? "text-[var(--color-text)]" : ""}`}
          aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
        >
          {label}
          <span aria-hidden className="text-[10px]">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  }

  return (
    <section className="lt-card-shadow overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex flex-col">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Ticket ledger</h3>
          <span className="text-[12px] text-[var(--color-subtle)]">Every ticket in this event. Select a row to open it.</span>
        </div>
        <span className="text-[12px] tabular-nums text-[var(--color-subtle)]">{tickets.length} tickets</span>
      </header>
      <div className="lt-scroll max-h-[520px] overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)] text-[11px] text-[var(--color-subtle)]">
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
                  className="cursor-pointer border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <td className="px-4 py-2.5 font-semibold text-[var(--color-text)]">{shortId(t.id)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{t.truck_id ?? "Unidentified"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{debrisLabel(t.debris_class)}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-money)]">
                    {percent(v.est_fill_pct)} <span className="text-[var(--color-subtle)]">· {cubicYards(v.est_cubic_yards)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-text)]">{v.monitor_fill_pct ? percent(v.monitor_fill_pct) : "Not called"}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-text)]">{money(v.est_dollar_value)}</td>
                  <td
                    className="px-4 py-2.5 text-right font-semibold"
                    style={{ color: v.delta_dollar_value === null ? "var(--color-subtle)" : d > 0.005 ? "var(--color-money)" : "var(--color-ok)" }}
                  >
                    {v.delta_dollar_value === null ? "Not called" : signedMoney(v.delta_dollar_value)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-[var(--color-subtle)]">{dateTime(t.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
