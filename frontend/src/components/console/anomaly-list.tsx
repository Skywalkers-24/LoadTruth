import type { AnomalyItem, Ticket } from "@/lib/api";
import { SeverityBadge, type Severity } from "@/components/ui/badge";
import { CheckCircleIcon } from "@/components/ui/icons";
import { deriveAnomalies } from "@/lib/anomalies";

const ORDER = { high: 0, warn: 1, info: 2 } as const;

const TYPE_TITLE: Record<string, string> = {
  uncertified_truck: "Uncertified truck",
  identity_unreadable: "Unreadable placard",
  capacity_exceeded: "Capacity exceeded",
  impossible_cycle: "Impossible cycle time",
  duplicate_truck: "Duplicate truck",
  surface_depth_mismatch: "Surface high, depth low",
  low_confidence: "Low confidence",
};

function titleFor(type: string): string {
  return TYPE_TITLE[type] ?? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

interface Flag {
  key: string;
  title: string;
  severity: Severity;
  explanation: string;
}

/**
 * Anomaly flags for the selected ticket, most severe first. Prefers the itemized
 * list the API returns (with Muse Spark narratives); falls back to flags derived
 * from the ticket fields when the itemized list is absent (e.g. list views).
 */
export function AnomalyList({ ticket }: { ticket: Ticket }) {
  const itemized: AnomalyItem[] | undefined = ticket.anomalies;
  const flags: Flag[] =
    itemized && itemized.length > 0
      ? itemized.map((a, i) => ({
          key: `${a.type}-${i}`,
          title: titleFor(a.type),
          severity: a.severity,
          explanation: a.explanation,
        }))
      : deriveAnomalies(ticket).map((a) => ({
          key: a.key,
          title: a.title,
          severity: a.severity,
          explanation: a.explanation,
        }));

  flags.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  if (flags.length === 0) {
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
      {flags.map((a) => {
        const color =
          a.severity === "high"
            ? "var(--color-destructive)"
            : a.severity === "warn"
              ? "var(--color-warn)"
              : "var(--color-info)";
        return (
          <li
            key={a.key}
            className="relative overflow-hidden rounded-lg border border-border bg-[var(--color-surface-2)] py-2 pl-4 pr-3"
          >
            <span
              className="absolute inset-y-0 left-0 w-[3px]"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-foreground">{a.title}</span>
              <SeverityBadge severity={a.severity} />
            </div>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{a.explanation}</p>
          </li>
        );
      })}
    </ul>
  );
}
