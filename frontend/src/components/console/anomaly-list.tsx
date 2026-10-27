import type { Ticket } from "@/lib/api";
import { SeverityBadge } from "@/components/ui/badge";
import { CheckCircleIcon } from "@/components/ui/icons";
import { deriveAnomalies } from "@/lib/anomalies";

/** Anomaly flags for the selected ticket, most severe first. */
export function AnomalyList({ ticket }: { ticket: Ticket }) {
  const order = { high: 0, warn: 1, info: 2 } as const;
  const anomalies = deriveAnomalies(ticket).sort((a, b) => order[a.severity] - order[b.severity]);

  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-[var(--color-ok-soft)] px-3 py-2.5 text-[13px] text-[var(--color-text)]">
        <span className="text-[var(--color-ok)]">
          <CheckCircleIcon size={16} />
        </span>
        No anomaly flags on this ticket.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {anomalies.map((a) => {
        const color =
          a.severity === "high" ? "var(--color-danger)" : a.severity === "warn" ? "var(--color-warn)" : "var(--color-info)";
        return (
          <li
            key={a.key}
            className="relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2.5 pl-4 pr-3"
          >
            <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: color }} aria-hidden />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-[var(--color-text)]">{a.title}</span>
              <SeverityBadge severity={a.severity} />
            </div>
            <p className="mt-1 text-[12px] leading-snug text-[var(--color-muted-foreground)]">{a.explanation}</p>
          </li>
        );
      })}
    </ul>
  );
}
