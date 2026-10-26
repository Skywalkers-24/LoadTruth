import type { Ticket } from "@/lib/api";
import { SeverityBadge } from "@/components/ui/badge";
import { CheckCircleIcon } from "@/components/ui/icons";
import { deriveAnomalies } from "@/lib/anomalies";

/**
 * Actionable anomaly rows derived from real ticket fields. Rows inferred rather
 * than returned itemized by the API are explicitly marked, so nothing is
 * presented as verified backend detail when it is an inference.
 */
export function AnomalyList({ ticket }: { ticket: Ticket }) {
  const anomalies = deriveAnomalies(ticket);

  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-ok-soft)] px-3 py-2.5 text-[13px]">
        <span className="text-[var(--color-ok)]">
          <CheckCircleIcon size={16} />
        </span>
        <span className="text-[var(--color-text)]">No anomaly flags on this ticket.</span>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {anomalies.map((a) => {
        const color =
          a.severity === "high"
            ? "var(--color-danger)"
            : a.severity === "warn"
              ? "var(--color-warn)"
              : "var(--color-info)";
        return (
          <li
            key={a.key}
            className="rounded-md border-l-2 border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5"
            style={{ borderLeftColor: color }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-[var(--color-text)]">{a.title}</span>
              <SeverityBadge severity={a.severity} />
            </div>
            <p className="mt-1 text-[12px] text-[var(--color-muted)]">{a.explanation}</p>
            {!a.itemized && (
              <p className="mt-1 text-[12px] italic text-[var(--color-subtle)]">
                Summary flag. Open the audit packet for the full breakdown.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
