import type { TicketStatus } from "@/lib/api";

const STATUS_STYLE: Record<TicketStatus, { label: string; color: string }> = {
  draft: { label: "Needs review", color: "var(--color-accent)" },
  confirmed: { label: "Confirmed", color: "var(--color-ok)" },
  overridden: { label: "Overridden", color: "var(--color-warn)" },
  disputed: { label: "Disputed", color: "var(--color-danger)" },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color: s.color, backgroundColor: `color-mix(in srgb, ${s.color} 14%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
      {s.label}
    </span>
  );
}

export function AnomalyBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        color: "var(--color-danger)",
        backgroundColor: "color-mix(in srgb, var(--color-danger) 14%, transparent)",
      }}
    >
      {count} flag{count > 1 ? "s" : ""}
    </span>
  );
}
