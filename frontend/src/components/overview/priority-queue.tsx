"use client";

import { useRouter } from "next/navigation";
import { ChevronRightIcon, TruckIcon } from "lucide-react";

import type { Ticket } from "@/lib/api";
import { shortId } from "@/components/console/ticket-metadata";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { debrisLabel, relativeTime, signedMoney } from "@/lib/format";

/**
 * Priority queue: over-called tickets still awaiting a decision, ranked by the
 * dollar value at stake. Each row opens that ticket in the Review Console.
 * `bare` renders just the list (no outer card), for embedding in a panel.
 */
export function PriorityQueue({
  tickets,
  isLoading,
  bare = false,
}: {
  tickets: Ticket[];
  isLoading: boolean;
  bare?: boolean;
}) {
  const router = useRouter();
  const rows = tickets
    .filter((t) => t.valuation.is_overbill && t.status === "draft")
    .sort(
      (a, b) =>
        Number.parseFloat(b.valuation.delta_dollar_value ?? "0") -
        Number.parseFloat(a.valuation.delta_dollar_value ?? "0"),
    );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <p className="text-[13px] text-muted-foreground">No over-called tickets are awaiting review.</p>
      </div>
    );
  }

  const list = (
    <ul className="flex flex-col">
      {rows.map((t, i) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => router.push(`/console?ticket=${t.id}`)}
            className="group grid w-full grid-cols-[18px_1fr_auto_16px] items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
          >
            <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px] font-semibold tabular-nums">{shortId(t.id)}</span>
              <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <TruckIcon className="size-3 shrink-0" />
                <span className="tabular-nums">{t.truck_id ?? "Unidentified"}</span>
                <span className="opacity-60">·</span>
                {debrisLabel(t.debris_class)}
                <span className="hidden opacity-60 sm:inline">· {relativeTime(t.created_at)}</span>
              </span>
            </span>
            <span className="text-right text-[14px] font-bold tabular-nums text-[var(--color-money)]">
              {signedMoney(t.valuation.delta_dollar_value)}
            </span>
            <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        </li>
      ))}
    </ul>
  );

  if (bare) return list;

  return (
    <section className="rounded-xl border bg-card p-2">{list}</section>
  );
}
