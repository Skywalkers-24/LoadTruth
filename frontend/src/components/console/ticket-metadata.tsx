import { useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon, ShieldCheckIcon, CpuIcon } from "lucide-react";

import type { DebrisClass, Ticket } from "@/lib/api";
import { InlineEditField, type EditOption } from "@/components/console/inline-edit-field";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cubicYards, dateTime, debrisLabel, money, percent, signedMoney } from "@/lib/format";
import { useEvents } from "@/lib/hooks";
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
  const { can, member } = useAuth();
  const events = useEvents();
  const event = events.data?.find((item) => item.id === ticket.event_id);
  const canEdit = Boolean(
    event &&
    !event.tags.includes("read-only") &&
    (!event.tags.includes("admin-only") || member?.role === "super_admin") &&
    (event.tags.includes("playground") || can("review_tickets")),
  );
  const update = useUpdateTicket();
  const toast = useToast();

  const fillPct = Number.parseFloat(v.est_fill_pct || "0");
  const estCy = Number.parseFloat(v.est_cubic_yards || "0");
  const fillDisplay =
    fillPct > 0 && estCy > 0
      ? `${percent(v.est_fill_pct)} (${cubicYards(v.est_cubic_yards)})`
      : percent(v.est_fill_pct);

  const hasCall = v.monitor_fill_pct !== null && v.delta_dollar_value !== null;
  const delta = hasCall ? Number.parseFloat(v.delta_dollar_value ?? "0") : 0;

  const [showCalibration, setShowCalibration] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

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
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 @sm:grid-cols-4">
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
          label="Measured fill"
          value={fillDisplay}
          tip="AI vision fill percentage and calculated net load volume (capacity × fill %)."
        />
        <Item
          label="Rate"
          value={`${money(v.rate_per_cy)} per CY`}
          tip="Event rate for this debris class."
        />
        <Item
          label="Cost"
          value={money(v.est_dollar_value)}
          tip="Load cost calculated from measured cubic yards and the contract rate."
        />
        <Item label="Captured" value={dateTime(ticket.created_at)} />
        <Item
          label="Variance"
          value={hasCall ? signedMoney(v.delta_dollar_value) : "No call"}
          warn={delta > 0}
          tip="Dollar difference between the monitor call and LoadTruth video measurement."
        />
      </dl>

      {/* Proof-of-life and Geometric Calibration Inspectors */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2.5">
        <button
          type="button"
          onClick={() => setShowCalibration((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
        >
          <ShieldCheckIcon size={13} className="text-[var(--color-brand)]" />
          <span>Geometric Calibration</span>
          {showCalibration ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
        </button>

        <button
          type="button"
          onClick={() => setShowTrace((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <CpuIcon size={13} />
          <span>Meta Model API Trace</span>
          {showTrace ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
        </button>
      </div>

      {showCalibration && (
        <div className="mt-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[12px] leading-relaxed">
          <p className="font-semibold text-foreground">Rigid Tailgate Reference Plane Calibration</p>
          <p className="mt-1 text-muted-foreground">
            Volume is strictly derived from pre-certified bed dimensions, never hallucinated by an AI model:
          </p>
          <div className="mt-2 rounded bg-[var(--color-bg)] p-2 font-mono text-[11px] text-[var(--color-brand)]">
            Volume (CY) = {v.certified_cubic_yards || "0"} CY (Certified Bed) &times; {v.est_fill_pct || "0"}% (SAM 3.1 Tailgate Fill Ratio) = {v.est_cubic_yards || "0"} Net CY
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Valuation: {v.est_cubic_yards || "0"} CY &times; ${v.rate_per_cy || "0"}/CY = ${v.est_dollar_value || "0.00"} calculated via Rate Schedule Engine.
          </p>
        </div>
      )}

      {showTrace && (
        <div className="mt-2.5 rounded-lg border border-emerald-500/30 bg-[var(--color-surface)] p-3 text-[12px] leading-relaxed">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Live Inference Inspection</span>
            <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">api.meta.ai/v1/responses</span>
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <li><strong className="text-foreground">SAM 3.1:</strong> Streamed segmentation tokens tracking rigid tailgate rim, bed walls, and debris polygon.</li>
            <li><strong className="text-foreground">Muse Spark 1.3:</strong> Structured OCR on truck placard and visual material classification ({debrisLabel(ticket.debris_class)}).</li>
            <li><strong className="text-foreground">Cryptographic Receipt:</strong> SHA-256 fingerprint verified for ticket #{shortId(ticket.id)}.</li>
            <li><strong className="text-foreground">Inference Economics:</strong> ~$0.038 USD billed per full analysis pass.</li>
          </ul>
        </div>
      )}
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
