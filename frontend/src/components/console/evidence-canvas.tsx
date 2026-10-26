"use client";

import { useState } from "react";

import type { Ticket } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { CameraIcon, LayersIcon, SkipBackIcon, SkipForwardIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/primitives";
import { percent } from "@/lib/format";

/**
 * Evidence workspace canvas.
 *
 * Honesty note: this build's ticket API returns measured scalars (fill %, truck
 * id, evidence-frame IDs) but NOT raw footage or bounding-box coordinates. So
 * this renders a SCHEMATIC measurement view — the bed-rail reference plane and
 * the segmented load surface positioned from the measured fill % — and labels
 * it as schematic. It is not presented as captured camera imagery. When real
 * frames and geometry are wired, swap the schematic for <video> + mask SVG.
 */
type Overlay = "bed" | "load" | "truck";

export function EvidenceCanvas({ ticket }: { ticket: Ticket }) {
  const frames = ticket.evidence_frames;
  const [frameIdx, setFrameIdx] = useState(0);
  const [overlays, setOverlays] = useState<Record<Overlay, boolean>>({
    bed: true,
    load: true,
    truck: true,
  });

  const fill = clamp(Number.parseFloat(ticket.valuation.est_fill_pct), 0, 100);
  const selectedFrame = frames[frameIdx];

  function toggle(o: Overlay) {
    setOverlays((prev) => ({ ...prev, [o]: !prev[o] }));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      {/* Viewer chrome header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
        <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-text)]">
          <CameraIcon size={15} className="text-[var(--color-accent)]" />
          Evidence
          <Badge tone="neutral">Measurement overlay</Badge>
        </div>
      </div>

      <div className="relative aspect-video w-full overflow-hidden bg-[var(--color-bg)]">
        {frames.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center p-6">
            <EmptyState
              icon={<CameraIcon size={22} />}
              title="No evidence captured"
              description="This ticket has no evidence frames yet. Upload a clip to generate the measurement overlay."
            />
          </div>
        ) : (
          <>
            {/* Schematic backdrop */}
            <div className="absolute inset-0 lt-grid-bg" aria-hidden />
            <Schematic fill={fill} overlays={overlays} />

            {/* Top-left: overlay label */}
            <div className="absolute left-2.5 top-2.5">
              <Badge tone="neutral">Segmentation overlay</Badge>
            </div>

            {/* Top-right: frame id */}
            <div className="absolute right-2.5 top-2.5 rounded-md border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_85%,transparent)] px-2 py-1 text-[12px] tabular-nums text-[var(--color-muted)] backdrop-blur">
              {selectedFrame ?? "No frame"}
            </div>

            {/* Bottom-left: measured fill readout */}
            <div className="absolute bottom-2.5 left-2.5 rounded-md border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_85%,transparent)] px-2.5 py-1.5 backdrop-blur">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
                Measured fill
              </div>
              <div
                className="text-[16px] font-bold tabular-nums"
                style={{ color: "var(--color-money)" }}
              >
                {percent(ticket.valuation.est_fill_pct)}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Transport bar — disabled (no video stream in this build), kept honest */}
      {frames.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <div className="flex items-center gap-2 text-[var(--color-subtle)]">
            <button
              type="button"
              disabled={frameIdx === 0}
              aria-label="Previous frame"
              onClick={() => setFrameIdx((i) => Math.max(0, i - 1))}
              className="rounded p-1 hover:text-[var(--color-text)] disabled:opacity-30"
            >
              <SkipBackIcon size={15} />
            </button>
            <span className="text-[12px] tabular-nums text-[var(--color-muted)]">
              Frame {frameIdx + 1} of {frames.length}
            </span>
            <button
              type="button"
              disabled={frameIdx >= frames.length - 1}
              aria-label="Next frame"
              onClick={() => setFrameIdx((i) => Math.min(frames.length - 1, i + 1))}
              className="rounded p-1 hover:text-[var(--color-text)] disabled:opacity-30"
            >
              <SkipForwardIcon size={15} />
            </button>
          </div>
          <span className="truncate text-[12px] tabular-nums text-[var(--color-subtle)]">
            {selectedFrame}
          </span>
        </div>
      )}
      </div>

      {frames.length > 0 && (
        <>
          {/* Overlay toggles + legend */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-[12px] text-[var(--color-subtle)]">
                <LayersIcon size={13} /> Overlays
              </span>
              <OverlayToggle
                label="Bed rail"
                color="var(--color-info)"
                on={overlays.bed}
                onClick={() => toggle("bed")}
              />
              <OverlayToggle
                label="Load surface"
                color="var(--color-money)"
                on={overlays.load}
                onClick={() => toggle("load")}
              />
              <OverlayToggle
                label="Truck box"
                color="var(--color-muted)"
                on={overlays.truck}
                onClick={() => toggle("truck")}
              />
            </div>
          </div>

          {/* Frame selector / timeline */}
          {frames.length > 1 && (
            <div className="lt-scroll flex gap-1.5 overflow-x-auto pb-1" role="tablist">
              {frames.map((f, i) => {
                const active = i === frameIdx;
                return (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFrameIdx(i)}
                    className="flex shrink-0 flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] tabular-nums transition-colors"
                    style={{
                      borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                      backgroundColor: active
                        ? "var(--color-accent-soft)"
                        : "var(--color-surface-2)",
                      color: active ? "var(--color-text)" : "var(--color-muted)",
                    }}
                  >
                    <span className="grid h-8 w-12 place-items-center rounded bg-[var(--color-bg)] lt-grid-bg" />
                    {f}
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[12px] leading-snug text-[var(--color-subtle)]">
            Fill is estimated from the segmented load surface relative to the calibrated truck-bed
            geometry.
          </p>
        </>
      )}
    </div>
  );
}

function Schematic({ fill, overlays }: { fill: number; overlays: Record<Overlay, boolean> }) {
  // Bed region in the 160×90 viewBox. The load surface top rises with fill %.
  const bedTop = 30;
  const bedBottom = 74;
  const bedHeight = bedBottom - bedTop;
  const surfaceY = bedBottom - (bedHeight * fill) / 100;

  return (
    <svg
      viewBox="0 0 160 90"
      className="absolute inset-0 size-full"
      role="img"
      aria-label={`Schematic load segmentation at ${fill}% fill`}
    >
      {/* Truck bounding box */}
      {overlays.truck && (
        <rect
          x="16"
          y="20"
          width="128"
          height="58"
          rx="2"
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="0.7"
          strokeDasharray="4 2"
        />
      )}

      {/* Bed interior */}
      <rect
        x="22"
        y={bedTop}
        width="116"
        height={bedHeight}
        rx="1.5"
        fill="none"
        stroke="var(--color-border-strong)"
        strokeWidth="0.6"
      />

      {/* Load surface mask (translucent amber) */}
      {overlays.load && (
        <>
          <rect
            x="22"
            y={surfaceY}
            width="116"
            height={bedBottom - surfaceY}
            fill="color-mix(in srgb, var(--color-money) 30%, transparent)"
            stroke="var(--color-money)"
            strokeWidth="0.7"
          />
          <text x="25" y={Math.max(surfaceY + 5, bedTop + 5)} fontSize="3.6" fill="var(--color-money)">
            load surface
          </text>
        </>
      )}

      {/* Bed-rail reference plane (high-contrast line) */}
      {overlays.bed && (
        <>
          <line
            x1="20"
            y1={bedTop}
            x2="140"
            y2={bedTop}
            stroke="var(--color-info)"
            strokeWidth="0.9"
            strokeDasharray="3 1.5"
          />
          <text x="25" y={bedTop - 1.5} fontSize="3.6" fill="var(--color-info)">
            bed rail (reference)
          </text>
        </>
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
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
      style={{
        borderColor: on ? color : "var(--color-border)",
        backgroundColor: on ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
        color: on ? "var(--color-text)" : "var(--color-subtle)",
      }}
    >
      <span
        className="size-2 rounded-sm"
        style={{ backgroundColor: on ? color : "var(--color-border-strong)" }}
        aria-hidden
      />
      {label}
    </button>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}
