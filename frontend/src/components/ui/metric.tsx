import type { ReactNode } from "react";

import { InfoIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * A single KPI. `hero` makes it the dominant figure. `hint` adds an info
 * tooltip with the metric's definition. `progress` (0 to 1) renders a thin
 * completion bar under the value.
 */
export function Metric({
  label,
  value,
  sub,
  hint,
  tone,
  hero = false,
  icon,
  progress,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hint?: string;
  tone?: "accent" | "money" | "ok" | "warn" | "danger";
  hero?: boolean;
  icon?: ReactNode;
  progress?: number;
}) {
  const color = tone ? `var(--color-${tone})` : undefined;
  return (
    <div
      className="lt-card-shadow relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-[var(--color-surface)] p-4"
      style={{
        borderColor: hero && color ? `color-mix(in srgb, ${color} 45%, var(--color-border))` : "var(--color-border)",
        ...(hero && color
          ? {
              background: `linear-gradient(160deg, color-mix(in srgb, ${color} 12%, var(--color-surface)), var(--color-surface) 65%)`,
            }
          : {}),
      }}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-[var(--color-muted-foreground)]">{label}</span>
          {hint && (
            <Tooltip content={hint}>
              <span className="text-[var(--color-subtle)] hover:text-[var(--color-text)]" tabIndex={0} aria-label={hint}>
                <InfoIcon size={13} />
              </span>
            </Tooltip>
          )}
        </span>
        {icon && (
          <span
            className="grid size-7 place-items-center rounded-md"
            style={{
              color: color ?? "var(--color-subtle)",
              backgroundColor: color ? `color-mix(in srgb, ${color} 12%, transparent)` : "var(--color-surface-2)",
            }}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={`font-bold tracking-tight tabular-nums leading-none ${hero ? "text-[32px]" : "text-[26px]"}`}
        style={{ color: hero && color ? color : "var(--color-text)" }}
      >
        {value}
      </div>
      {progress !== undefined && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]" aria-hidden>
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`, backgroundColor: color ?? "var(--color-accent)" }}
          />
        </div>
      )}
      {sub && <div className="text-[12px] text-[var(--color-subtle)]">{sub}</div>}
    </div>
  );
}
