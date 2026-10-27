"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { ChevronDownIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "loadtruth-console-section:";

/** Badge tone for the header count (e.g. red when anomaly flags are present). */
type CountTone = "neutral" | "danger";

interface SectionCardProps {
  title: string;
  icon: ReactNode;
  count?: number;
  countTone?: CountTone;
  /** Extra header content, right-aligned (e.g. a model chip). */
  aside?: ReactNode;
  /** Tighter padding, for cards that share a column with the queue. */
  dense?: boolean;
  className?: string;
  children: ReactNode;
}

/** A static console card: icon + title header over a padded body. */
export function SectionCard({
  title,
  icon,
  count,
  countTone = "neutral",
  aside,
  dense = false,
  className,
  children,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "lt-card-shadow rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]",
        className,
      )}
    >
      <header
        className={cn(
          "lt-card-head border-b border-[var(--color-border)]",
          dense && "lt-card-head--dense",
        )}
      >
        <span className="text-[var(--color-subtle)]">{icon}</span>
        <h3 className="lt-card-title">{title}</h3>
        <CountBadge count={count} tone={countTone} />
        {aside && <span className="ml-auto">{aside}</span>}
      </header>
      <div className={dense ? "lt-card-body--dense" : "lt-card-body"}>{children}</div>
    </section>
  );
}

/**
 * A console card the reviewer can collapse to a one-line summary. The open or
 * closed choice is remembered per section (localStorage), so a reviewer who
 * hides the AI trace once keeps it hidden across tickets and reloads.
 */
export function CollapsibleSectionCard({
  id,
  title,
  icon,
  count,
  countTone = "neutral",
  aside,
  summary,
  defaultOpen = true,
  className,
  children,
}: SectionCardProps & {
  /** Stable key for remembering the open state. */
  id: string;
  /** One-line summary shown in the header while collapsed. */
  summary?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const storageKey = STORAGE_PREFIX + id;

  // Read the remembered state after mount so server and client render the same
  // markup first (no hydration mismatch).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "1" || stored === "0") setOpen(stored === "1");
    } catch {
      /* storage unavailable: keep the default */
    }
  }, [storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* storage unavailable: state still toggles for this session */
      }
      return next;
    });
  }

  return (
    <section
      className={cn(
        "lt-card-shadow rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]",
        className,
      )}
    >
      <header className={cn("lt-card-head", open && "border-b border-[var(--color-border)]")}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <span className="shrink-0 self-start pt-px text-[var(--color-subtle)]">{icon}</span>
          {/* The collapsed summary wraps under the title instead of being cut
              off with an ellipsis in narrow columns. */}
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <h3 className="lt-card-title">{title}</h3>
              <CountBadge count={count} tone={countTone} />
            </span>
            {!open && summary && (
              <span className="mt-0.5 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
                {summary}
              </span>
            )}
          </span>
          <ChevronDownIcon
            size={15}
            className={cn(
              "ml-auto shrink-0 text-[var(--color-subtle)] transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>
        {aside && open && <span className="shrink-0">{aside}</span>}
      </header>
      {open && (
        <div id={bodyId} className="lt-card-body">
          {children}
        </div>
      )}
    </section>
  );
}

function CountBadge({ count, tone }: { count?: number; tone: CountTone }) {
  if (count === undefined || count <= 0) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        tone === "danger"
          ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
          : "bg-[var(--color-surface-3)] text-[var(--color-muted-foreground)]",
      )}
    >
      {count}
    </span>
  );
}
