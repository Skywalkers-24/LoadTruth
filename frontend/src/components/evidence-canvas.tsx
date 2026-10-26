import type { Ticket } from "@/lib/api";

/**
 * The media canvas. With no live clips yet (MOCK build), this renders a
 * schematic truck-bed with the segmentation overlay the pipeline produces:
 * the bed-rail reference plane and the debris-load surface, which is how
 * SAM 3.1 turns pixels into a fill-% measurement (PLAN.md §5 Stage 5).
 * Swaps for the real <video> + mask SVG once clips are ingested.
 */
export function EvidenceCanvas({ ticket }: { ticket: Ticket }) {
  const fill = Number.parseFloat(ticket.valuation.est_fill_pct);
  const loadTop = 100 - Math.min(Math.max(fill, 0), 100) * 0.7; // within bed region

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
      <svg viewBox="0 0 160 90" className="size-full" role="img" aria-label="Load segmentation">
        {/* truck bed */}
        <rect
          x="20"
          y="22"
          width="120"
          height="54"
          rx="3"
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="0.8"
        />
        {/* bed-rail reference plane */}
        <line
          x1="20"
          y1="30"
          x2="140"
          y2="30"
          stroke="var(--color-accent)"
          strokeWidth="0.8"
          strokeDasharray="3 2"
        />
        <text x="22" y="28" fontSize="4" fill="var(--color-accent)">
          bed rail
        </text>
        {/* debris load surface (fill mask) */}
        <rect
          x="22"
          y={22 + loadTop * 0.48}
          width="116"
          height={74 - (22 + loadTop * 0.48)}
          fill="color-mix(in srgb, var(--color-ok) 28%, transparent)"
          stroke="var(--color-ok)"
          strokeWidth="0.6"
        />
        <text x="24" y={24 + loadTop * 0.48} fontSize="4" fill="var(--color-ok)">
          load surface
        </text>
      </svg>
      <div className="absolute bottom-2 left-3 rounded bg-[var(--color-surface)]/80 px-2 py-1 text-xs text-[var(--color-muted)]">
        {ticket.truck_id ?? "unidentified truck"} · {ticket.evidence_frames.length} evidence frame
        {ticket.evidence_frames.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
