"use client";

import { useState } from "react";

import type { Ticket } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { CameraIcon, SkipBackIcon, SkipForwardIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { percent } from "@/lib/format";

/**
 * Evidence canvas. Renders a measurement overlay drawn from the ticket's
 * measured values: a side-profile dump truck, the segmented load surface at the
 * measured fill, the bed-rail reference plane, and a marker at the monitor's
 * claimed fill so the gap between the two is visible at a glance.
 */
type Overlay = "rail" | "load" | "call";

export function EvidenceCanvas({ ticket }: { ticket: Ticket }) {
  const frames = ticket.evidence_frames;
  const [frameIdx, setFrameIdx] = useState(0);
  const [overlays, setOverlays] = useState<Record<Overlay, boolean>>({
    rail: true,
    load: true,
    call: true,
  });

  const v = ticket.valuation;
  const measured = clamp(Number.parseFloat(v.est_fill_pct), 0, 100);
  const monitor =
    v.monitor_fill_pct !== null ? clamp(Number.parseFloat(v.monitor_fill_pct), 0, 100) : null;
  const selectedFrame = frames[frameIdx];

  function toggle(o: Overlay) {
    setOverlays((prev) => ({ ...prev, [o]: !prev[o] }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        {/* Viewer header: title, frame, overlay toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]">
            <CameraIcon size={15} className="shrink-0 text-[var(--color-subtle)]" />
            Evidence
            <Tooltip content="Drawn from the segmented load surface relative to the calibrated truck-bed geometry.">
              <span tabIndex={0}>
                <Badge tone="neutral">Measurement overlay</Badge>
              </span>
            </Tooltip>
            {frames.length > 0 && (
              <span className="hidden truncate text-[12px] font-normal tabular-nums text-[var(--color-subtle)] md:inline">
                {selectedFrame}
              </span>
            )}
          </div>
          {frames.length > 0 && (
            <div className="flex items-center gap-1.5">
              <OverlayToggle label="Rail" color="var(--color-info)" on={overlays.rail} onClick={() => toggle("rail")} />
              <OverlayToggle label="Load" color="var(--color-money)" on={overlays.load} onClick={() => toggle("load")} />
              {monitor !== null && (
                <OverlayToggle label="Call" color="var(--color-text)" on={overlays.call} onClick={() => toggle("call")} />
              )}
            </div>
          )}
        </div>

        <div className="relative aspect-[16/8] w-full overflow-hidden bg-[var(--color-bg)]">
          {frames.length === 0 ? (
            <div className="absolute inset-0 grid place-items-center p-6">
              <EmptyState
                icon={<CameraIcon size={22} />}
                title="No evidence captured"
                description="Upload a clip to generate the measurement overlay for this ticket."
              />
            </div>
          ) : (
            <>
              <div className="lt-grid-bg absolute inset-0" aria-hidden />
              <TruckIllustration measured={measured} monitor={monitor} overlays={overlays} />

              {/* Readouts */}
              <div className="absolute right-3 top-3 hidden gap-2 sm:flex">
                <Readout label="Measured" value={percent(v.est_fill_pct)} color="var(--color-money)" />
                {monitor !== null && (
                  <Readout
                    label="Monitor call"
                    value={percent(v.monitor_fill_pct)}
                    color="var(--color-text)"
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Frame stepper (only when there is more than one frame) */}
        {frames.length > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
            <div className="flex items-center gap-1 text-[var(--color-subtle)]">
              <button
                type="button"
                disabled={frameIdx === 0}
                aria-label="Previous frame"
                onClick={() => setFrameIdx((i) => Math.max(0, i - 1))}
                className="rounded p-1.5 hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)] disabled:opacity-30"
              >
                <SkipBackIcon size={14} />
              </button>
              <span className="min-w-[88px] text-center text-[12px] tabular-nums text-[var(--color-muted-foreground)]">
                Frame {frameIdx + 1} of {frames.length}
              </span>
              <button
                type="button"
                disabled={frameIdx >= frames.length - 1}
                aria-label="Next frame"
                onClick={() => setFrameIdx((i) => Math.min(frames.length - 1, i + 1))}
                className="rounded p-1.5 hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)] disabled:opacity-30"
              >
                <SkipForwardIcon size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Readout({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] px-2.5 py-1.5 backdrop-blur">
      <div className="text-[11px] font-medium text-[var(--color-subtle)]">{label}</div>
      <div className="text-[17px] font-bold leading-tight tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/**
 * Side-profile dump truck in a 200×100 viewBox. The bed interior spans
 * y = BED_TOP..BED_BOTTOM; fill percentages map linearly onto that height.
 */
const BED_X = 18;
const BED_W = 114;
const BED_TOP = 32;
const BED_BOTTOM = 70;
const LABEL = 4.4;

function levelY(pct: number): number {
  return BED_BOTTOM - ((BED_BOTTOM - BED_TOP) * pct) / 100;
}

function TruckIllustration({
  measured,
  monitor,
  overlays,
}: {
  measured: number;
  monitor: number | null;
  overlays: Record<Overlay, boolean>;
}) {
  const surfaceY = levelY(measured);
  const callY = monitor !== null ? levelY(monitor) : null;
  // A gentle heap: the middle of the load sits slightly above the edges.
  const heap = Math.min(4, (BED_BOTTOM - surfaceY) * 0.25);
  const loadPath = `M ${BED_X + 1} ${BED_BOTTOM - 0.5}
    L ${BED_X + 1} ${surfaceY + heap * 0.6}
    Q ${BED_X + BED_W / 2} ${surfaceY - heap} ${BED_X + BED_W - 1} ${surfaceY + heap * 0.6}
    L ${BED_X + BED_W - 1} ${BED_BOTTOM - 0.5} Z`;

  const gap = monitor !== null ? monitor - measured : 0;

  return (
    <svg
      viewBox="0 0 200 100"
      className="absolute inset-0 size-full"
      role="img"
      aria-label={`Measured fill ${measured}%${monitor !== null ? `, monitor call ${monitor}%` : ""}`}
    >
      <defs>
        <linearGradient id="lt-load" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-money)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-money)" stopOpacity="0.22" />
        </linearGradient>
        <pattern id="lt-gap" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3" stroke="var(--color-danger)" strokeWidth="0.8" strokeOpacity="0.5" />
        </pattern>
      </defs>

      {/* Ground */}
      <line x1="4" y1="92" x2="196" y2="92" stroke="var(--color-border-strong)" strokeWidth="0.6" />

      {/* Chassis + cab */}
      <rect x="12" y="72" width="172" height="5" rx="1.2" fill="var(--color-surface-3)" stroke="var(--color-border-strong)" strokeWidth="0.5" />
      <path
        d="M 140 72 L 140 46 Q 140 42 144 42 L 164 42 L 178 57 L 182 60 L 182 72 Z"
        fill="var(--color-surface-2)"
        stroke="var(--color-border-strong)"
        strokeWidth="0.7"
      />
      <path d="M 146 47 L 162 47 L 172 58 L 146 58 Z" fill="var(--color-surface-3)" stroke="var(--color-border)" strokeWidth="0.4" />

      {/* Wheels */}
      {[36, 58, 162].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="83" r="8.5" fill="var(--color-surface-3)" stroke="var(--color-border-strong)" strokeWidth="0.7" />
          <circle cx={cx} cy="83" r="3.2" fill="var(--color-surface-2)" stroke="var(--color-border-strong)" strokeWidth="0.5" />
        </g>
      ))}

      {/* Overcall gap: hatched band between measured surface and the monitor call */}
      {overlays.call && callY !== null && gap > 0 && (
        <rect x={BED_X + 1} y={callY} width={BED_W - 2} height={surfaceY - callY} fill="url(#lt-gap)" />
      )}

      {/* Load surface */}
      {overlays.load && <path d={loadPath} fill="url(#lt-load)" stroke="var(--color-money)" strokeWidth="0.7" />}

      {/* Bed walls */}
      <path
        d={`M ${BED_X} ${BED_TOP} L ${BED_X} ${BED_BOTTOM} L ${BED_X + BED_W} ${BED_BOTTOM} L ${BED_X + BED_W} ${BED_TOP}`}
        fill="none"
        stroke="var(--color-text)"
        strokeOpacity="0.55"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />

      {/* Bed-rail reference: label sits above the line, left aligned */}
      {overlays.rail && (
        <>
          <line x1={BED_X - 4} y1={BED_TOP} x2={BED_X + BED_W + 4} y2={BED_TOP} stroke="var(--color-info)" strokeWidth="0.8" strokeDasharray="2.5 1.5" />
          <text x={BED_X} y={BED_TOP - 2} fontSize={LABEL} fill="var(--color-info)" fontWeight="600">
            Bed rail 100%
          </text>
        </>
      )}

      {/* Monitor call marker: label above the line, right aligned inside the bed */}
      {overlays.call && callY !== null && (
        <>
          <line x1={BED_X - 4} y1={callY} x2={BED_X + BED_W + 4} y2={callY} stroke="var(--color-text)" strokeWidth="0.9" strokeDasharray="1.4 1.2" />
          <text
            x={BED_X + BED_W - 2}
            y={callY - 1.8}
            fontSize={LABEL}
            fill="var(--color-text)"
            fontWeight="600"
            textAnchor="end"
          >
            Monitor {Math.round(monitor ?? 0)}%
          </text>
        </>
      )}

      {/* Measured label: inside the load, just under its surface */}
      {overlays.load && BED_BOTTOM - surfaceY > 7 && (
        <text
          x={BED_X + 3}
          y={surfaceY + 6.5}
          fontSize={LABEL}
          fill="var(--color-money)"
          fontWeight="700"
        >
          Measured {Math.round(measured)}%
        </text>
      )}
    </svg>
  );
}

function OverlayToggle({
  label,
  color,
  on,
  onClick,
}: {
  label: string;
  color: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors"
      style={{
        borderColor: on ? `color-mix(in srgb, ${color} 55%, var(--color-border))` : "var(--color-border)",
        backgroundColor: on ? `color-mix(in srgb, ${color} 10%, transparent)` : "transparent",
        color: on ? "var(--color-text)" : "var(--color-subtle)",
      }}
    >
      <span className="size-2 rounded-sm" style={{ backgroundColor: on ? color : "var(--color-border-strong)" }} aria-hidden />
      {label}
    </button>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}
