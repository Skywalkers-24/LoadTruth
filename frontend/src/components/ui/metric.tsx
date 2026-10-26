import type { ReactNode } from "react";

import { InfoIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * A single event-roll-up metric. `hero` makes it the dominant figure. `hint`
 * renders an info affordance with a native tooltip so every non-obvious metric
 * carries its own definition.
 */
export function Metric({
  label,
  value,
  sub,
  hint,
  tone,
  hero = false,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hint?: string;
  tone?: "accent" | "money" | "ok" | "warn" | "danger";
  hero?: boolean;
  icon?: ReactNode;
}) {
  const color = tone ? `var(--color-${tone})` : undefined;
  return (
    <div
      className="lt-card-shadow lt-hover flex flex-col justify-between gap-2 rounded-xl border bg-[var(--color-surface)] p-4"
      style={{
        borderColor: hero && color
          ? `color-mix(in srgb, ${color} 55%, var(--color-border))`
          : "var(--color-border)",
        ...(hero && color
          ? {
              background: `linear-gradient(180deg, color-mix(in srgb, ${color} 10%, var(--color-surface)), var(--color-surface) 70%)`,
            }
          : {}),
      }}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
            {label}
          </span>
          {hint && (
            <Tooltip content={hint}>
              <span
                className="text-[var(--color-subtle)] hover:text-[var(--color-text)]"
                tabIndex={0}
                aria-label={hint}
              >
                <InfoIcon size={13} />
              </span>
            </Tooltip>
          )}
        </span>
        {icon && (
          <span style={color ? { color } : { color: "var(--color-subtle)" }}>{icon}</span>
        )}
      </div>
      <div
        className={`font-bold tabular-nums leading-none ${hero ? "text-[34px]" : "text-[22px]"}`}
        style={color ? { color } : { color: "var(--color-text)" }}
      >
        {value}
      </div>
      {sub && <div className="text-[12px] text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}
