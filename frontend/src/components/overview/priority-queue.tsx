"use client";

import Link from "next/link";

import type { Ticket } from "@/lib/api";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon } from "@/components/ui/icons";
import { EmptyState, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { shortId } from "@/components/console/ticket-metadata";
import { cubicYards, debrisLabel, percent, relativeTime, signedMoney } from "@/lib/format";

/**
 * Priority action queue for the Overview dashboard: the highest-dollar
 * over-called tickets that still need review, newest deltas first. Real tickets
 * only — each row links into the review console. No fabricated contractors.
 */
export function PriorityQueue({
  tickets,
  isLoading,
}: {
  tickets: Ticket[];
  isLoading: boolean;
}) {
  // Over-called + not yet reviewed, ranked by dollar delta.
  const rows = tickets
    .filter((t) => t.valuation.is_overbill && t.status === "draft")
    .sort(
      (a, b) =>
        Number.parseFloat(b.valuation.delta_dollar_value ?? "0") -
        Number.parseFloat(a.valuation.delta_dollar_value ?? "0"),
    )
    .slice(0, 6);

  return (
    <div className="lt-card-shadow flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <SectionTitle>Priority action queue</SectionTitle>
        <Link href="/console">
          <Button variant="ghost" size="sm" className="text-[var(--color-accent)]">
            Open review console <ChevronRightIcon size={14} />
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="Nothing needs attention"
            description="No over-called tickets are awaiting review for this event."
          />
        </div>
      ) : (
        <div className="lt-scroll overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-subtle)]">
                <th className="px-4 py-2.5 text-left font-semibold">Ticket</th>
                <th className="px-4 py-2.5 text-left font-semibold">Truck</th>
                <th className="px-4 py-2.5 text-left font-semibold">Debris</th>
                <th className="px-4 py-2.5 text-right font-semibold">Dollar delta</th>
                <th className="px-4 py-2.5 text-left font-semibold">Created</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href="/console"
                      className="flex items-center gap-2 font-medium tabular-nums text-[var(--color-text)] hover:text-[var(--color-accent)]"
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: "var(--color-money)" }}
                        aria-hidden
                      />
                      {shortId(t.id)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">
                    {t.truck_id ?? "Unidentified"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">
                    {debrisLabel(t.debris_class)} · {percent(t.valuation.est_fill_pct)} ·{" "}
                    {cubicYards(t.valuation.est_cubic_yards)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right font-semibold tabular-nums"
                    style={{ color: "var(--color-money)" }}
                  >
                    {signedMoney(t.valuation.delta_dollar_value)}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-[var(--color-subtle)]">
                    {relativeTime(t.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
