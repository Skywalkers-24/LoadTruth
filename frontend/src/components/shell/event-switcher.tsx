"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { orgFromEvent, useEventContext } from "@/lib/event-context";
import { cn } from "@/lib/utils";

const WORKSPACE_ORDER = [
  "60cdc03c-ae67-4ff3-a482-6e6f08372dff",
  "9041997f-3d84-475a-863c-5efe36273d75",
  "5152264c-5a7f-485b-990b-6f8f23bcb7c4",
  "7dcdd0cf-1e3b-434d-b163-85091762a376",
];

/**
 * Disaster-event context selector. `compact` renders a top-bar-styled trigger
 * (light surface, single line) for the header; the default renders the fuller
 * rail/drawer trigger. The popover presents org context and a searchable list.
 */
export function EventSwitcher({ compact = false }: { compact?: boolean }) {
  const { events, selected, selectedId, setSelectedId, isLoading, isError, isWakingUp } =
    useEventContext();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { org, scope } = orgFromEvent(selected);
  const initials = org.slice(0, 2).toUpperCase();
  const filtered = events.filter((e) =>
    `${e.name} ${e.location ?? ""} ${(e.tags ?? []).join(" ")}`
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  );
  filtered.sort((a, b) => {
    const aOrder = WORKSPACE_ORDER.indexOf(a.id);
    const bOrder = WORKSPACE_ORDER.indexOf(b.id);
    return (
      (aOrder < 0 ? WORKSPACE_ORDER.length : aOrder) -
        (bOrder < 0 ? WORKSPACE_ORDER.length : bOrder) || a.name.localeCompare(b.name)
    );
  });

  if (isLoading)
    return <Skeleton className={compact ? "h-9 w-72 rounded-lg" : "h-12 w-full rounded-lg"} />;

  if (compact) {
    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Switch event: ${selected?.name ?? "Select an event"}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:border-[var(--color-brand)]"
        >
          <span
            className="grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white"
            style={{ backgroundColor: "var(--color-brand-fill)" }}
            aria-hidden
          >
            {initials}
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-none">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {isError
                ? isWakingUp
                  ? "Backend waking up…"
                  : "Events unavailable"
                : (selected?.name ?? "Select an event")}
            </span>
          </span>
          {selected?.tags.includes("read-only") && <Badge tone="neutral">View only</Badge>}
          <ChevronDownIcon
            size={15}
            className="shrink-0 text-muted-foreground transition-transform"
            style={open ? { transform: "rotate(180deg)" } : undefined}
          />
        </button>
        {open && <Popover />}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2 text-left transition-colors hover:border-[var(--color-brand)]"
      >
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white"
          style={{ backgroundColor: "var(--color-brand-fill)" }}
          aria-hidden
        >
          {initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="line-clamp-2 text-[13px] font-semibold text-sidebar-foreground">
            {isError
              ? isWakingUp
                ? "Backend waking up…"
                : "Events unavailable"
              : (selected?.name ?? "Select an event")}
          </span>
          <span className="truncate text-[11px] text-sidebar-muted">
            {selected?.location ?? org}
          </span>
        </span>
        <ChevronDownIcon
          size={16}
          className="shrink-0 text-sidebar-muted transition-transform"
          style={open ? { transform: "rotate(180deg)" } : undefined}
        />
      </button>
      {open && <Popover />}
    </div>
  );

  function Popover() {
    return (
      <div
        role="dialog"
        aria-label="Switch event"
        className={cn(
          "lt-card-shadow absolute left-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl",
          compact ? "w-[440px] sm:w-[480px] max-w-[calc(100vw-2rem)]" : "left-0 right-0",
        )}
      >
        {/* Org header */}
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
            style={{ backgroundColor: "var(--color-brand-fill)" }}
            aria-hidden
          >
            {initials}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[12px] font-semibold text-[var(--color-text)]">
              {org}
            </span>
            {scope && <span className="text-[10px] text-[var(--color-subtle)]">{scope}</span>}
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
              ORGANIZATION
            </span>
          </span>
        </div>

        {/* Event search + list */}
        <div className="p-2">
          {events.length > 4 && (
            <div className="relative mb-2">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-subtle)]">
                <SearchIcon size={14} />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search events…"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-8 pr-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
                autoFocus
              />
            </div>
          )}

          {isError ? (
            <EmptyState title="Events unavailable" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No matching events" />
          ) : (
            <ul className="lt-scroll flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {filtered.map((e) => {
                const active = e.id === selectedId;
                const eventStatus = e.status || "active";
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(e.id);
                        setOpen(false);
                        setQ("");
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)]"
                      style={active ? { backgroundColor: "var(--color-brand-soft)" } : undefined}
                    >
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="text-[13px] font-medium leading-snug text-[var(--color-text)]">
                          {e.name}
                        </span>
                        {e.location && (
                          <span className="text-[11px] text-[var(--color-muted-foreground)]">
                            {e.location}
                          </span>
                        )}
                        {e.tags?.length > 0 && eventTagBadges(e.tags).length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {eventTagBadges(e.tags).map((tag) => (
                              <Badge key={tag.key} tone={tag.tone}>
                                {tag.label}
                              </Badge>
                            ))}
                          </span>
                        )}
                        {e.tags?.includes("synthetic-demo") && (
                          <span className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                            Historical demo dataset · synthetic records, not official government
                            data
                          </span>
                        )}
                      </span>
                      <Badge tone={eventStatus === "active" ? "ok" : "neutral"}>
                        {eventStatus.charAt(0).toUpperCase() + eventStatus.slice(1)}
                      </Badge>
                      {active && (
                        <span className="text-[var(--color-brand)]" aria-hidden>
                          <CheckIcon size={15} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }
}

function eventTagBadges(tags: string[]) {
  const badges: {
    key: string;
    label: string;
    tone: "neutral" | "accent" | "ok" | "info" | "violet";
  }[] = [];
  if (tags.includes("dataset-1") || tags.includes("dataset-2")) {
    badges.push({ key: "dataset", label: "Dataset", tone: "accent" });
  } else if (tags.includes("judge") || tags.includes("benchmarked") || tags.includes("benchmark")) {
    badges.push({
      key: "judge-benchmarked",
      label: tags.includes("judge")
        ? "Judge benchmarked"
        : tags.includes("benchmark-50")
          ? "50-video benchmark"
          : "Benchmarked",
      tone: "ok",
    });
  }
  if (tags.includes("meta-processed-muse")) {
    badges.push({ key: "meta-processed-muse", label: "Muse • Meta AI", tone: "violet" });
  } else if (tags.includes("meta-processed")) {
    badges.push({ key: "meta-processed", label: "Meta processed", tone: "info" });
  }
  if (tags.includes("muse-medium")) {
    badges.push({ key: "muse-medium", label: "Muse · medium", tone: "accent" });
  }
  if (tags.includes("playground"))
    badges.push({ key: "playground", label: "Training", tone: "accent" });
  if (tags.includes("admin-only"))
    badges.push({ key: "admin-only", label: "Admin only", tone: "neutral" });
  if (tags.includes("read-only")) {
    badges.push({ key: "read-only", label: "View only", tone: "neutral" });
  }
  return badges;
}
