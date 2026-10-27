import type { Valuation } from "@/lib/api";
import { InfoIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { cubicYards, money, percent, signedCubicYards, signedMoney, signedPoints } from "@/lib/format";

/**
 * The money frame: what the monitor claimed, what LoadTruth measured, and what
 * the difference is worth. Reconciliation table on the left, the dollar delta
 * as the hero on the right (stacked on small screens).
 *
 * Convention: delta = monitor value minus measured value. Positive means the
 * monitor called the load higher than measured.
 */
export function MoneyFrame({ v, reviewed = false }: { v: Valuation; reviewed?: boolean }) {
  const hasCall = v.monitor_fill_pct !== null && v.delta_dollar_value !== null;
  const deltaNum = v.delta_dollar_value ? Number.parseFloat(v.delta_dollar_value) : 0;
  const agree = hasCall && Math.abs(deltaNum) < 0.005;
  const over = hasCall && deltaNum > 0.005;

  const tone = !hasCall
    ? { color: "var(--color-subtle)", label: "Awaiting monitor call" }
    : agree
      ? { color: "var(--color-ok)", label: "In agreement" }
      : over
        ? reviewed
          ? { color: "var(--color-danger)", label: "Over-call on record" }
          : { color: "var(--color-money)", label: "Monitor over-called" }
        : { color: "var(--color-ok)", label: "Monitor under-called" };

  const interpretation = !hasCall
    ? "Record the monitor's fill call to compute the dollar delta."
    : agree
      ? "The billed value matches the measured load."
      : over
        ? `The monitor's call bills ${money(Math.abs(deltaNum))} more than the measured load supports.`
        : `The measured load is worth ${money(Math.abs(deltaNum))} more than the monitor's call.`;

  const fillDelta =
    v.monitor_fill_pct !== null ? Number.parseFloat(v.monitor_fill_pct) - Number.parseFloat(v.est_fill_pct) : null;

  const rows = [
    {
      label: "Fill",
      monitor: hasCall ? percent(v.monitor_fill_pct) : "Not called",
      measured: percent(v.est_fill_pct),
      delta: fillDelta === null ? "Not called" : signedPoints(fillDelta),
    },
    {
      label: "Volume",
      monitor: hasCall ? cubicYards(v.monitor_cubic_yards) : "Not called",
      measured: cubicYards(v.est_cubic_yards),
      delta: hasCall ? signedCubicYards(v.delta_cubic_yards) : "Not called",
    },
    {
      label: "Value",
      monitor: hasCall ? money(v.monitor_dollar_value) : "Not called",
      measured: money(v.est_dollar_value),
      delta: hasCall ? signedMoney(v.delta_dollar_value) : "Not called",
      emphasize: true,
    },
  ];

  const deltaTip = (
    <Tooltip content="Delta is the monitor's value minus LoadTruth's measured value. Positive means the monitor called the load higher than measured.">
      <span className="text-[var(--color-subtle)] hover:text-[var(--color-text)]" tabIndex={0}>
        <InfoIcon size={12} />
      </span>
    </Tooltip>
  );

  return (
    <div
      className="lt-card-shadow grid overflow-hidden rounded-xl border bg-[var(--color-surface)] lg:grid-cols-[1fr_280px]"
      style={{ borderColor: `color-mix(in srgb, ${tone.color} 40%, var(--color-border))` }}
    >
      {/* Reconciliation */}
      <div className="min-w-0">
        <table className="hidden w-full border-collapse text-[13px] sm:table">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-[var(--color-subtle)]">
              <th className="px-4 pb-2 pt-3.5 text-left font-semibold">Money frame</th>
              <th className="px-4 pb-2 pt-3.5 text-right font-semibold">Monitor call</th>
              <th className="px-4 pb-2 pt-3.5 text-right font-semibold text-[var(--color-money)]">Measured</th>
              <th className="px-4 pb-2 pt-3.5 text-right font-semibold">
                <span className="inline-flex items-center gap-1">Delta {deltaTip}</span>
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr
                key={r.label}
                className="border-t border-[var(--color-border)]"
                style={r.emphasize ? { backgroundColor: "var(--color-surface-2)" } : undefined}
              >
                <td className="px-4 py-2.5 text-[var(--color-muted)]">{r.label}</td>
                <td className="px-4 py-2.5 text-right text-[var(--color-text)]">{r.monitor}</td>
                <td className="px-4 py-2.5 text-right font-medium text-[var(--color-money)]">{r.measured}</td>
                <td
                  className={`px-4 py-2.5 text-right ${r.emphasize ? "font-bold" : "font-medium"}`}
                  style={{ color: hasCall ? tone.color : "var(--color-subtle)" }}
                >
                  {r.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Stacked rows on small screens */}
        <div className="flex flex-col divide-y divide-[var(--color-border)] sm:hidden">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-1 px-4 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--color-subtle)]">{r.label}</span>
                <span
                  className={`tabular-nums ${r.emphasize ? "text-[15px] font-bold" : "text-[13px] font-medium"}`}
                  style={{ color: hasCall ? tone.color : "var(--color-subtle)" }}
                >
                  {r.delta}
                </span>
              </div>
              <div className="flex justify-between text-[12px] tabular-nums text-[var(--color-muted)]">
                <span>
                  Monitor <span className="text-[var(--color-text)]">{r.monitor}</span>
                </span>
                <span>
                  Measured <span className="font-medium text-[var(--color-money)]">{r.measured}</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-2 text-[12px] text-[var(--color-subtle)]">
          Rate {money(v.rate_per_cy)} per CY · Certified capacity {cubicYards(v.certified_cubic_yards)}
        </div>
      </div>

      {/* Hero delta */}
      <div
        className="flex flex-col justify-center gap-1.5 border-t px-5 py-5 lg:border-l lg:border-t-0"
        style={{
          borderColor: "var(--color-border)",
          background: `linear-gradient(160deg, color-mix(in srgb, ${tone.color} 16%, var(--color-surface)), color-mix(in srgb, ${tone.color} 4%, var(--color-surface)))`,
        }}
      >
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: tone.color, backgroundColor: `color-mix(in srgb, ${tone.color} 14%, transparent)` }}>
          <span className="size-1.5 rounded-full" style={{ backgroundColor: tone.color }} aria-hidden />
          {tone.label}
        </span>
        <span className="text-[12px] font-medium text-[var(--color-muted)]">Dollar delta</span>
        <span className="text-[40px] font-bold leading-none tracking-tight tabular-nums" style={{ color: tone.color }}>
          {hasCall ? signedMoney(v.delta_dollar_value) : "No call"}
        </span>
        <p className="mt-1 text-[12px] leading-snug text-[var(--color-muted)]">{interpretation}</p>
      </div>
    </div>
  );
}
