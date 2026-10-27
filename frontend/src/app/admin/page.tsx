"use client";

import { useState, type ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { RateTableEditor } from "@/components/admin/rate-table";
import { RolesPanel } from "@/components/admin/roles-panel";
import { SourceConnections } from "@/components/admin/source-connections";
import { TruckRegistry } from "@/components/admin/truck-registry";
import { CameraIcon, DollarIcon, TruckIcon, UsersIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { useEventContext } from "@/lib/event-context";
import { useSources, useTrucks, useUsers } from "@/lib/hooks";

type Tab = "rates" | "trucks" | "sources" | "users";

const SECTIONS: { id: Tab; label: string; blurb: string; icon: ReactNode }[] = [
  { id: "rates", label: "Rates", blurb: "Price per cubic yard by debris class", icon: <DollarIcon size={16} /> },
  { id: "trucks", label: "Truck registry", blurb: "Certified trucks and bed capacity", icon: <TruckIcon size={16} /> },
  { id: "sources", label: "Evidence sources", blurb: "Storage, cameras, and webhooks", icon: <CameraIcon size={16} /> },
  { id: "users", label: "Users and roles", blurb: "Who can review and approve", icon: <UsersIcon size={16} /> },
];

/** Admin: settings-style layout with a section list and a focused content pane. */
export default function AdminPage() {
  const { selected: event, isLoading, isError } = useEventContext();
  const [tab, setTab] = useState<Tab>("rates");
  const trucks = useTrucks();
  const users = useUsers();
  const sources = useSources(event?.id);

  const counts: Partial<Record<Tab, number | undefined>> = {
    trucks: trucks.data?.length,
    users: users.data?.length,
    sources: sources.data?.length,
  };
  const active = SECTIONS.find((s) => s.id === tab)!;

  return (
    <AppShell section="Admin">
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Admin"
          title="Workspace settings"
          description={event ? `Configuration for ${event.name}.` : "Configuration for the active event."}
        />

        {isError ? (
          <ErrorState title="Events unavailable" description="The server did not return any events." />
        ) : isLoading || !event ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
            <nav aria-label="Settings sections" className="lt-scroll -mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {SECTIONS.map((s) => {
                const isActive = s.id === tab;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setTab(s.id)}
                    aria-current={isActive ? "page" : undefined}
                    className="flex shrink-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors lg:w-full"
                    style={{
                      borderColor: isActive ? "color-mix(in srgb, var(--color-accent) 45%, var(--color-border))" : "transparent",
                      backgroundColor: isActive ? "var(--color-accent-soft)" : undefined,
                    }}
                  >
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-md"
                      style={{
                        color: isActive ? "var(--color-accent)" : "var(--color-subtle)",
                        backgroundColor: isActive ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : "var(--color-surface-2)",
                      }}
                    >
                      {s.icon}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="text-[13px] font-semibold text-[var(--color-text)]">{s.label}</span>
                      <span className="mt-0.5 hidden text-[12px] text-[var(--color-subtle)] lg:block">
                        <span className="line-clamp-2">{s.blurb}</span>
                      </span>
                    </span>
                    {counts[s.id] !== undefined && (
                      <span className="rounded-full bg-[var(--color-surface-3)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-muted)]">
                        {counts[s.id]}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <section className="lt-card-shadow min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
                <span className="text-[var(--color-accent)]">{active.icon}</span>
                <div className="flex flex-col">
                  <h2 className="text-[15px] font-semibold text-[var(--color-text)]">{active.label}</h2>
                  <span className="text-[12px] text-[var(--color-subtle)]">{active.blurb}</span>
                </div>
              </header>
              <div key={tab} className="lt-fade-in p-5">
                {tab === "rates" && <RateTableEditor event={event} />}
                {tab === "trucks" && <TruckRegistry />}
                {tab === "sources" && <SourceConnections eventId={event.id} />}
                {tab === "users" && <RolesPanel />}
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
