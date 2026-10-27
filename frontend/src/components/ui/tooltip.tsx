"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Lightweight hover/focus tooltip for defining technical terms and metrics.
 * Smooth fade, positioned above the trigger, dismissed on blur/leave. Use this
 * instead of the native `title` attribute for a consistent, legible hover.
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 120);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 z-50 w-max max-w-[260px] -translate-x-1/2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] font-normal leading-snug text-[var(--color-text)] shadow-[0_6px_20px_rgba(0,0,0,0.3)] transition-all duration-150"
        style={{
          [side === "top" ? "bottom" : "top"]: "calc(100% + 6px)",
          opacity: open ? 1 : 0,
          transform: `translateX(-50%) translateY(${open ? "0" : side === "top" ? "4px" : "-4px"})`,
          visibility: open ? "visible" : "hidden",
        }}
      >
        {content}
      </span>
    </span>
  );
}
