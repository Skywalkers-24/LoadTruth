"use client";

import type { Ticket } from "@/lib/api";
import { AnomalyBadge, StatusBadge } from "@/components/ui/badge";
import { Divider, Panel, SectionTitle } from "@/components/ui/primitives";
import { DollarIcon, TruckIcon } from "@/components/ui/icons";
import { AnomalyList } from "@/components/console/anomaly-list";
import { EvidenceCanvas } from "@/components/console/evidence-canvas";
import { MoneyFrame } from "@/components/console/money-frame";
import { ReviewActions } from "@/components/console/review-actions";
import { TicketMetadata, shortId } from "@/components/console/ticket-metadata";

/**
 * Right-side evidence/review workspace for the selected ticket. The evidence
 * canvas and the money frame get the most space; metadata, anomalies, and the
 * review controls fill the side rail. Stacks to a single column on narrow views.
 */
export function ReviewWorkspace({ ticket }: { ticket: Ticket }) {
  const reviewed = ticket.status !== "draft";
  return (
    <div className="flex flex-col gap-4">
      {/* Header: ids + status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-[17px] font-semibold tabular-nums text-[var(--color-text)]">
            {ticket.truck_id ?? "Unidentified truck"}
          </span>
          <span className="text-[13px] tabular-nums text-[var(--color-subtle)]">
            {shortId(ticket.id)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AnomalyBadge count={ticket.anomaly_count} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        {/* Evidence + money frame */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <EvidenceCanvas ticket={ticket} />
          </Panel>

          <Panel>
            <SectionTitle icon={<DollarIcon size={16} />} className="mb-3">
              Money frame
            </SectionTitle>
            <MoneyFrame v={ticket.valuation} reviewed={reviewed} />
          </Panel>

          <Panel>
            <SectionTitle icon={<TruckIcon size={16} />} className="mb-3">
              Truck &amp; ticket
            </SectionTitle>
            <TicketMetadata ticket={ticket} />
          </Panel>
        </div>

        {/* Review rail */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <SectionTitle className="mb-3">Review</SectionTitle>
            <ReviewActions ticket={ticket} />
          </Panel>

          <Panel>
            <SectionTitle className="mb-3">
              Anomaly flags
              <span className="ml-1 text-[12px] font-normal tabular-nums text-[var(--color-subtle)]">
                {ticket.anomaly_count}
              </span>
            </SectionTitle>
            <AnomalyList ticket={ticket} />
          </Panel>

          {ticket.evidence_frames.length > 0 && (
            <Panel>
              <SectionTitle className="mb-2">Evidence frames</SectionTitle>
              <Divider className="mb-2" />
              <ul className="flex flex-col gap-1.5">
                {ticket.evidence_frames.map((f) => (
                  <li
                    key={f}
                    className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12px]"
                  >
                    <span className="tabular-nums text-[var(--color-text)]">{f}</span>
                    <span className="text-[var(--color-subtle)]">
                      {ticket.truck_id ?? "unidentified"}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
