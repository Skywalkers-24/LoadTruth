"use client";

import { useEffect, useRef } from "react";

import type { TicketStatus } from "@/lib/api";
import { SearchIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { isTypingTarget } from "@/lib/use-media-query";

export type StatusFilter = TicketStatus | "all";
export type SortKey = "newest" | "delta" | "severity";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "draft", label: "Needs review" },
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "overridden", label: "Overridden" },
  { value: "disputed", label: "Disputed" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "delta", label: "Highest delta" },
  { value: "severity", label: "Most flags" },
];

/** Display label for a status filter (used by the queue header subtitle). */
export function statusFilterLabel(status: StatusFilter): string {
  return STATUS_FILTERS.find((f) => f.value === status)?.label ?? "All";
}

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[12px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none";

/**
 * Queue filters: search (press / to focus), sort, and status. The default
 * layout is a search + sort row over a status segmented control. `compact`
 * fits a narrow queue column: search always visible, and status and sort as
 * two selects shown only when `showControls` is on.
 */
export function QueueFilters({
  search,
  onSearch,
  status,
  onStatus,
  sort,
  onSort,
  compact = false,
  showControls = true,
}: {
  search: string;
  onSearch: (v: string) => void;
  status: StatusFilter;
  onStatus: (v: StatusFilter) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  compact?: boolean;
  showControls?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchBox = (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-subtle)]">
        <SearchIcon size={compact ? 14 : 15} />
      </span>
      <input
        ref={inputRef}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (onSearch(""), e.currentTarget.blur())}
        placeholder="Filter tickets"
        aria-label="Filter by truck or ticket ID"
        className={`w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] pl-8 pr-8 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none ${compact ? "h-8" : "h-9"}`}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 lg:block">
        <Kbd>/</Kbd>
      </span>
    </div>
  );

  const sortSelect = (
    <select
      value={sort}
      onChange={(e) => onSort(e.target.value as SortKey)}
      aria-label="Sort queue"
      className={
        compact
          ? SELECT_CLASS
          : "h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-[12px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
      }
    >
      {SORTS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5">
        {searchBox}
        {showControls && (
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={status}
              onChange={(e) => onStatus(e.target.value as StatusFilter)}
              aria-label="Filter by status"
              className={SELECT_CLASS}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            {sortSelect}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        {searchBox}
        {sortSelect}
      </div>

      <div
        className="lt-scroll -mx-0.5 flex gap-1 overflow-x-auto rounded-lg bg-[var(--color-surface-2)] p-1"
        role="tablist"
        aria-label="Filter by status"
      >
        {STATUS_FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onStatus(f.value)}
              className="shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all"
              style={{
                backgroundColor: active ? "var(--color-surface)" : "transparent",
                color: active ? "var(--color-text)" : "var(--color-muted-foreground)",
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0.25)" : undefined,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
