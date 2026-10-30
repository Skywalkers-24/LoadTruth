import type { ReactNode } from "react";

import type { DebrisClass, Ticket } from "@/lib/api";
import { InlineEditField, type EditOption } from "@/components/console/inline-edit-field";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cubicYards, dateTime, debrisLabel, money } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useUpdateTicket } from "@/lib/hooks";

const DEBRIS_OPTIONS: EditOption[] = (
  ["vegetative", "construction_demolition", "white_goods", "hazardous", "other"] as DebrisClass[]
).map((v) => ({ value: v, label: debrisLabel(v) }));

/**
 * Compact truck and ticket details. The truck ID and debris class are
 * inline-editable here (with review rights): correcting them re-derives the
 * certified capacity / rate and the dollar math on the server.
 */
export function TicketMetadata({ ticket }: { ticket: Ticket }) {
  const v = ticket.valuation;
  const { can } = useAuth();
  const canEdit = can("review_tickets");
  const update = useUpdateTicket();
  const toast = useToast();

  async function saveTruck(next: string) {
    try {
      await update.mutateAsync({ id: ticket.id, body: { truck_id: next || null } });
      toast.push("ok", next ? `Truck set to ${next}.` : "Truck cleared.");
    } catch {
      toast.push("danger", "Could not update the truck.");
      throw new Error("update failed");
    }
  }

  async function saveDebris(next: string) {
    try {
      await update.mutateAsync({ id: ticket.id, body: { debris_class: next as DebrisClass } });
      toast.push("ok", `Debris class set to ${debrisLabel(next)}. Value recomputed.`);
    } catch {
      toast.push("danger", "Could not update the debris class.");
      throw new Error("update failed");
    }
  }

  return (
    <div className="@container">
      {/* One row of six once there is room (a 13-inch laptop's center column),
          so the record stays one line tall and the evidence keeps the height. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 @sm:grid-cols-3 @[44rem]:grid-cols-6 @[44rem]:gap-x-3">
        <Item
          label="Truck"
          tip="The identified truck. Edit to set or correct it; this re-derives the certified capacity."
        >
          <InlineEditField
            value={ticket.truck_id ?? ""}
            display={ticket.truck_id ?? "Unidentified"}
            placeholder="e.g. FL-DT-0001"
            ariaLabel="truck ID"
            warn={!ticket.truck_id}
            canEdit={canEdit}
            onSave={saveTruck}
          />
        </Item>
        <Item
          label="Debris class"
          tip="The load classification. It sets the per cubic yard rate; changing it recomputes the value."
        >
          <InlineEditField
            value={ticket.debris_class}
            display={debrisLabel(ticket.debris_class)}
            options={DEBRIS_OPTIONS}
            ariaLabel="debris class"
            canEdit={canEdit}
            onSave={saveDebris}
          />
        </Item>
        <Item
          label="Certified capacity"
          value={
            ticket.truck_id && Number.parseFloat(v.certified_cubic_yards) > 0
              ? cubicYards(v.certified_cubic_yards)
              : "Not matched"
          }
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
  children,
}: {
  label: string;
  value?: ReactNode;
  tip?: string;
  warn?: boolean;
  children?: ReactNode;
}) {
  const term = (
    <span
      className={
        tip
          ? "cursor-help border-b border-dotted border-[var(--color-border-strong)] text-[12px] text-[var(--color-subtle)]"
          : "text-[12px] text-[var(--color-subtle)]"
      }
    >
      {label}
    </span>
  );
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt>{tip ? <Tooltip content={tip}>{term}</Tooltip> : term}</dt>
      <dd className="min-w-0">
        {children ?? (
          <span
            className="truncate text-[13px] font-medium tabular-nums"
            style={{ color: warn ? "var(--color-warn)" : "var(--color-text)" }}
          >
            {value}
          </span>
        )}
      </dd>
    </div>
  );
}

/** Short, readable ticket id for the dense UI (full id in the title). */
export function shortId(id: string): string {
  return `LT-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
