"use client";

import { useHealth } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";
import { isServerWakingUp } from "@/lib/api";

/**
 * Minimal top-bar backend health dot. Green when healthy, amber while waking up
 * on Render (free tier cold start), red when unreachable; muted while checking.
 */
export function HealthIndicator() {
  const { data, isLoading, isError, dataUpdatedAt, error } = useHealth();

  const wakingUp = isError && isServerWakingUp(error);

  const state: "loading" | "waking" | "down" | "up" =
    isLoading && !data
      ? "loading"
      : wakingUp
        ? "waking"
        : isError || data == null
          ? "down"
          : "up";

  const color =
    state === "up"
      ? "var(--color-ok)"
      : state === "waking"
        ? "var(--color-warn, #f59e0b)"
        : state === "down"
          ? "var(--color-danger)"
          : "var(--color-subtle)";

  const label =
    state === "up"
      ? `API healthy${dataUpdatedAt ? ` · checked ${relativeTime(new Date(dataUpdatedAt).toISOString())}` : ""}`
      : state === "waking"
        ? "Server waking up on Render (free tier) · retrying automatically…"
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
        {state === "waking" && (
          <span
            className="absolute inline-flex size-full animate-pulse rounded-full opacity-75"
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
