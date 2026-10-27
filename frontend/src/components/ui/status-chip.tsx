import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "brand";

const TONE: Record<Tone, { dot: string; text: string; bg: string }> = {
  ok: { dot: "bg-[var(--color-ok)]", text: "text-[var(--color-ok)]", bg: "bg-[var(--color-ok-soft)]" },
  warn: { dot: "bg-[var(--color-warn)]", text: "text-[var(--color-warn)]", bg: "bg-[var(--color-warn-soft)]" },
  danger: { dot: "bg-[var(--color-destructive)]", text: "text-[var(--color-destructive)]", bg: "bg-[var(--color-danger-soft)]" },
  info: { dot: "bg-[var(--color-info)]", text: "text-[var(--color-info)]", bg: "bg-[var(--color-brand-soft)]" },
  brand: { dot: "bg-[var(--color-brand)]", text: "text-[var(--color-brand)]", bg: "bg-[var(--color-brand-soft)]" },
  neutral: { dot: "bg-[var(--color-subtle)]", text: "text-muted-foreground", bg: "bg-secondary" },
};

/**
 * A compact status chip with a leading colored dot, matching the look used by
 * modern operations dashboards. `pulse` adds a soft live-pulse to the dot.
 */
export function StatusChip({
  tone = "neutral",
  pulse = false,
  children,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        t.bg,
        t.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", t.dot, pulse && "lt-pulse")} aria-hidden />
      {children}
    </span>
  );
}
