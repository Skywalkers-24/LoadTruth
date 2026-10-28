"use client";

import { useState, type ReactNode } from "react";

import { AccessGate } from "@/components/auth/access-gate";
import { AppShell } from "@/components/shell/app-shell";
import { SlidersHorizontalIcon, SparklesIcon } from "lucide-react";

import type { Capabilities } from "@/lib/api";
import { AiModelsPanel } from "@/components/admin/ai-models";
import { PipelineStats } from "@/components/admin/pipeline-stats";
import { RateTableEditor } from "@/components/admin/rate-table";
import { RolesPanel } from "@/components/admin/roles-panel";
import { SourceConnections } from "@/components/admin/source-connections";
import { CameraIcon, DollarIcon, UsersIcon } from "@/components/ui/icons";
import { Card } from "@/components/ui/shadcn/card";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useSources, useUsers } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Tab = "rates" | "sources" | "users" | "models" | "pipeline";

// Each section names the capability it needs. A section with no `cap` is a
// read-only view available to anyone who can reach Settings. The page itself is
// only reachable by a member who can do at least one of these (see AccessGate),
// and each tab is hidden when the member lacks its capability, so the sections a
// member sees match exactly what the backend would let them do.
const SECTIONS: {
  id: Tab;
  label: string;
  blurb: string;
  icon: ReactNode;
  cap?: keyof Capabilities;
}[] = [
  {
    id: "rates",
    label: "Rates",
    blurb: "Price per cubic yard by debris class",
    icon: <DollarIcon size={16} />,
    cap: "manage_events",
  },
  {
    id: "sources",
    label: "Evidence sources",
    blurb: "Storage, cameras, and webhooks",
    icon: <CameraIcon size={16} />,
    cap: "manage_sources",
  },
  {
    id: "users",
    label: "Users and roles",
    blurb: "Who can review and approve",
    icon: <UsersIcon size={16} />,
    cap: "manage_users",
  },
  {
    id: "models",
    label: "AI models",
    blurb: "Model, effort, and cost per task",
    icon: <SlidersHorizontalIcon size={16} />,
    cap: "manage_events",
  },
  {
    id: "pipeline",
    label: "AI pipeline",
    blurb: "Models, cache, and spend",
    icon: <SparklesIcon size={16} />,
  },
];

/** Admin: settings-style layout with a section list and a focused content pane. */
export default function AdminPage() {
  const { selected: event, isLoading, isError } = useEventContext();
  const { can } = useAuth();
  const sections = SECTIONS.filter((s) => !s.cap || can(s.cap));
  // Default to the first section this member can actually see.
  const [tab, setTab] = useState<Tab | null>(null);
  const canManageUsers = can("manage_users");
  const canManageSources = can("manage_sources");
  const users = useUsers(canManageUsers);
  const sources = useSources(canManageSources ? event?.id : undefined);

  const counts: Partial<Record<Tab, number | undefined>> = {
    users: canManageUsers ? users.data?.length : undefined,
    sources: canManageSources ? sources.data?.length : undefined,
  };
  const active = sections.find((s) => s.id === tab) ?? sections[0]!;

  return (
    <AccessGate
      anyOf={["manage_events", "manage_sources", "manage_users"]}
      section="Settings"
      message="Workspace settings require admin access. Ask an admin if you need it."
    >
      <AppShell section="Settings" fluid>
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-col">
            <h1 className="lt-page-title">Workspace settings</h1>
            <p className="text-[12px] text-muted-foreground">
              {event ? `Configuration for ${event.name}.` : "Configuration for the active event."}
            </p>
          </div>

          {isError ? (
            <ErrorState
              title="Events unavailable"
              description="The server did not return any events."
            />
          ) : isLoading || !event ? (
            <Skeleton className="h-80 rounded-xl" />
          ) : (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_1fr]">
              <nav
                aria-label="Settings sections"
                className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
              >
                {sections.map((s) => {
                  const isActive = s.id === active.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setTab(s.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors lg:w-full",
                        isActive
                          ? "border-[var(--color-brand)]/40 bg-[var(--color-brand-soft)]"
                          : "border-transparent hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg",
                          isActive
                            ? "bg-[var(--color-brand-fill)] text-white"
                            : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {s.icon}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="text-[13px] font-semibold text-foreground">{s.label}</span>
                        <span className="mt-0.5 hidden text-[12px] text-muted-foreground lg:block">
                          <span className="line-clamp-2">{s.blurb}</span>
                        </span>
                      </span>
                      {counts[s.id] !== undefined && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                          {counts[s.id]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <Card className="min-h-0 gap-0 overflow-hidden py-0">
                <header className="flex items-center gap-3 border-b border-border px-5 py-4">
                  <span className="text-[var(--color-brand)]">{active.icon}</span>
                  <div className="flex flex-col">
                    <h2 className="text-[15px] font-semibold text-foreground">{active.label}</h2>
                    <span className="text-[12px] text-muted-foreground">{active.blurb}</span>
                  </div>
                </header>
                <div
                  key={active.id}
                  className="lt-fade-in lt-fab-safe lt-scroll min-h-0 flex-1 overflow-y-auto p-5"
                >
                  {active.id === "rates" && <RateTableEditor event={event} />}
                  {active.id === "sources" && <SourceConnections eventId={event.id} />}
                  {active.id === "users" && <RolesPanel />}
                  {active.id === "models" && <AiModelsPanel />}
                  {active.id === "pipeline" && <PipelineStats />}
                </div>
              </Card>
            </div>
          )}
        </div>
      </AppShell>
    </AccessGate>
  );
}
