"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, CircleDollarSignIcon, GaugeIcon, LayersIcon } from "lucide-react";

import type { ReportsSummary, Ticket, TicketSort } from "@/lib/api";
import { useTickets } from "@/lib/hooks";
import { DonutChart, MultiLineTrend, RankedBars, type Datum } from "@/components/ui/charts-v2";
import {
  TICKET_TREND_CONFIG,
  TicketTrendLegend,
  ticketTrend,
} from "@/components/overview/ticket-trend";
import type { ChartConfig } from "@/components/ui/shadcn/chart";
import { Card } from "@/components/ui/shadcn/card";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { CountUp } from "@/components/ui/motion";
import { shortId } from "@/components/console/ticket-metadata";
import { Pagination } from "@/components/pagination";
import {
  cubicYards,
  dateTime,
  debrisLabel,
  money,
  percent,
  signedMoney,
  statusLabel,
} from "@/lib/format";

const LEDGER_PAGE_SIZE = 20;

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
  draft: { label: "Flagged for review", color: "var(--chart-1)" },
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
  ledgerEventId,
}: {
  s: ReportsSummary;
  tickets: Ticket[];
  perEvent?: PerEvent[];
  /**
   * Event the ledger pages against on the server (undefined = all tenant
   * tickets, for the admin "All events" view). The charts above still use the
   * `tickets` snapshot; only the ledger table is server-paged.
   */
  ledgerEventId?: string;
}) {
  const measured = Number.parseFloat(s.total_est_dollar_value);
  const flagged = Number.parseFloat(s.overbill_dollar_value);
  const exposureRate = measured > 0 ? flagged / measured : 0;
  const disputed = s.counts_by_status.disputed ?? 0;
  const trend = useMemo(() => ticketTrend(tickets), [tickets]);

  const byClass = useMemo<Datum[]>(() => {
    const sums = new Map<string, number>();
    for (const t of tickets) {
      if (!t.valuation.is_overbill) continue;
      const k = t.debris_class;
      sums.set(k, (sums.get(k) ?? 0) + Number.parseFloat(t.valuation.delta_dollar_value ?? "0"));
    }
    return [...sums.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({
        label: debrisLabel(k),
        value: Math.round(v * 100) / 100,
        display: money(v),
      }));
  }, [tickets]);

  const statusRows: Datum[] = (["draft", "confirmed", "overridden", "disputed"] as const)
    .filter((k) => (s.counts_by_status[k] ?? 0) > 0)
    .map((k) => ({
      label: statusLabel(k),
      value: s.counts_by_status[k] ?? 0,
      color: STATUS_COLOR[k],
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hero
          compact
          tone="money"
          icon={<CircleDollarSignIcon className="size-4" />}
          label="Amount to review"
          value={<CountUp value={flagged} format={(n) => money(n)} />}
          hint="Sum of dollar differences where the inspector's estimate is higher than the video estimate."
          sub={`${s.overbill_ticket_count} tickets with a higher inspector estimate`}
        />
        <StatCard
          compact
          tone="money"
          icon={<GaugeIcon className="size-4" />}
          label="Share to review"
          value={<CountUp value={exposureRate * 100} format={(n) => `${n.toFixed(1)}%`} />}
          progress={exposureRate}
          hint="Amount to review as a share of the total estimated value."
          sub={`Of ${money(measured)} estimated`}
        />
        <StatCard
          compact
          icon={<LayersIcon className="size-4" />}
          label="Estimated value"
          value={<CountUp value={measured} format={(n) => money(n)} />}
          hint="Total estimated value, based on video fill estimates, registered truck capacity, and event prices."
          sub={`${s.ticket_count} tickets · ${s.counts_by_status.draft ?? 0} awaiting review`}
        />
        <StatCard
          compact
          tone={disputed > 0 ? "default" : "default"}
          icon={<AlertTriangleIcon className="size-4" />}
          label="Disputed"
          value={String(disputed)}
          hint="Tickets flagged for resolution with the contractor."
          sub="Open disputes"
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3">
          <h3 className="text-[13px] font-semibold">Ticket activity over time</h3>
          <span className="text-[11px] text-muted-foreground">
            Cumulative tickets by upload order · hover for counts
          </span>
        </div>
        <div className="h-[240px] px-2 pt-1">
          <MultiLineTrend data={trend} config={TICKET_TREND_CONFIG} height="100%" />
        </div>
        <TicketTrendLegend />
      </Card>

      <div className="grid min-h-0 gap-4 xl:grid-cols-3">
        <Card className="gap-0 py-0 xl:col-span-2">
          <div className="flex items-baseline justify-between px-4 pt-3">
            <h3 className="text-[13px] font-semibold">
              {perEvent ? "Events compared" : "Amount to review by material type"}
            </h3>
            <span className="text-[11px] text-muted-foreground">
              {perEvent
                ? "Estimated value and amount to review per event"
                : "Materials with higher inspector estimates"}
            </span>
          </div>
          <div className="px-2 pb-3 pt-1">
            {perEvent ? (
              <PerEventTable rows={perEvent} />
            ) : (
              <RankedBars data={byClass} config={classConfig} />
            )}
          </div>
        </Card>
        <Card className="gap-0 py-0">
          <div className="flex items-baseline justify-between px-4 pt-3">
            <h3 className="text-[13px] font-semibold">Ticket status breakdown</h3>
          </div>
          <div className="px-2 pb-4">
            <DonutChart
              data={statusRows}
              config={statusConfig}
              centerValue={String(s.ticket_count)}
              centerLabel="tickets"
              height={200}
            />
            <ul className="mt-1 flex flex-col gap-1.5 px-2">
              {statusRows.map((row) => (
                <li key={row.label} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="size-2.5 rounded-[3px]"
                    style={{ background: row.color }}
                    aria-hidden
                  />
                  <span className="flex-1 text-muted-foreground">{row.label}</span>
                  <span className="font-semibold tabular-nums">{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Ledger eventId={ledgerEventId} total={s.ticket_count} />
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
            <th className="px-3 py-2 text-right font-semibold">Estimated value</th>
            <th className="px-3 py-2 text-right font-semibold">Flagged</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-3 py-2.5 font-medium">{r.name}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{r.ticketCount}</td>
              <td className="px-3 py-2.5 text-right">{money(r.measured)}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-[var(--color-money)]">
                {money(r.flagged)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SortCol = TicketSort;

/**
 * The ticket ledger. Sorting and paging happen on the server: the component
 * holds only the current page and the chosen sort, and asks the backend for the
 * matching window. ``total`` (from the reports summary) is used until the first
 * page lands so the count and page controls don't flicker.
 */
function Ledger({ eventId, total: totalHint }: { eventId?: string; total: number }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "delta", dir: -1 });
  const [offset, setOffset] = useState(0);

  const query = useTickets({
    eventId,
    // No event id = the whole tenant (admin "All events" view); allow that by
    // not gating on an event. The hook otherwise disables when eventId is unset,
    // so pass a sentinel the backend treats as "all".
    limit: LEDGER_PAGE_SIZE,
    offset,
    sort: sort.col,
    order: sort.dir === 1 ? "asc" : "desc",
    allTenant: eventId === undefined,
  });

  const pageRows = query.data?.items ?? [];
  const total = query.data?.total ?? totalHint;

  function sortBy(col: SortCol) {
    setOffset(0);
    setSort((st) => ({ col, dir: st.col === col ? ((st.dir * -1) as 1 | -1) : -1 }));
  }

  function header(col: SortCol, label: string, align: "left" | "right" = "right") {
    const active = sort.col === col;
    return (
      <th className={`px-4 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => sortBy(col)}
          className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground ${active ? "text-foreground" : ""}`}
          aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
        >
          {label}
          <span aria-hidden className="text-[10px]">
            {active ? (sort.dir === 1 ? "▲" : "▼") : ""}
          </span>
        </button>
      </th>
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex flex-col">
          <h3 className="text-[14px] font-semibold">Ticket ledger</h3>
          <span className="text-[12px] text-muted-foreground">
            Select a row to open the ticket.
          </span>
        </div>
        <span className="text-[12px] tabular-nums text-muted-foreground">{total} tickets</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted text-[11px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider">
                Ticket
              </th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider">
                Truck
              </th>
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider">
                Debris
              </th>
              {header("measured", "Estimated value")}
              <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider">
                Called
              </th>
              {header("value", "Value")}
              {header("delta", "Delta")}
              <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider">
                Status
              </th>
              {header("created", "Captured", "left")}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {pageRows.map((t) => {
              const v = t.valuation;
              const d = Number.parseFloat(v.delta_dollar_value ?? "0");
              return (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/console?ticket=${t.id}`)}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-accent"
                >
                  <td className="px-4 py-2.5 font-semibold">{shortId(t.id)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {t.truck_id ?? "Unidentified"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {debrisLabel(t.debris_class)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--color-money)]">
                    {percent(v.est_fill_pct)}{" "}
                    <span className="text-muted-foreground">· {cubicYards(v.est_cubic_yards)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {v.monitor_fill_pct ? percent(v.monitor_fill_pct) : "Not called"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {Number.parseFloat(v.certified_cubic_yards) > 0
                      ? money(v.est_dollar_value)
                      : "Unavailable"}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right font-semibold"
                    style={{
                      color:
                        v.delta_dollar_value === null
                          ? "var(--muted-foreground)"
                          : d > 0.005
                            ? "var(--color-money)"
                            : "var(--color-ok)",
                    }}
                  >
                    {v.delta_dollar_value === null
                      ? "Not called"
                      : signedMoney(v.delta_dollar_value)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                    {dateTime(t.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {total > LEDGER_PAGE_SIZE && (
        <div className="border-t border-border px-4 py-2.5">
          <Pagination total={total} limit={LEDGER_PAGE_SIZE} offset={offset} onOffset={setOffset} />
        </div>
      )}
    </Card>
  );
}
