"use client";

import { useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { RateTableEditor } from "@/components/admin/rate-table";
import { RolesPanel } from "@/components/admin/roles-panel";
import { SourceConnections } from "@/components/admin/source-connections";
import { TruckRegistry } from "@/components/admin/truck-registry";
import { Panel, SectionTitle, ErrorState, Skeleton } from "@/components/ui/primitives";
import { CameraIcon, DollarIcon, TruckIcon, UsersIcon } from "@/components/ui/icons";
import { useEventContext } from "@/lib/event-context";

type Tab = "rates" | "trucks" | "sources" | "roles";

const TABS: { id: Tab; label: string }[] = [
  { id: "rates", label: "Rate table" },
  { id: "trucks", label: "Truck registry" },
  { id: "sources", label: "Source connections" },
  { id: "roles", label: "Users & roles" },
];

/** Admin surface: tabbed sections for rates, trucks, sources, and roles. */
export default function AdminPage() {
  const { selected: event, isLoading, isError } = useEventContext();
  const [tab, setTab] = useState<Tab>("rates");

  return (
    <AppShell section="Admin">
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-0.5">
          <h1 className="text-[20px] font-semibold text-[var(--color-text)]">
            {event?.name ?? "Admin"}
          </h1>
          <p className="text-[13px] text-[var(--color-muted)]">
            Configure rates, trucks, evidence sources, and review the role model.
          </p>
        </header>

        {/* Tab bar */}
        <div
          className="lt-scroll flex gap-1 overflow-x-auto border-b border-[var(--color-border)]"
          role="tablist"
          aria-label="Admin sections"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className="shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors"
                style={{
                  borderColor: active ? "var(--color-accent)" : "transparent",
                  color: active ? "var(--color-text)" : "var(--color-muted)",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {isError ? (
          <ErrorState title="Events unavailable" description="The backend didn’t return any events." />
        ) : isLoading || !event ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            {tab === "rates" && (
              <Panel>
                <SectionTitle icon={<DollarIcon size={16} />} className="mb-4">
                  Rate table ($/CY by debris class)
                </SectionTitle>
                <RateTableEditor event={event} />
              </Panel>
            )}
            {tab === "trucks" && (
              <Panel>
                <SectionTitle icon={<TruckIcon size={16} />} className="mb-4">
                  Certified-truck registry
                </SectionTitle>
                <TruckRegistry />
              </Panel>
            )}
            {tab === "sources" && (
              <Panel>
                <SectionTitle icon={<CameraIcon size={16} />} className="mb-4">
                  Source connections
                </SectionTitle>
                <SourceConnections eventId={event.id} />
              </Panel>
            )}
            {tab === "roles" && (
              <Panel>
                <SectionTitle icon={<UsersIcon size={16} />} className="mb-4">
                  Users &amp; roles
                </SectionTitle>
                <RolesPanel />
              </Panel>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
