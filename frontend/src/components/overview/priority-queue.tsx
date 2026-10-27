"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { Ticket } from "@/lib/api";
import { FillGauge } from "@/components/console/fill-gauge";
import { shortId } from "@/components/console/ticket-metadata";
import { ChevronRightIcon, TruckIcon } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { debrisLabel, relativeTime, signedMoney } from "@/lib/format";

/**
 * Priority queue: over-called tickets still awaiting a decision, ranked by the
 * dollar value at stake. Each row opens that ticket in the Review Console.
 */
export function PriorityQueue({ tickets, isLoading }: { tickets: Ticket[]; isLoading: boolean }) {
  const router = useRouter();
  const rows = tickets
    .filter((t) => t.valuation.is_overbill && t.status === "draft")
    .sort(
      (a, b) =>
        Number.parseFloat(b.valuation.delta_dollar_value ?? "0") -
        Number.parseFloat(a.valuation.delta_dollar_value ?? "0"),
    )
    .slice(0, 6);

  return (
    <section className="lt-card-shadow overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex flex-col">
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Highest value to review</h3>
          <span className="text-[12px] text-[var(--color-subtle)]">Over-called tickets awaiting a decision</span>
        </div>
        <Link
          href="/console"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
        >
          View all <ChevronRightIcon size={14} />
        </Link>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nothing needs attention" description="No over-called tickets are awaiting review." />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => router.push(`/console?ticket=${t.id}`)}
                className="group grid w-full grid-cols-[24px_1fr_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-2)] sm:grid-cols-[24px_minmax(0,1.2fr)_minmax(0,1fr)_110px_20px]"
              >
                <span className="text-[12px] font-semibold tabular-nums text-[var(--color-subtle)]">{i + 1}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-semibold tabular-nums text-[var(--color-text)]">{shortId(t.id)}</span>
                  <span className="flex items-center gap-1.5 truncate text-[12px] text-[var(--color-muted)]">
                    <TruckIcon size={12} className="shrink-0 text-[var(--color-subtle)]" />
                    <span className="tabular-nums">{t.truck_id ?? "Unidentified"}</span>
                    <span className="text-[var(--color-subtle)]">·</span>
                    {debrisLabel(t.debris_class)}
                    <span className="hidden text-[var(--color-subtle)] sm:inline">· {relativeTime(t.created_at)}</span>
                  </span>
                </span>
                <FillGauge
                  measured={Number.parseFloat(t.valuation.est_fill_pct)}
                  monitor={t.valuation.monitor_fill_pct !== null ? Number.parseFloat(t.valuation.monitor_fill_pct) : null}
                  className="hidden sm:flex"
                />
                <span className="text-right text-[15px] font-bold tabular-nums text-[var(--color-money)]">
                  {signedMoney(t.valuation.delta_dollar_value)}
                </span>
                <ChevronRightIcon
                  size={16}
                  className="hidden text-[var(--color-subtle)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-text)] sm:block"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
