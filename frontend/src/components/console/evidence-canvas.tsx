"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2Icon, MaximizeIcon, MinimizeIcon } from "lucide-react";

import type { Ticket } from "@/lib/api";
import { useTicketEvidence } from "@/lib/hooks";
import { SamPlayer } from "@/components/console/sam-player";
import { Badge } from "@/components/ui/badge";
import { CameraIcon, SkipBackIcon, SkipForwardIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { percent } from "@/lib/format";

/**
 * Evidence canvas. Renders an estimate overlay drawn from the ticket's
 * fill estimate: a side-profile dump truck, the estimated load surface, the
 * bed-rail reference plane, and a marker at the monitor's
 * claimed fill so the gap between the two is visible at a glance.
 */
type Overlay = "body" | "rail" | "load" | "call";

export function EvidenceCanvas({ ticket }: { ticket: Ticket }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
    };
  }, [expanded]);
  async function toggleFullscreen() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (document.fullscreenElement === viewerRef.current) {
      await document.exitFullscreen();
      return;
    }
    try {
      if (!viewerRef.current?.requestFullscreen) {
        setExpanded(true);
        return;
      }
      await viewerRef.current.requestFullscreen();
    } catch {
      setExpanded(true);
    }
  }
  const frames = ticket.evidence_frames;
  const [frameIdx, setFrameIdx] = useState(0);
  const [overlays, setOverlays] = useState<Record<Overlay, boolean>>({
    body: true,
    rail: true,
    load: true,
    call: true,
  });

  // The clip the models analyzed, with SAM's per-frame output, when stored.
  const evidenceQuery = useTicketEvidence(ticket.id);
  const evidence = evidenceQuery.data ?? null;
  const loadingEvidence = Boolean(evidenceQuery.isLoading && !evidence);
  const live = Boolean(evidence?.has_media);
  const [samFrame, setSamFrame] = useState({ frame: 0, total: 0 });
  const onFrame = useCallback((frame: number, total: number) => {
    setSamFrame((prev) => (prev.frame === frame && prev.total === total ? prev : { frame, total }));
  }, []);
  const hasViewer = live && !loadingEvidence;

  const v = ticket.valuation;
  const measured = clamp(Number.parseFloat(v.est_fill_pct), 0, 100);
  const monitor =
    v.monitor_fill_pct !== null ? clamp(Number.parseFloat(v.monitor_fill_pct), 0, 100) : null;
  const selectedFrame = frames[frameIdx];

  function toggle(o: Overlay) {
    setOverlays((prev) => ({ ...prev, [o]: !prev[o] }));
  }

  // Preserve a readable video area at every pane width. The surrounding
  // column scrolls instead of squeezing the footage between summary cards.
  const viewer = (
    <div className="flex shrink-0 flex-col gap-3">
      <div
        ref={viewerRef}
        data-expanded={expanded || undefined}
        className="lt-evidence-viewer overflow-hidden rounded-lg border border-[var(--color-border)]"
      >
        {/* Viewer header: title, frame, overlay toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]">
            <CameraIcon size={15} className="shrink-0 text-[var(--color-subtle)]" />
            Evidence
            <Tooltip
              content={
                loadingEvidence
                  ? "Loading real evidence footage…"
                  : live
                    ? "SAM 3.1 masks: amber is the exterior and tailgate, blue is the visible bed interior above the rear rim, and purple is the load. Each color can be toggled."
                    : "No video footage captured for this ticket."
              }
            >
              <span tabIndex={0}>
                <Badge tone="neutral">
                  {loadingEvidence
                    ? "Loading footage…"
                    : live
                      ? "SAM 3.1 segmentation"
                      : "No evidence"}
                </Badge>
              </span>
            </Tooltip>
            {live && samFrame.total > 0 && (
              <span className="hidden truncate text-[12px] font-normal tabular-nums text-[var(--color-subtle)] md:inline">
                Frame {samFrame.frame + 1} of {samFrame.total}
              </span>
            )}
          </div>
          {hasViewer && (
            <div className="flex flex-wrap items-center gap-1.5">
              {live && (
                <OverlayToggle
                  label="Body"
                  color="#f59e0b"
                  on={overlays.body}
                  onClick={() => toggle("body")}
                />
              )}
              <OverlayToggle
                label={live ? "Bed" : "Rail"}
                color="var(--color-info)"
                on={overlays.rail}
                onClick={() => toggle("rail")}
              />
              <OverlayToggle
                label="Load"
                color="var(--color-money)"
                on={overlays.load}
                onClick={() => toggle("load")}
              />
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                aria-label={
                  fullscreen || expanded ? "Exit evidence fullscreen" : "Fullscreen evidence"
                }
                title={fullscreen || expanded ? "Exit fullscreen" : "Fullscreen with masks"}
                className="rounded-md border border-[var(--color-border)] p-1.5 hover:bg-[var(--color-surface-2)]"
              >
                {fullscreen || expanded ? <MinimizeIcon size={16} /> : <MaximizeIcon size={16} />}
              </button>
            </div>
          )}
        </div>

        {/* The media and SVG overlays letterbox inside this box at any size. */}
        <div className="lt-evidence-media relative aspect-video min-h-[14rem] w-full shrink-0 overflow-hidden bg-[var(--color-bg)]">
          {loadingEvidence ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--color-bg)] text-[var(--color-subtle)]">
              <Loader2Icon className="size-8 animate-spin text-[var(--color-money)]" />
              <p className="text-sm font-medium">Loading real video evidence…</p>
            </div>
          ) : live && evidence ? (
            <>
              <SamPlayer
                key={ticket.id}
                ticketId={ticket.id}
                evidence={evidence}
                show={{ body: overlays.body, bed: overlays.rail, load: overlays.load }}
                onFrame={onFrame}
              />
              <div className="pointer-events-none absolute right-3 top-3 hidden gap-2 sm:flex">
                <Readout
                  label="Estimated"
                  value={percent(v.est_fill_pct)}
                  color="var(--color-money)"
                />
              </div>
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center p-6">
              <EmptyState
                icon={<CameraIcon size={22} />}
                title="No video evidence captured"
                description="Upload a clip to generate the video evidence for this ticket."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return expanded ? createPortal(viewer, document.body) : viewer;
}

