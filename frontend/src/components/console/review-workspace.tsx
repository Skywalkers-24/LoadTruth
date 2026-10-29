"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PanelRightOpenIcon, SparklesIcon } from "lucide-react";

import type { Ticket } from "@/lib/api";
import { StatusBadge } from "@/components/ui/badge";
import { AlertIcon } from "@/components/ui/icons";
import { AnomalyList } from "@/components/console/anomaly-list";
import { EvidenceCanvas } from "@/components/console/evidence-canvas";
import { ReviewActions } from "@/components/console/review-actions";
import { ReproducibilityCard } from "@/components/console/reproducibility-card";
import { CollapsibleSectionCard } from "@/components/console/section-card";
import { TicketMetadata, shortId } from "@/components/console/ticket-metadata";
import { PipelineTrace } from "@/components/ai/pipeline-trace";
import { StageInspectorDrawer } from "@/components/ai/stage-inspector-drawer";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { useTicketPipeline } from "@/lib/hooks";

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
 * reads and decides on, top to bottom: ticket header, evidence, truck record,
 * and the decision bar. The right rail gives 70% of its height to AI analysis
 * and 30% to anomaly flags and reproducibility details.
 *
 * Narrow pane: a single scrolling column in reading order, with the decision
 * bar still pinned to the bottom of the view.
 */
export function ReviewWorkspace({ ticket, nav }: { ticket: Ticket; nav?: TicketNav }) {
  return (
    <div className="lt-fade-in @container h-full min-h-0">
      {/* Narrow pane on desktop: this element is the one scroll area. Wide
          pane: it is a fixed-height grid and each column scrolls instead. */}
      <div className="lt-scroll flex min-h-0 flex-col gap-3 lg:h-full lg:@max-[42rem]:overflow-y-auto @[42rem]:grid @[42rem]:grid-cols-[minmax(0,1fr)_18rem] @[42rem]:grid-rows-1 @[42rem]:overflow-hidden @[64rem]:grid-cols-[minmax(0,1fr)_24rem] @[64rem]:gap-4 @[96rem]:grid-cols-[minmax(0,1fr)_28rem]">
        {/* Center column. On a narrow pane its wrapper is `display: contents`
            so the decision bar can sit after the rail. */}
        <div className="lt-scroll contents [&>*]:shrink-0 @[42rem]:flex @[42rem]:min-h-0 @[42rem]:min-w-0 @[42rem]:flex-col @[42rem]:gap-3 @[42rem]:overflow-y-auto">
          <TicketSummary ticket={ticket} nav={nav} />
          <EvidenceCanvas ticket={ticket} />

          {/* Decision bar stays in the document flow so it cannot cover details. */}
          {/* In the single-column layout on tablets the bar spans to the right
              edge, so it stops short of the AI launcher. */}
          <div className="order-last shrink-0 sm:@max-[42rem]:mr-[4.5rem] @[46rem]:order-none">
            <div className="lt-card-shadow rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.5)]">
              <ReviewActions ticket={ticket} layout="bar" />
            </div>
          </div>
        </div>

        {/* The AI trace gets 70% of the rail; the remaining 30% holds the
            anomaly and reproducibility cards. The FAB-safe padding keeps both
            sections clear of the floating AI launcher. */}
        <div className="lt-fab-safe lt-review-rail-safe flex min-w-0 flex-col gap-3 @[42rem]:grid @[42rem]:h-full @[42rem]:min-h-0 @[42rem]:grid-rows-[minmax(0,7fr)_minmax(0,3fr)] @[42rem]:overflow-hidden">
          <AiAnalysisCard ticketId={ticket.id} />
          <div className="flex min-h-0 flex-col gap-3 @[42rem]:overflow-y-auto lt-scroll">
            <CollapsibleSectionCard
              id="anomaly-flags"
              title="Anomaly flags"
              icon={<AlertIcon size={15} />}
              count={ticket.anomaly_count}
              countTone="danger"
              summary={
                ticket.anomaly_count > 0
                  ? `${ticket.anomaly_count} flag${ticket.anomaly_count === 1 ? "" : "s"} to review`
                  : "No anomalies flagged"
              }
              defaultOpen={false}
              className="shrink-0"
            >
              <AnomalyList ticket={ticket} />
            </CollapsibleSectionCard>
            {/* Proof the number is reproducible: re-verify from evidence, plus the
                judge-mode Run live control. */}
            <div className="shrink-0">
              <ReproducibilityCard ticket={ticket} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TicketSummary({ ticket, nav }: { ticket: Ticket; nav?: TicketNav }) {
  return (
    <section className="lt-card-shadow shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2
            className="lt-page-title shrink-0 tabular-nums"
            style={{ fontSize: "var(--lt-ticket-title)" }}
          >
            {shortId(ticket.id)}
          </h2>
          <StatusBadge status={ticket.status} />
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
      </header>
      <div className="px-3 py-2">
        <TicketMetadata ticket={ticket} />
      </div>
    </section>
  );
}

/**
 * The AI's read of this ticket, at the top of the right rail. A branded header
 * names the models that did the work. Clicking any stage row opens the
 * slide-over drawer modal for in-depth inspection.
 */
function AiAnalysisCard({ ticketId }: { ticketId: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);

  return (
    <section className="lt-card-shadow flex shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] @[42rem]:min-h-0">
      <header className="lt-card-head shrink-0 border-b border-[var(--color-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-brand)_14%,transparent),transparent)]">
        <span className="grid size-6 place-items-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <SparklesIcon size={14} />
        </span>
        <h3 className="lt-card-title shrink-0 whitespace-nowrap">AI analysis</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="min-w-0 truncate rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-muted-foreground)]">
            SAM 3.1 · Muse Spark
          </span>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title="Open Stage Inspector"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-soft)]"
          >
            <PanelRightOpenIcon className="size-3.5" />
            <span className="hidden xl:inline">Inspect</span>
          </button>
        </div>
      </header>
      <div className="lt-card-body p-3 @[42rem]:min-h-0 @[42rem]:flex-1 @[42rem]:overflow-y-auto lt-scroll">
        <AiAnalysis
          ticketId={ticketId}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
          selectedStageIndex={selectedStageIndex}
          setSelectedStageIndex={setSelectedStageIndex}
        />
      </div>
    </section>
  );
}

function AiAnalysis({
  ticketId,
  drawerOpen,
  setDrawerOpen,
  selectedStageIndex,
  setSelectedStageIndex,
}: {
  ticketId: string;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  selectedStageIndex: number;
  setSelectedStageIndex: (index: number) => void;
}) {
  const trace = useTicketPipeline(ticketId);
  if (trace.isLoading) return <Skeleton className="h-28" />;
  if (!trace.data || trace.data.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        No AI stage trace is recorded for this ticket.
      </p>
    );
  }
  return (
    <div>
      <div className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
        <span>Click any stage to inspect output</span>
      </div>
      <PipelineTrace
        stages={trace.data}
        compact
        selectedStageIndex={drawerOpen ? selectedStageIndex : undefined}
        onSelectStage={(stage, index) => {
          setSelectedStageIndex(index);
          setDrawerOpen(true);
        }}
      />
      <StageInspectorDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stages={trace.data}
        currentStageIndex={selectedStageIndex}
        onSelectStageIndex={setSelectedStageIndex}
      />
    </div>
  );
}
