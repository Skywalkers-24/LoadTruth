"use client";

import type { TicketStatus } from "@/lib/api";
import { SearchIcon } from "@/components/ui/icons";

export type StatusFilter = TicketStatus | "all";
export type SortKey = "newest" | "delta" | "severity";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Needs review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "overridden", label: "Overridden" },
  { value: "disputed", label: "Disputed" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "delta", label: "Highest $ delta" },
  { value: "severity", label: "Most flags" },
];

/** Queue filter bar: free-text search, status segmented filter, and sort. */
export function QueueFilters({
  search,
  onSearch,
  status,
  onStatus,
  sort,
  onSort,
}: {
  search: string;
  onSearch: (v: string) => void;
  status: StatusFilter;
  onStatus: (v: StatusFilter) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-subtle)]">
          <SearchIcon size={15} />
        </span>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search truck or ticket ID…"
          aria-label="Search by truck ID or ticket ID"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-8 pr-3 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onStatus(f.value)}
              className="rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                backgroundColor: active ? "var(--color-accent-soft)" : "var(--color-surface)",
                color: active ? "var(--color-text)" : "var(--color-muted)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="queue-sort" className="text-[11px] text-[var(--color-subtle)]">
          Sort
        </label>
        <select
          id="queue-sort"
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-[var(--color-subtle)]">within the current page</span>
      </div>
    </div>
  );
}
