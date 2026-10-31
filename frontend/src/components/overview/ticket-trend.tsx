import type { Ticket } from "@/lib/api";
import type { ChartConfig } from "@/components/ui/shadcn/chart";
import type { MultiTrendPoint } from "@/components/ui/charts-v2";

export const TICKET_TREND_CONFIG: ChartConfig = {
  created: { label: "Created", color: "var(--chart-2)" },
  flagged: { label: "Flagged for review", color: "var(--chart-1)" },
  finalized: { label: "Finalized", color: "var(--chart-3)" },
  disputed: { label: "Disputed", color: "var(--chart-5)" },
  anomalies: { label: "Anomaly flags", color: "var(--color-warn)" },
};

/** Cumulative totals in upload order, using each ticket's current status. */
export function ticketTrend(tickets: Ticket[]): MultiTrendPoint[] {
  const ordered = [...tickets].sort(
    (a, b) => +new Date(a.created_at) - +new Date(b.created_at) || a.id.localeCompare(b.id),
  );
  let created = 0;
  let flagged = 0;
  let finalized = 0;
  let disputed = 0;
  let anomalies = 0;

  return ordered.map((ticket, index) => {
    created += 1;
    if (ticket.status === "draft") flagged += 1;
    if (ticket.status === "confirmed" || ticket.status === "overridden") finalized += 1;
    if (ticket.status === "disputed") disputed += 1;
    anomalies += ticket.anomaly_count;
    return {
      label: `${index + 1}`,
      created,
      flagged,
      finalized,
      disputed,
      anomalies,
    };
  });
}

export function TicketTrendLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3" aria-label="Ticket activity chart legend">
      {Object.entries(TICKET_TREND_CONFIG).map(([key, item]) => (
        <li key={key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
