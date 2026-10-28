"use client";

import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, SparklesIcon } from "lucide-react";

import type { Ticket } from "@/lib/api";
import { StatusBadge } from "@/components/ui/badge";
import { AlertIcon, TruckIcon } from "@/components/ui/icons";
import { AnomalyList } from "@/components/console/anomaly-list";
import { EvidenceCanvas } from "@/components/console/evidence-canvas";
import { MoneyFrame } from "@/components/console/money-frame";
import { ReviewActions } from "@/components/console/review-actions";
import { SectionCard } from "@/components/console/section-card";
import { TicketMetadata, shortId } from "@/components/console/ticket-metadata";
import { PipelineTrace } from "@/components/ai/pipeline-trace";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { useTicketPipeline } from "@/lib/hooks";
import { debrisLabel, relativeTime } from "@/lib/format";

/** Previous/next stepping through the current queue page. */
export interface TicketNav {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Single-ticket review, laid out to fit one screen.
 *
 * Wide pane (a container query, so it tracks the pane, not the window): two
 * columns that each scroll on their own. The center holds what the reviewer
 * reads and decides on, top to bottom: ticket header, money frame, evidence,
 * truck record, and the decision bar pinned to the bottom. The right rail holds
 * the AI analysis, then the anomaly flags.
 *
 * Narrow pane: a single scrolling column in reading order, with the decision
 * bar still pinned to the bottom of the view.
 */
export function ReviewWorkspace({ ticket, nav }: { ticket: Ticket; nav?: TicketNav }) {
  const reviewed = ticket.status !== "draft";
  return (
    <div className="lt-fade-in @container h-full min-h-0">
      {/* Narrow pane on desktop: this element is the one scroll area. Wide
          pane: it is a fixed-height grid and each column scrolls instead. */}
      <div className="lt-scroll flex min-h-0 flex-col gap-3 lg:h-full lg:@max-[46rem]:overflow-y-auto @[46rem]:grid @[46rem]:grid-cols-[minmax(0,1fr)_17rem] @[46rem]:grid-rows-1 @[46rem]:overflow-hidden @[64rem]:grid-cols-[minmax(0,1fr)_20rem] @[64rem]:gap-4 @[96rem]:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Center column. On a narrow pane its wrapper is `display: contents`
            so the decision bar can sit after the rail and stay pinned. */}
        <div className="lt-scroll contents @[46rem]:flex @[46rem]:min-h-0 @[46rem]:min-w-0 @[46rem]:flex-col @[46rem]:gap-3 @[46rem]:overflow-y-auto">
          <TicketHeader ticket={ticket} nav={nav} />
          <MoneyFrame v={ticket.valuation} reviewed={reviewed} />
          <EvidenceCanvas ticket={ticket} />
          <SectionCard title="Truck and ticket" icon={<TruckIcon size={15} />}>
            <TicketMetadata ticket={ticket} />
          </SectionCard>

          {/* Decision bar: last in reading order, pinned to the bottom of the
              scroll area (and above the mobile tab bar). */}
          {/* In the single-column layout on tablets the bar spans to the right
              edge, so it stops short of the AI launcher. */}
          <div className="sticky bottom-0 z-10 order-last max-lg:bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:@max-[46rem]:mr-[4.5rem] @[46rem]:order-none">
            <div className="lt-card-shadow rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.5)]">
              <ReviewActions ticket={ticket} layout="bar" />
            </div>
          </div>
        </div>

        {/* Right rail: the AI read, then the flags it raised. Bottom padding
            (lt-fab-safe) clears the floating AI analyst launcher. */}
        <div className="lt-scroll lt-fab-safe flex min-w-0 flex-col gap-3 @[46rem]:min-h-0 @[46rem]:overflow-y-auto">
          <AiAnalysisCard ticketId={ticket.id} />
          {/* On a wide pane the last card stretches so the rail ends flush
              with the queue and center columns instead of leaving a gap. */}
          <SectionCard
            title="Anomaly flags"
            icon={<AlertIcon size={15} />}
            count={ticket.anomaly_count}
            countTone="danger"
            className="shrink-0 @[46rem]:flex-1"
          >
            <AnomalyList ticket={ticket} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function TicketHeader({ ticket, nav }: { ticket: Ticket; nav?: TicketNav }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <h2 className="lt-page-title tabular-nums" style={{ fontSize: "var(--lt-ticket-title)" }}>
            {shortId(ticket.id)}
          </h2>
          <StatusBadge status={ticket.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--color-muted-foreground)]">
          <span className="flex items-center gap-1.5">
            <ClockIcon className="size-3.5 text-[var(--color-subtle)]" />
            Captured {relativeTime(ticket.created_at)}
          </span>
          <span className="flex items-center gap-1.5 tabular-nums">
            <TruckIcon size={14} className="text-[var(--color-subtle)]" />
            {ticket.truck_id ?? "Unidentified truck"}
          </span>
          <span>{debrisLabel(ticket.debris_class)}</span>
        </div>
      </div>

      {nav && nav.total > 1 && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={nav.onPrev}
            disabled={nav.index <= 0}
            aria-label="Previous ticket"
            className="grid size-7 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-40"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="min-w-[3.25rem] text-center text-[12px] tabular-nums text-[var(--color-muted-foreground)]">
            {nav.index + 1} of {nav.total}
          </span>
          <button
            type="button"
            onClick={nav.onNext}
            disabled={nav.index >= nav.total - 1}
            aria-label="Next ticket"
            className="grid size-7 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-40"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The AI's read of this ticket, at the top of the right rail. A branded header
 * names the models that did the work, then the full stage trace sits open.
 */
function AiAnalysisCard({ ticketId }: { ticketId: string }) {
  return (
    <section className="lt-card-shadow overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <header className="lt-card-head border-b border-[var(--color-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-brand)_14%,transparent),transparent)]">
        <span className="grid size-6 place-items-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <SparklesIcon size={14} />
        </span>
        <h3 className="lt-card-title shrink-0 whitespace-nowrap">AI analysis</h3>
        <span className="ml-auto min-w-0 truncate rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-muted-foreground)]">
          SAM 3.1 · Muse Spark
        </span>
      </header>
      <div className="lt-card-body">
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
