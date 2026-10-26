"use client";

import { useTheme } from "@/lib/theme";

/** Dark/light toggle. Accessible: labelled button, reflects current state. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <span aria-hidden className="text-base">
        {theme === "dark" ? "☀️" : "🌙"}
      </span>
    </button>
  );
}
