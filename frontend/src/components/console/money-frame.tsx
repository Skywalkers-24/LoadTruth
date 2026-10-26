import type { Valuation } from "@/lib/api";
import { InfoIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/tooltip";
import {
  cubicYards,
  money,
  percent,
  signedCubicYards,
  signedMoney,
  signedPoints,
} from "@/lib/format";

/**
 * THE MONEY FRAME — the defining, hero element of a ticket.
 *
 * A reconciliation table comparing the human monitor's call with LoadTruth's
 * measured result across fill, volume, and value, plus the hero dollar delta.
 *
 * Convention (labelled in the UI):
 *     delta = monitor value − LoadTruth measured value
 * Positive  → monitor exceeds measured (possible overbilling).
 * Negative  → measured exceeds monitor (possible underbilling).
 *
 * Colors carry meaning but never alone: amber = needs-review exposure,
 * red = adverse/confirmed discrepancy, green = agreement, muted = awaiting call.
 */
export function MoneyFrame({ v, reviewed = false }: { v: Valuation; reviewed?: boolean }) {
  const hasCall = v.monitor_fill_pct !== null && v.delta_dollar_value !== null;
  const deltaNum = v.delta_dollar_value ? Number.parseFloat(v.delta_dollar_value) : 0;
  const overbill = v.is_overbill;
  const agree = hasCall && Math.abs(deltaNum) < 0.005;

  const tone = !hasCall
    ? { color: "var(--color-subtle)", label: "Awaiting monitor call" }
    : agree
      ? { color: "var(--color-ok)", label: "Monitor and measurement agree" }
      : overbill
        ? reviewed
          ? { color: "var(--color-danger)", label: "Confirmed over monitor call" }
          : { color: "var(--color-money)", label: "Monitor value exceeds measured value" }
        : { color: "var(--color-ok)", label: "Measured value exceeds monitor value" };

  const interpretation = !hasCall
    ? "Enter the monitor’s fill-% call to compute the dollar delta."
    : agree
      ? "The monitor’s billed value matches LoadTruth’s measurement."
      : overbill
        ? "The monitor’s call bills more than the measured load supports."
        : "The measured load exceeds what the monitor’s call would bill.";

  // Fill-% point delta (monitor − measured), when a call exists.
  const fillDelta =
    v.monitor_fill_pct !== null
      ? Number.parseFloat(v.monitor_fill_pct) - Number.parseFloat(v.est_fill_pct)
      : null;

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: `color-mix(in srgb, ${tone.color} 45%, var(--color-border))` }}
    >
      {/* Reconciliation table */}
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-subtle)]">
            <th className="px-3 py-2 text-left font-semibold">Metric</th>
            <th className="px-3 py-2 text-right font-semibold">Monitor call</th>
            <th className="px-3 py-2 text-right font-semibold">
              <span className="text-[var(--color-money)]">Measured</span>
            </th>
            <th className="px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center gap-1">
                Delta
                <Tooltip content="Delta is the monitor's billed value minus LoadTruth's measured value. A positive delta means the monitor called it higher than measured.">
                  <span className="text-[var(--color-subtle)] hover:text-[var(--color-text)]" tabIndex={0}>
                    <InfoIcon size={11} />
                  </span>
                </Tooltip>
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <Row
            label="Fill"
            monitor={hasCall ? percent(v.monitor_fill_pct) : "—"}
            measured={percent(v.est_fill_pct)}
            delta={fillDelta === null ? "—" : signedPoints(fillDelta)}
            deltaColor={tone.color}
            hasCall={hasCall}
          />
          <Row
            label="Volume"
            monitor={hasCall ? cubicYards(v.monitor_cubic_yards) : "—"}
            measured={cubicYards(v.est_cubic_yards)}
            delta={hasCall ? signedCubicYards(v.delta_cubic_yards) : "—"}
            deltaColor={tone.color}
            hasCall={hasCall}
          />
          <Row
            label="Value"
            emphasize
            monitor={hasCall ? money(v.monitor_dollar_value) : "—"}
            measured={money(v.est_dollar_value)}
            delta={hasCall ? signedMoney(v.delta_dollar_value) : "—"}
            deltaColor={tone.color}
            hasCall={hasCall}
          />
        </tbody>
      </table>

      {/* Hero delta band */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: `color-mix(in srgb, ${tone.color} 10%, var(--color-surface))`,
        }}
      >
        <div className="flex flex-col">
          <span
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: tone.color }}
          >
            {tone.label}
          </span>
          <span className="text-[12px] text-[var(--color-muted)]">
            Rate {money(v.rate_per_cy)}/CY · capacity {cubicYards(v.certified_cubic_yards)}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
            Dollar delta
          </div>
          <div
            className="text-[34px] font-bold leading-none tabular-nums sm:text-[38px]"
            style={{ color: tone.color }}
          >
            {hasCall ? signedMoney(v.delta_dollar_value) : "—"}
          </div>
        </div>
      </div>
      <p className="px-4 pb-2.5 pt-2 text-[12px] text-[var(--color-muted)]">{interpretation}</p>
    </div>
  );
}

function Row({
  label,
  monitor,
  measured,
  delta,
  deltaColor,
  hasCall,
  emphasize = false,
}: {
  label: string;
  monitor: string;
  measured: string;
  delta: string;
  deltaColor: string;
  hasCall: boolean;
  emphasize?: boolean;
}) {
  return (
    <tr
      className="border-t border-[var(--color-border)]"
      style={emphasize ? { backgroundColor: "var(--color-surface-2)" } : undefined}
    >
      <td className="px-3 py-2 text-left text-[var(--color-muted)]">{label}</td>
      <td className="px-3 py-2 text-right text-[var(--color-text)]">{monitor}</td>
      <td className="px-3 py-2 text-right font-medium text-[var(--color-money)]">{measured}</td>
      <td
        className={`px-3 py-2 text-right ${emphasize ? "font-bold" : "font-medium"}`}
        style={{ color: hasCall ? deltaColor : "var(--color-subtle)" }}
      >
        {delta}
      </td>
    </tr>
  );
}
