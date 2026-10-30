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
import { percent } from "@/lib/format";
import { cn } from "@/lib/utils";

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
 * and the decision bar. In the right rail, the Analysis details, anomaly flags, and
 * reproducibility cards share the available height in proportion to content.
 *
 * Narrow pane: a single scrolling column in reading order, with the decision
 * bar still pinned to the bottom of the view.
 */
export function ReviewWorkspace({ ticket, nav }: { ticket: Ticket; nav?: TicketNav }) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  return (
    <div className="@container flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Check the footage against the estimate.</p>
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="review-details"
          onClick={() => setDetailsOpen((open) => !open)}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium"
        >
          <PanelRightOpenIcon className="size-4" />
          {detailsOpen
            ? "Hide analysis & checks"
            : `Analysis & checks${ticket.anomaly_count ? ` (${ticket.anomaly_count} flags)` : ""}`}
        </button>
      </div>
      <div
        className={cn(
          "lt-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto",
          detailsOpen &&
            "@[48rem]:grid @[48rem]:grid-cols-[minmax(0,1fr)_20rem] @[48rem]:overflow-hidden",
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 @[42rem]:overflow-y-auto">
          <TicketSummary ticket={ticket} nav={nav} />
          {ticket.anomaly_count > 0 && (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-md border border-[var(--warn)]/30 bg-[var(--warn-soft)] px-4 py-2.5 text-left text-sm text-[var(--warn)]"
            >
              <AlertIcon size={15} />
              {ticket.anomaly_count} flag{ticket.anomaly_count === 1 ? "" : "s"} to check before
              confirming<span className="ml-auto text-xs">View flags →</span>
            </button>
          )}
          <EvidenceCanvas ticket={ticket} />
          <div className="shrink-0 rounded-lg border border-border bg-card p-4">
            <ReviewActions ticket={ticket} layout="bar" />
          </div>
        </div>
        {detailsOpen && (
          <aside
            id="review-details"
            aria-label="Analysis and checks"
            className="lt-scroll flex min-h-0 min-w-0 shrink-0 flex-col gap-3 overflow-y-auto @[48rem]:shrink"
          >
            <AiAnalysisCard ticketId={ticket.id} />
            <CollapsibleSectionCard
              id="anomaly-flags"
              title="Flags to review"
              icon={<AlertIcon size={15} />}
              count={ticket.anomaly_count}
              countTone="danger"
              summary={ticket.anomaly_count ? "Inspect flagged observations" : "No flags recorded"}
              defaultOpen={ticket.anomaly_count > 0}
            >
              <AnomalyList ticket={ticket} />
            </CollapsibleSectionCard>
            <ReproducibilityCard ticket={ticket} />
          </aside>
        )}
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
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-muted-foreground">Truck</p>
          <p className="truncate text-sm font-medium">{ticket.truck_id ?? "Unidentified truck"}</p>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Estimated fill</p>
          <p className="text-lg font-semibold tabular-nums">
            {percent(ticket.valuation.est_fill_pct)}
          </p>
        </div>
      </div>
      <details open className="border-t border-border px-4">
        <summary className="cursor-pointer py-2.5 text-xs text-muted-foreground">
          Load & pricing details
        </summary>
        <div className="pb-4">
          <TicketMetadata ticket={ticket} />
        </div>
      </details>
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
    <section className="lt-card-shadow flex shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] @[42rem]:min-h-0 @[42rem]:flex-[1_1_auto]">
      <header className="lt-card-head min-w-0 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
          <SparklesIcon size={14} />
        </span>
        <h3 className="lt-card-title min-w-0 flex-1">Analysis details</h3>
        <div className="ml-auto flex min-w-0 shrink items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title="View analysis steps"
            aria-label="View analysis steps"
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand-soft)]"
          >
            <PanelRightOpenIcon className="size-3.5" />
            <span>View steps</span>
          </button>
        </div>
      </header>
      <div className="lt-card-body flex min-h-0 flex-1 flex-col overflow-y-auto p-3 lt-scroll">
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
        No analysis details are recorded for this ticket.
      </p>
    );
  }
  const stepLabels: Record<string, string> = {
    sam_track: "Outline truck and load",
    spark_ocr: "Read truck ID",
    capacity: "Find truck capacity",
    geometry: "Estimate fill level",
    spark_classify: "Identify load material",
    anomalies: "Check for issues",
    dollar_math: "Calculate load value",
  };
  const stages = trace.data.map((stage) => ({
    ...stage,
    label: stepLabels[stage.key] ?? stage.label,
  }));
  return (
    <div className="flex flex-col">
      <div className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">
        <span>Select a step to see its result</span>
      </div>
      <PipelineTrace
        stages={stages}
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
        stages={stages}
        currentStageIndex={selectedStageIndex}
        onSelectStageIndex={setSelectedStageIndex}
      />
    </div>
  );
}
