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
    ? { color: "var(--color-subtle)", label: "Awaiting inspector call" }
    : agree
      ? { color: "var(--color-ok)", label: "In agreement" }
      : over
        ? reviewed
          ? { color: "var(--color-danger)", label: "Over-bill on record" }
          : { color: "var(--color-money)", label: "Billed over measured" }
        : { color: "var(--color-ok)", label: "Billed under measured" };

  const interpretation = !hasCall
    ? "Enter the inspector's fill call to see the dollar difference."
    : agree
      ? "The bill matches what the load actually measures."
      : over
        ? `The bill is ${money(Math.abs(deltaNum))} higher than the evidence supports.`
        : `The load is worth ${money(Math.abs(deltaNum))} more than the bill claims.`;

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
    <Tooltip content="The gap in dollars: what the monitor's call bills minus what the load actually measures. A positive number means the bill is higher than the evidence supports.">
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
              <th className="px-4 pb-2 pt-3.5 text-right font-semibold">
                <HeadTip
                  label="Monitor call"
                  tip="The fill % the on-site human inspector (the 'monitor') called — the number the contractor is paid on today."
                />
              </th>
              <th className="px-4 pb-2 pt-3.5 text-right font-semibold text-[var(--color-money)]">
                <HeadTip
                  label="Measured"
                  tip="What LoadTruth measured from the footage with Meta's AI — the independent, evidence-backed number."
                  color="var(--color-money)"
                />
              </th>
              <th className="px-4 pb-2 pt-3.5 text-right font-semibold">
                <span className="inline-flex items-center gap-1">Difference {deltaTip}</span>
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
                <td className="px-4 py-2.5 text-[var(--color-muted-foreground)]">{r.label}</td>
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
              <div className="flex justify-between text-[12px] tabular-nums text-[var(--color-muted-foreground)]">
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

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-[var(--color-border)] px-4 py-2 text-[12px] text-[var(--color-subtle)]">
          <Tooltip content="The dollars paid per cubic yard for this type of debris on this event.">
            <span tabIndex={0} className="cursor-help border-b border-dotted border-[var(--color-border-strong)]">
              Rate {money(v.rate_per_cy)} per CY
            </span>
          </Tooltip>
          <span aria-hidden>·</span>
          <Tooltip content="The truck bed's registered volume in cubic yards, from the certified truck registry.">
            <span tabIndex={0} className="cursor-help border-b border-dotted border-[var(--color-border-strong)]">
              Certified capacity {cubicYards(v.certified_cubic_yards)}
            </span>
          </Tooltip>
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
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-muted-foreground)]">
          Dollar difference {deltaTip}
        </span>
        <span
          className="font-bold leading-none tracking-tight tabular-nums text-[clamp(28px,6vw,40px)]"
          style={{ color: tone.color }}
        >
          {hasCall ? signedMoney(v.delta_dollar_value) : "No call"}
        </span>
        <p className="mt-1 text-[12px] leading-snug text-[var(--color-muted-foreground)]">{interpretation}</p>
      </div>
    </div>
  );
}

/** A column header with a dotted-underline tooltip explaining the term. */
function HeadTip({ label, tip, color }: { label: string; tip: string; color?: string }) {
  return (
    <Tooltip content={tip}>
      <span
        tabIndex={0}
        className="cursor-help border-b border-dotted border-[var(--color-border-strong)]"
        style={color ? { color } : undefined}
      >
        {label}
      </span>
    </Tooltip>
  );
}
