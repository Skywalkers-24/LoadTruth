import type { ReactNode } from "react";

import type { Ticket } from "@/lib/api";
import { Tooltip } from "@/components/ui/tooltip";
import { cubicYards, dateTime, money } from "@/lib/format";

/**
 * Compact truck and ticket details. Debris class and ticket id already sit in
 * the workspace header, so they are not repeated here.
 */
export function TicketMetadata({ ticket }: { ticket: Ticket }) {
  const v = ticket.valuation;
  return (
    <div className="@container">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 @sm:grid-cols-3 @3xl:grid-cols-6">
        <Item label="Truck" value={ticket.truck_id ?? "Unidentified"} warn={!ticket.truck_id} />
        <Item
          label="Placard"
          value={ticket.truck_id ? "Recognized" : "Needs manual ID"}
          warn={!ticket.truck_id}
        />
        <Item
          label="Certified capacity"
          value={cubicYards(v.certified_cubic_yards)}
          tip="The truck's registered bed volume. Fill percent is applied to this to get cubic yards."
        />
        <Item
          label="Rate"
          value={`${money(v.rate_per_cy)} per CY`}
          tip="Event rate for this debris class."
        />
        <Item label="Captured" value={dateTime(ticket.created_at)} />
        <Item
          label="Evidence"
          value={`${ticket.evidence_frames.length} frame${ticket.evidence_frames.length === 1 ? "" : "s"}`}
        />
      </dl>
    </div>
  );
}

function Item({
  label,
  value,
  tip,
  warn,
}: {
  label: string;
  value: ReactNode;
  tip?: string;
  warn?: boolean;
}) {
  const term = <dt className="text-[12px] text-[var(--color-subtle)]">{label}</dt>;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {tip ? (
        <Tooltip content={tip}>
          <span
            tabIndex={0}
            className="cursor-help border-b border-dotted border-[var(--color-border-strong)]"
          >
            {term}
          </span>
        </Tooltip>
      ) : (
        term
      )}
      <dd
        className="truncate text-[13px] font-medium tabular-nums"
        style={{ color: warn ? "var(--color-warn)" : "var(--color-text)" }}
      >
        {value}
      </dd>
    </div>
  );
}

/** Short, readable ticket id for the dense UI (full id in the title). */
export function shortId(id: string): string {
  return `LT-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
