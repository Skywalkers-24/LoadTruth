"use client";

import { useEvents } from "@/lib/hooks";

/**
 * Org + event context pill shown in the nav. In this build there is one seeded
 * tenant/event (the multi-tenant RBAC data layer exists server-side; the
 * switcher UI is wired to the events API and ready for multiple orgs/events).
 */
export function TenantSwitcher() {
  const events = useEvents();
  const event = events.data?.[0];
  const org = event?.location ? event.location.split(",").slice(-1)[0]?.trim() : "LoadTruth";

  return (
    <div className="hidden items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 sm:flex">
      <span
        className="grid size-6 place-items-center rounded-md text-[11px] font-bold text-black"
        style={{ backgroundColor: "var(--color-accent)" }}
        aria-hidden
      >
        {(org ?? "LT").slice(0, 2).toUpperCase()}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-medium">{org ?? "Organization"}</span>
        <span className="max-w-[180px] truncate text-[11px] text-[var(--color-muted)]">
          {event?.name ?? "Loading event…"}
        </span>
      </div>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        aria-hidden
        className="text-[var(--color-muted)]"
      >
        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.3" fill="none" />
      </svg>
    </div>
  );
}
