"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Lightweight hover/focus tooltip for defining technical terms and metrics.
 * Smooth fade, positioned above (or below) the trigger, dismissed on blur/leave.
 * Use this instead of the native `title` attribute for a consistent, legible
 * hover.
 *
 * The bubble is rendered through a portal to <body> with fixed positioning
 * computed from the trigger's rect. This keeps it from being clipped by any
 * ancestor that sets `overflow: hidden` (cards, tables, scroll areas), which
 * was cutting tooltips off at card edges. The bubble is also flipped to the
 * opposite side and clamped to the viewport so it never spills off-screen.
 */
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: "top" | "bottom" }>({
    top: 0,
    left: 0,
    placement: side,
  });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 120);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }

  // Position the portalled bubble against the trigger once it's visible, then
  // flip/clamp so it stays within the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    const t = trigger.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const margin = 8;
    const gap = 6;

    // Prefer the requested side; flip if there isn't room.
    let placement = side;
    if (side === "top" && t.top - b.height - gap < margin) placement = "bottom";
    if (side === "bottom" && t.bottom + b.height + gap > window.innerHeight - margin)
      placement = "top";

    const top = placement === "top" ? t.top - b.height - gap : t.bottom + gap;

    // Center horizontally over the trigger, clamped to the viewport.
    let left = t.left + t.width / 2 - b.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - b.width - margin));

    setCoords({ top, left, placement });
  }, [open, side, content]);

  return (
    <>
      <span
        ref={triggerRef}
        className="relative inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            ref={bubbleRef}
            role="tooltip"
            className="pointer-events-none fixed z-[1000] w-max max-w-[260px] rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] font-normal leading-snug text-[var(--color-text)] shadow-[0_6px_20px_rgba(0,0,0,0.3)] transition-opacity duration-150"
            style={{
              top: coords.top,
              left: coords.left,
              opacity: open ? 1 : 0,
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  );
}
