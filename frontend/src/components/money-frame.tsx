import type { Valuation } from "@/lib/api";
import { cubicYards, money, percent } from "@/lib/format";

/**
 * The §7a "money frame": the monitor's call vs. LoadTruth's measurement, and the
 * dollar delta between them. Positive delta (monitor over-called) is the money
 * story and is colored as "needs review". This is the demo's defining visual.
 */
export function MoneyFrame({ v }: { v: Valuation }) {
  const hasCall = v.monitor_fill_pct !== null;
  const delta = v.delta_dollar_value;
  const overbill = v.is_overbill;
  const deltaColor = !hasCall
    ? "var(--color-muted)"
    : overbill
      ? "var(--color-accent)"
      : "var(--color-ok)";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Column
          label="Monitor's call"
          fill={v.monitor_fill_pct}
          cy={v.monitor_cubic_yards}
          usd={v.monitor_dollar_value}
          muted={!hasCall}
        />
        <Column
          label="LoadTruth measured"
          fill={v.est_fill_pct}
          cy={v.est_cubic_yards}
          usd={v.est_dollar_value}
        />
      </div>

      <div
        className="flex items-baseline justify-between rounded-lg border px-4 py-3"
        style={{
          borderColor: `color-mix(in srgb, ${deltaColor} 40%, var(--color-border))`,
          backgroundColor: `color-mix(in srgb, ${deltaColor} 8%, transparent)`,
        }}
      >
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
            {overbill ? "Potential overbilling" : hasCall ? "Agreement" : "Awaiting monitor call"}
          </span>
          <span className="text-xs text-[var(--color-muted)]">
            {hasCall ? `${cubicYards(v.delta_cubic_yards)} difference` : "Enter a call to compare"}
          </span>
        </div>
        <span className="text-2xl font-semibold tabular-nums" style={{ color: deltaColor }}>
          {hasCall ? money(delta) : "—"}
        </span>
      </div>
    </div>
  );
}

function Column({
  label,
  fill,
  cy,
  usd,
  muted = false,
}: {
  label: string;
  fill: string | null;
  cy: string | null;
  usd: string | null;
  muted?: boolean;
}) {
  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5"
      style={muted ? { opacity: 0.55 } : undefined}
    >
      <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{percent(fill)}</div>
      <div className="text-xs text-[var(--color-muted)] tabular-nums">
        {cubicYards(cy)} · {money(usd)}
      </div>
    </div>
  );
}
