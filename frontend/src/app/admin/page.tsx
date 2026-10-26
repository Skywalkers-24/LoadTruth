"use client";

import { AppNav } from "@/components/app-nav";
import { RateTableEditor } from "@/components/admin/rate-table";
import { SourceConnections } from "@/components/admin/source-connections";
import { TruckRegistry } from "@/components/admin/truck-registry";
import { useEvents } from "@/lib/hooks";

/**
 * Admin surface (previously deferred, §1a): event rate table, certified-truck
 * registry, and source connections. Single seeded tenant in this build — the
 * multi-tenant RBAC data layer exists (infra/rbac) but role/invite screens stay
 * on the roadmap.
 */
export default function AdminPage() {
  const events = useEvents();
  const event = events.data?.[0];

  return (
    <>
      <AppNav />
      <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-muted)]">
            LoadTruth · Admin
          </span>
          <h1 className="text-xl font-semibold sm:text-2xl">{event?.name ?? "Loading…"}</h1>
          {event?.location && <p className="text-sm text-[var(--color-muted)]">{event.location}</p>}
        </header>

        {event ? (
          <div className="flex flex-col gap-6">
            <RateTableEditor event={event} />
            <TruckRegistry />
            <SourceConnections eventId={event.id} />
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Loading admin data…</p>
        )}
      </main>
    </>
  );
}
