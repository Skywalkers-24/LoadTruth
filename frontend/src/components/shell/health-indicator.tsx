"use client";

import { useHealth } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";

/**
 * Minimal top-bar backend health dot. Green only when the real /health check
 * confirms the API is up; red when unreachable; muted while checking. The state
 * is conveyed by the dot plus an accessible label/tooltip — no verbose text.
 */
export function HealthIndicator() {
  const { data, isLoading, isError, dataUpdatedAt } = useHealth();

  const state: "loading" | "down" | "up" =
    isLoading && !data ? "loading" : isError || data == null ? "down" : "up";

  const color =
    state === "up"
      ? "var(--color-ok)"
      : state === "down"
        ? "var(--color-danger)"
        : "var(--color-subtle)";

  const label =
    state === "up"
      ? `API healthy${dataUpdatedAt ? ` · checked ${relativeTime(new Date(dataUpdatedAt).toISOString())}` : ""}`
      : state === "down"
        ? "API unreachable"
        : "Checking API…";

  return (
    <span
      className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card"
      title={label}
      aria-label={label}
      role="status"
    >
      <span className="relative flex size-2">
        {state === "up" && (
          <span
            className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        )}
        <span
          className="relative inline-flex size-2 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      </span>
    </span>
  );
}
