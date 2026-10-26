import type { ReactNode } from "react";

import type { Ticket } from "@/lib/api";
import { CameraIcon, ClipboardIcon, DollarIcon, LayersIcon, TruckIcon } from "@/components/ui/icons";
import { cubicYards, dateTime, debrisLabel, money } from "@/lib/format";

/**
 * Compact truck + ticket metadata as icon-led rows. Distinguishes verified
 * values (returned by the API) from inferred/missing ones. The API does not
 * return placard confidence, a camera/source name, or a measurement-method
 * version, so those are shown as "not reported" rather than fabricated.
 */
export function TicketMetadata({ ticket }: { ticket: Ticket }) {
  const v = ticket.valuation;
  return (
    <dl className="flex flex-col gap-2.5">
      <Row
        icon={<TruckIcon size={15} />}
        label="Truck"
        value={
          ticket.truck_id ? (
            <>
              {ticket.truck_id}{" "}
              <span className="font-normal text-[var(--color-subtle)]">· placard recognized</span>
            </>
          ) : (
            "Unidentified. Needs manual review"
          )
        }
      />
      <Row
        icon={<LayersIcon size={15} />}
        label="Debris & capacity"
        value={`${debrisLabel(ticket.debris_class)} · ${cubicYards(v.certified_cubic_yards)} certified`}
      />
      <Row icon={<DollarIcon size={15} />} label="Rate" value={`${money(v.rate_per_cy)} / CY`} />
      <Row icon={<ClipboardIcon size={15} />} label="Created" value={dateTime(ticket.created_at)} />
      <Row
        icon={<CameraIcon size={15} />}
        label="Evidence"
        value={
          ticket.evidence_frames.length > 0
            ? `${ticket.evidence_frames.length} frame${ticket.evidence_frames.length === 1 ? "" : "s"}`
            : "No frames captured"
        }
      />
    </dl>
  );
}

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-subtle)]"
        aria-hidden
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">
          {label}
        </dt>
        <dd className="truncate text-[13px] font-medium tabular-nums text-[var(--color-text)]">
          {value}
        </dd>
      </div>
    </div>
  );
}

/** Short, readable ticket id for the dense UI (full id in the title). */
export function shortId(id: string): string {
  return `LT-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
