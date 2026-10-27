"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BellIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/primitives";
import { useEventContext } from "@/lib/event-context";
import { useTickets } from "@/lib/hooks";
import { shortId } from "@/components/console/ticket-metadata";
import { debrisLabel, signedMoney } from "@/lib/format";

/**
 * Notification bell with a working popover. The badge reflects the REAL count of
 * draft (needs-review) tickets for the active event; the popover lists the
 * highest-exposure ones and navigates to the console on click. No fabricated
 * alerts — if nothing needs review, it says so.
 */
export function Notifications() {
  const router = useRouter();
  const { selectedId } = useEventContext();
  const tickets = useTickets({ eventId: selectedId, status: "draft", limit: 50, offset: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const pending = tickets.data?.total ?? 0;
  const items = (tickets.data?.items ?? [])
    .filter((t) => t.valuation.is_overbill)
    .sort(
      (a, b) =>
        Number.parseFloat(b.valuation.delta_dollar_value ?? "0") -
        Number.parseFloat(a.valuation.delta_dollar_value ?? "0"),
    )
    .slice(0, 6);

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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={pending > 0 ? `${pending} tickets awaiting review` : "No tickets awaiting review"}
        className="relative inline-flex size-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:size-8"
      >
        <BellIcon size={16} />
        {pending > 0 && (
          <span
            className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold tabular-nums"
            style={{ backgroundColor: "var(--color-accent-fill)", color: "var(--color-on-accent)" }}
          >
            {pending > 99 ? "99+" : pending}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="lt-card-shadow absolute right-0 top-full z-40 mt-2 w-[min(92vw,340px)] overflow-hidden rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
            <span className="text-[13px] font-semibold text-[var(--color-text)]">
              Needs review
            </span>
            <span className="text-[11px] tabular-nums text-[var(--color-subtle)]">
              {pending} pending
            </span>
          </div>

          {items.length === 0 ? (
            <div className="p-3">
              <EmptyState title="All clear" description="No over-called tickets are waiting." />
            </div>
          ) : (
            <ul className="lt-scroll max-h-[320px] overflow-y-auto">
              {items.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push("/console");
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-2)]"
                  >
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-[13px] font-medium tabular-nums text-[var(--color-text)]">
                        {t.truck_id ?? "Unidentified"}{" "}
                        <span className="text-[var(--color-subtle)]">{shortId(t.id)}</span>
                      </span>
                      <span className="truncate text-[11px] text-[var(--color-muted)]">
                        {debrisLabel(t.debris_class)} · needs review
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-[13px] font-bold tabular-nums"
                      style={{ color: "var(--color-money)" }}
                    >
                      {signedMoney(t.valuation.delta_dollar_value)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/console");
            }}
            className="w-full border-t border-[var(--color-border)] px-3 py-2.5 text-center text-[12px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]"
          >
            Open review console
          </button>
        </div>
      )}
    </div>
  );
}
