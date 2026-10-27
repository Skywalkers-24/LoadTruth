import type { ReactNode } from "react";

/** A keyboard key hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-1 font-sans text-[11px] font-medium leading-none text-[var(--color-muted)] ${className ?? ""}`}
    >
      {children}
    </kbd>
  );
}
