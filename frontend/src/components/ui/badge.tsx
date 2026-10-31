import type { ReactNode } from "react";

import type { TicketStatus } from "@/lib/api";
import { CheckCircleIcon, AlertIcon, InfoIcon } from "@/components/ui/icons";
import { statusLabel } from "@/lib/format";

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info" | "violet";

const TONE: Record<Tone, { fg: string; soft: string }> = {
  neutral: { fg: "var(--color-muted-foreground)", soft: "var(--color-secondary)" },
  accent: { fg: "var(--color-brand)", soft: "var(--color-brand-soft)" },
  ok: { fg: "var(--color-ok)", soft: "var(--color-ok-soft)" },
  warn: { fg: "var(--color-warn)", soft: "var(--color-warn-soft)" },
  danger: { fg: "var(--color-destructive)", soft: "var(--color-danger-soft)" },
  info: { fg: "var(--color-info)", soft: "var(--color-brand-soft)" },
  violet: { fg: "#7c3aed", soft: "#ede9fe" },
};

/** Generic pill badge. Status is always reinforced with text (+ optional icon). */
export function Badge({
  tone = "neutral",
  children,
  icon,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${className ?? ""}`}
      style={{
        color: t.fg,
        backgroundColor: t.soft,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.fg} 22%, transparent)`,
      }}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<TicketStatus, Tone> = {
  draft: "accent",
  confirmed: "ok",
  overridden: "warn",
  disputed: "danger",
};

/** Ticket-status badge. Color + label + a small shape marker (never color-only). */
export function StatusBadge({ status, compact = false }: { status: TicketStatus; compact?: boolean }) {
  const tone = STATUS_TONE[status];
  const label = status === "draft" && compact ? "Review" : statusLabel(status);
  return (
    <Badge tone={tone} icon={<Dot tone={tone} />} className={compact ? "px-1.5 text-[10px]" : undefined}>
      <span aria-label={statusLabel(status)} title={statusLabel(status)}>{label}</span>
    </Badge>
  );
}

export type Severity = "info" | "warn" | "high";

const SEVERITY_TONE: Record<Severity, Tone> = {
  info: "info",
  warn: "warn",
  high: "danger",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  warn: "Warn",
  high: "High",
};

/** Anomaly-severity badge with a distinct icon per level (shape, not just color). */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const tone = SEVERITY_TONE[severity];
  const icon =
    severity === "high" ? (
      <AlertIcon size={12} />
    ) : severity === "warn" ? (
      <AlertIcon size={12} />
    ) : (
      <InfoIcon size={12} />
    );
  return (
    <Badge tone={tone} icon={icon}>
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}

/** Flag-count badge used in the queue; hidden when zero. */
export function AnomalyBadge({ count }: { count: number }) {
  if (count <= 0) {
    return (
      <Badge tone="ok" icon={<CheckCircleIcon size={12} />}>
        No flags
      </Badge>
    );
  }
  return (
    <Badge tone="danger" icon={<AlertIcon size={12} />}>
      {count} flag{count > 1 ? "s" : ""}
    </Badge>
  );
}

function Dot({ tone }: { tone: Tone }) {
  return (
    <span
      className="size-1.5 rounded-full"
      style={{ backgroundColor: TONE[tone].fg }}
      aria-hidden
    />
  );
}
