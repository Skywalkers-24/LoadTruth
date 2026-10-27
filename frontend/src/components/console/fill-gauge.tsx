/**
 * Compact fill comparison: a 0 to 100% track with the measured fill as an
 * amber bar and the monitor's call as a tick. The hatched gap between them is
 * the over-call. Labels carry the numbers so meaning never relies on color.
 */
export function FillGauge({
  measured,
  monitor,
  className,
  showLabels = true,
}: {
  measured: number;
  monitor: number | null;
  className?: string;
  showLabels?: boolean;
}) {
  const m = clamp(measured);
  const c = monitor === null ? null : clamp(monitor);
  const over = c !== null && c > m;

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]"
        role="img"
        aria-label={`Measured ${Math.round(m)}%${c !== null ? `, monitor called ${Math.round(c)}%` : ""}`}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-money)]" style={{ width: `${m}%` }} />
        {over && (
          <div
            className="absolute inset-y-0"
            style={{
              left: `${m}%`,
              width: `${(c ?? 0) - m}%`,
              background:
                "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-danger) 70%, transparent) 0 2px, transparent 2px 4px)",
            }}
          />
        )}
        {c !== null && (
          <div className="absolute -top-0.5 h-2.5 w-[2px] rounded bg-[var(--color-text)]" style={{ left: `calc(${c}% - 1px)` }} />
        )}
      </div>
      {showLabels && (
        <div className="flex justify-between text-[11px] tabular-nums text-[var(--color-subtle)]">
          <span>
            <span className="font-medium text-[var(--color-money)]">{Math.round(m)}%</span> measured
          </span>
          <span>{c !== null ? <><span className="font-medium text-[var(--color-text)]">{Math.round(c)}%</span> called</> : "No call yet"}</span>
        </div>
      )}
    </div>
  );
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