function Readout({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] px-2.5 py-1.5 backdrop-blur">
      <div className="text-[11px] font-medium text-[var(--color-subtle)]">{label}</div>
      <div className="text-[15px] font-bold leading-tight tabular-nums" style={{ color }}>
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
      aria-label={`Estimated fill ${measured}%${monitor !== null ? `, monitor call ${monitor}%` : ""}`}
    >
      <defs>
        <linearGradient id="lt-load" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-money)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-money)" stopOpacity="0.22" />
        </linearGradient>
        <pattern
          id="lt-gap"
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="3"
            stroke="var(--color-danger)"
            strokeWidth="0.8"
            strokeOpacity="0.5"
          />
        </pattern>
      </defs>

      {/* Ground */}
      <line x1="4" y1="92" x2="196" y2="92" stroke="var(--color-border-strong)" strokeWidth="0.6" />

      {/* Chassis + cab */}
      <rect
        x="12"
        y="72"
        width="172"
        height="5"
        rx="1.2"
        fill="var(--color-surface-3)"
        stroke="var(--color-border-strong)"
        strokeWidth="0.5"
      />
      <path
        d="M 140 72 L 140 46 Q 140 42 144 42 L 164 42 L 178 57 L 182 60 L 182 72 Z"
        fill="var(--color-surface-2)"
        stroke="var(--color-border-strong)"
        strokeWidth="0.7"
      />
      <path
        d="M 146 47 L 162 47 L 172 58 L 146 58 Z"
        fill="var(--color-surface-3)"
        stroke="var(--color-border)"
        strokeWidth="0.4"
      />

      {/* Wheels */}
      {[36, 58, 162].map((cx) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy="83"
            r="8.5"
            fill="var(--color-surface-3)"
            stroke="var(--color-border-strong)"
            strokeWidth="0.7"
          />
          <circle
            cx={cx}
            cy="83"
            r="3.2"
            fill="var(--color-surface-2)"
            stroke="var(--color-border-strong)"
            strokeWidth="0.5"
          />
        </g>
      ))}

      {/* Overcall gap: hatched band between estimated surface and the monitor call */}
      {overlays.call && callY !== null && gap > 0 && (
        <rect
          x={BED_X + 1}
          y={callY}
          width={BED_W - 2}
          height={surfaceY - callY}
          fill="url(#lt-gap)"
        />
      )}

      {/* Load surface */}
      {overlays.load && (
        <path d={loadPath} fill="url(#lt-load)" stroke="var(--color-money)" strokeWidth="0.7" />
      )}

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
          <line
            x1={BED_X - 4}
            y1={BED_TOP}
            x2={BED_X + BED_W + 4}
            y2={BED_TOP}
            stroke="var(--color-info)"
            strokeWidth="0.8"
            strokeDasharray="2.5 1.5"
          />
          <text
            x={BED_X}
            y={BED_TOP - 2}
            fontSize={LABEL}
            fill="var(--color-info)"
            fontWeight="600"
          >
            Bed rail 100%
          </text>
        </>
      )}

      {/* Monitor call marker: label above the line, right aligned inside the bed */}
      {overlays.call && callY !== null && (
        <>
          <line
            x1={BED_X - 4}
            y1={callY}
            x2={BED_X + BED_W + 4}
            y2={callY}
            stroke="var(--color-text)"
            strokeWidth="0.9"
            strokeDasharray="1.4 1.2"
          />
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

      {/* Estimated label: inside the load, just under its surface */}
      {overlays.load && BED_BOTTOM - surfaceY > 7 && (
        <text
          x={BED_X + 3}
          y={surfaceY + 6.5}
          fontSize={LABEL}
          fill="var(--color-money)"
          fontWeight="700"
        >
          Estimate {Math.round(measured)}%
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
        borderColor: on
          ? `color-mix(in srgb, ${color} 55%, var(--color-border))`
          : "var(--color-border)",
        backgroundColor: on ? `color-mix(in srgb, ${color} 10%, transparent)` : "transparent",
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
