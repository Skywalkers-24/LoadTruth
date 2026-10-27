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

      {/* Narrow screens: one column ordered for the task (decide right after the
          money frame). Wide screens: evidence left, pinned decision rail right. */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
          <div className="order-2 min-w-0 xl:order-none">
            <EvidenceCanvas ticket={ticket} />
          </div>
          <div className="order-4 xl:order-none">
            <Card title="Truck and ticket" icon={<TruckIcon size={15} />}>
              <TicketMetadata ticket={ticket} />
            </Card>
          </div>
          <div className="order-5 xl:order-none">
            <Card title="AI analysis" icon={<SparklesIcon size={15} />}>
              <AiAnalysis ticketId={ticket.id} />
            </Card>
          </div>
        </div>

        <div className="contents xl:sticky xl:top-0 xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
          <div className="order-1 xl:order-none">
            <Card title="Decision" icon={<ClipboardIcon size={15} />}>
              <ReviewActions ticket={ticket} />
            </Card>
          </div>
          <div className="order-3 xl:order-none">
            <Card title="Anomaly flags" icon={<AlertIcon size={15} />} count={ticket.anomaly_count}>
              <AnomalyList ticket={ticket} />
            </Card>
          </div>
        </div>
      </div>
    </div>
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
