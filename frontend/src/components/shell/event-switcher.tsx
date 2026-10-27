"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { orgFromEvent, useEventContext } from "@/lib/event-context";

/**
 * Organization + disaster-event context selector for the left rail. Trigger
 * shows the active org/event compactly; the popover presents org context and a
 * searchable event list. Selection updates shared query state across routes.
 */
export function EventSwitcher() {
  const { events, selected, selectedId, setSelectedId, isLoading, isError } = useEventContext();
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

  const { org } = orgFromEvent(selected);
  const initials = org.slice(0, 2).toUpperCase();
  const filtered = events.filter((e) =>
    `${e.name} ${e.location ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  if (isLoading) return <Skeleton className="h-12 w-full rounded-lg" />;

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
            {isError ? "Events unavailable" : (selected?.name ?? "Select an event")}
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

      {open && (
        <div
          role="dialog"
          aria-label="Switch event"
          className="lt-card-shadow absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)]"
        >
          {/* Org header */}
          <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-bold"
              style={{ backgroundColor: "var(--color-accent-fill)", color: "var(--color-on-accent)" }}
              aria-hidden
            >
              {initials}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[12px] font-semibold text-[var(--color-text)]">{org}</span>
              <span className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
                Organization
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
                        style={active ? { backgroundColor: "var(--color-accent-soft)" } : undefined}
                      >
                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                          <span className="truncate text-[13px] font-medium text-[var(--color-text)]">
                            {e.name}
                          </span>
                          {e.location && (
                            <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                              {e.location}
                            </span>
                          )}
                        </span>
                        <Badge tone={e.status === "active" ? "ok" : "neutral"}>{e.status}</Badge>
                        {active && (
                          <span className="text-[var(--color-accent)]" aria-hidden>
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
      )}
    </div>
  );
}
