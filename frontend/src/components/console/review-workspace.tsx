"use client";

import type { ReactNode } from "react";
import { SparklesIcon } from "lucide-react";

import type { Ticket } from "@/lib/api";
import { StatusBadge } from "@/components/ui/badge";
import { AlertIcon, ClipboardIcon, TruckIcon } from "@/components/ui/icons";
import { AnomalyList } from "@/components/console/anomaly-list";
import { EvidenceCanvas } from "@/components/console/evidence-canvas";
import { MoneyFrame } from "@/components/console/money-frame";
import { ReviewActions } from "@/components/console/review-actions";
import { TicketMetadata, shortId } from "@/components/console/ticket-metadata";
import { PipelineTrace } from "@/components/ai/pipeline-trace";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { useTicketPipeline } from "@/lib/hooks";
import { debrisLabel, relativeTime } from "@/lib/format";

/**
 * Single-ticket review. Reading order follows the decision: what is the money
 * at stake (money frame), what does the evidence show, then decide. The
 * decision rail stays pinned on wide screens.
 */
export function ReviewWorkspace({ ticket }: { ticket: Ticket }) {
  const reviewed = ticket.status !== "draft";
  return (
    <div className="lt-fade-in flex flex-col gap-4">
      {/* Ticket header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[20px] font-semibold tracking-tight tabular-nums text-[var(--color-text)]">
              {shortId(ticket.id)}
            </h2>
            <StatusBadge status={ticket.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--color-muted-foreground)]">
            <span className="flex items-center gap-1.5 tabular-nums">
              <TruckIcon size={14} className="text-[var(--color-subtle)]" />
              {ticket.truck_id ?? "Unidentified truck"}
            </span>
            <span>{debrisLabel(ticket.debris_class)}</span>
            <span className="text-[var(--color-subtle)]">Captured {relativeTime(ticket.created_at)}</span>
          </div>
        </div>
      </div>

      <MoneyFrame v={ticket.valuation} reviewed={reviewed} />

      {/* Row 1 — the evidence and the AI's read of it, side by side up top.
          This is the demo's centerpiece: Meta SAM 3.1 + Muse Spark producing
          the measurement and the stage trace, shown next to the footage. On
          narrow screens the order is evidence → AI → decision → details. */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
        <div className="min-w-0">
          <EvidenceCanvas ticket={ticket} />
        </div>
        <AiAnalysisCard ticketId={ticket.id} />
      </div>

      {/* Row 2 — truck + ticket facts, and the decision (confirm/override/dispute). */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
        <Card title="Truck and ticket" icon={<TruckIcon size={15} />}>
          <TicketMetadata ticket={ticket} />
        </Card>
        <Card title="Decision" icon={<ClipboardIcon size={15} />}>
          <ReviewActions ticket={ticket} />
        </Card>
      </div>

      {/* Row 3 — remaining detail: anomaly flags. */}
      <Card title="Anomaly flags" icon={<AlertIcon size={15} />} count={ticket.anomaly_count}>
        <AnomalyList ticket={ticket} />
      </Card>
    </div>
  );
}

/**
 * The AI's read of this ticket, surfaced prominently in row 1 next to the
 * evidence. Leads with the models that did the work (SAM 3.1 + Muse Spark),
 * then the expandable per-stage trace, so the AI contribution is front-and-
 * center rather than buried below the fold.
 */
function AiAnalysisCard({ ticketId }: { ticketId: string }) {
  return (
    <section className="lt-card-shadow overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <header className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-brand)_14%,transparent),transparent)] px-4 py-2.5">
        <span className="grid size-6 place-items-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <SparklesIcon size={14} />
        </span>
        <h3 className="text-[13px] font-semibold text-[var(--color-text)]">AI analysis</h3>
        <span className="ml-auto rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          SAM 3.1 · Muse Spark
        </span>
      </header>
      <div className="p-4">
        <AiAnalysis ticketId={ticketId} />
      </div>
    </section>
  );
}

function AiAnalysis({ ticketId }: { ticketId: string }) {
  const trace = useTicketPipeline(ticketId);
  if (trace.isLoading) return <Skeleton className="h-28" />;
  if (!trace.data || trace.data.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        No AI stage trace is recorded for this ticket.
      </p>
    );
  }
  return <PipelineTrace stages={trace.data} compact />;
}

function Card({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="lt-card-shadow rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
        <span className="text-[var(--color-subtle)]">{icon}</span>
        <h3 className="text-[13px] font-semibold text-[var(--color-text)]">{title}</h3>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-[var(--color-surface-3)] px-1.5 text-[11px] font-semibold tabular-nums text-[var(--color-muted-foreground)]">
            {count}
          </span>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
