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
 * The money frame as a compact strip: fill, volume, and value, each showing
 * what LoadTruth measured over what the monitor called, beside the dollar
 * difference as the hero. Sized to sit above the evidence without pushing it
 * below the fold. Responds to its own width (container query), so the hero
 * moves under the three figures when the pane is narrow.
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
    v.monitor_fill_pct !== null
      ? Number.parseFloat(v.monitor_fill_pct) - Number.parseFloat(v.est_fill_pct)
      : null;

  const cells = [
    {
      label: "Fill",
      measured: percent(v.est_fill_pct),
      monitor: hasCall ? percent(v.monitor_fill_pct) : null,
      delta: fillDelta === null ? null : signedPoints(fillDelta),
    },
    {
      label: "Volume",
      measured: cubicYards(v.est_cubic_yards),
      monitor: hasCall ? cubicYards(v.monitor_cubic_yards) : null,
      delta: hasCall ? signedCubicYards(v.delta_cubic_yards) : null,
    },
    {
      label: "Value",
      measured: money(v.est_dollar_value),
      monitor: hasCall ? money(v.monitor_dollar_value) : null,
      delta: hasCall ? signedMoney(v.delta_dollar_value) : null,
    },
  ];

  return (
    <div className="@container">
      <div
        className="lt-card-shadow grid overflow-hidden rounded-xl border bg-[var(--color-surface)] @[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] @2xl:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]"
        style={{ borderColor: `color-mix(in srgb, ${tone.color} 40%, var(--color-border))` }}
      >
        {/* Measured over monitor, per quantity */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
            <span>Money frame</span>
            <span className="ml-auto flex items-center gap-2 normal-case tracking-normal">
              <HeadTip
                label="Measured"
                tip="What LoadTruth measured from the footage with Meta's AI. This is the independent, evidence-backed number."
                color="var(--color-money)"
              />
              <span aria-hidden>over</span>
              <HeadTip
                label="Monitor call"
                tip="The fill percentage the on-site human inspector called. This is the number the contractor is paid on today."
              />
            </span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[var(--color-border)]">
            {cells.map((c) => (
              <div key={c.label} className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
                <span className="text-[11px] font-medium text-[var(--color-subtle)]">
                  {c.label}
                </span>
                <span className="truncate text-[15px] font-semibold leading-tight tabular-nums text-[var(--color-money)]">
                  {c.measured}
                </span>
                <span className="truncate text-[12px] tabular-nums text-[var(--color-muted-foreground)]">
                  {c.monitor === null ? (
                    "Not called"
                  ) : (
                    <>
                      {c.monitor}{" "}
                      <span style={{ color: tone.color }} className="font-medium">
                        {c.delta}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Hero: the dollar difference */}
        <div
          className="flex flex-col justify-center gap-1 border-t px-4 py-2.5 @[36rem]:border-l @[36rem]:border-t-0"
          style={{
            borderColor: "var(--color-border)",
            background: `linear-gradient(160deg, color-mix(in srgb, ${tone.color} 16%, var(--color-surface)), color-mix(in srgb, ${tone.color} 4%, var(--color-surface)))`,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-[var(--color-muted-foreground)]">
              Dollar difference <DeltaTip />
            </span>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                color: tone.color,
                backgroundColor: `color-mix(in srgb, ${tone.color} 14%, transparent)`,
              }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: tone.color }}
                aria-hidden
              />
              {tone.label}
            </span>
          </div>
          <span
            className="text-[24px] font-bold leading-none tracking-tight tabular-nums"
            style={{ color: tone.color }}
          >
            {hasCall ? signedMoney(v.delta_dollar_value) : "No call"}
          </span>
          <p className="text-[12px] leading-snug text-[var(--color-muted-foreground)]">
            {interpretation}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The "dollar difference" info tooltip. A component (not a shared element) so
 * each use has its own trigger ref and the portalled bubble anchors to the
 * icon the pointer is actually on.
 */
function DeltaTip() {
  return (
    <Tooltip content="The gap in dollars: what the monitor's call bills minus what the load actually measures. A positive number means the bill is higher than the evidence supports.">
      <span className="text-[var(--color-subtle)] hover:text-[var(--color-text)]" tabIndex={0}>
        <InfoIcon size={12} />
      </span>
    </Tooltip>
  );
}

/** A label with a dotted underline and a tooltip explaining the term. */
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
