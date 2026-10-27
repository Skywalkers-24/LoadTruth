"use client";

/** Compact offset/limit pager. Shows the current range and prev/next controls. */
export function Pagination({
  total,
  limit,
  offset,
  onOffset,
}: {
  total: number;
  limit: number;
  offset: number;
  onOffset: (next: number) => void;
}) {
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
      <span className="tabular-nums">
        {start} to {end} of {total}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onOffset(Math.max(0, offset - limit))}
          disabled={!canPrev}
          className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[var(--color-text)] disabled:opacity-40 hover:enabled:border-[var(--color-accent)]"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => onOffset(offset + limit)}
          disabled={!canNext}
          className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[var(--color-text)] disabled:opacity-40 hover:enabled:border-[var(--color-accent)]"
        >
          Next
        </button>
      </div>
    </div>
  );
}
