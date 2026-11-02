"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, Loader2Icon, LoaderIcon, TriangleAlertIcon } from "lucide-react";

import type { PipelineProgress, PipelineStage } from "@/lib/api";
import { usePipelineProgress } from "@/lib/hooks";
import { PipelineWorkbench } from "@/components/ai/pipeline-workbench";
import { currentPipelineRun, pipelineAttemptKey } from "@/lib/pipeline-progress";
import { cn } from "@/lib/utils";

// The pipeline's stages in order, so the flow shows every step left to right
// and a step is "pending" until its event arrives. Keys match the backend
// stage keys (app/pipeline/orchestrator.py). A cached replay emits a single
// `cache` stage, handled as a full-width note.
const STAGE_FLOW: { key: string; label: string }[] = [
  { key: "sam_track", label: "Outline truck and load" },
  { key: "spark_ocr", label: "Read truck number" },
  { key: "capacity", label: "Find capacity" },
  { key: "geometry", label: "Estimate fill" },
  { key: "spark_classify", label: "Identify material" },
  { key: "anomalies", label: "Check for issues" },
  { key: "dollar_math", label: "Value load" },
];

/**
 * Live, left-to-right view of a clip moving through the pipeline. Polls the
 * event's progress snapshot (every 1.5s while running) and lights up each stage
 * as it lands, so the operator watches the run instead of staring at
 * "Analysing". Because the server holds the snapshot, a page refreshed mid-run
 * still shows the in-flight run. Renders nothing until a run exists.
 */
export function LivePipelineFlow({
  eventId,
  active = false,
  preparing = false,
  showIdle = false,
  onComplete,
  detailed = false,
  ignoredAttempt,
  onlyActive = false,
}: {
  eventId: string | null | undefined;
  /** Expand actual stage output as it arrives. */
  detailed?: boolean;
  /** Show immediate feedback while client-side upload checks are running. */
  preparing?: boolean;
  /** Hide previous event results while a new upload begins. */
  ignoredAttempt?: string;
  /** History pages already show completed runs in their inspector. */
  onlyActive?: boolean;
  /** Keep polling and show pending stages while an upload is being processed. */
  active?: boolean;
  /** Render the pending stage map before the first upload. */
  showIdle?: boolean;
  /** Called once when a run transitions to done, so the caller can refresh. */
  onComplete?: () => void;
}) {
  const progress = usePipelineProgress(eventId ?? undefined, active);
  const run = currentPipelineRun(progress.data, ignoredAttempt);
  const [completedRun, setCompletedRun] = useState<PipelineProgress | null>(null);

  // Fire onComplete once per finished attempt, including repeated clips.
  const completedRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    if (run?.status === "done") {
      setCompletedRun(run);
    } else if (
      run &&
      completedRun &&
      pipelineAttemptKey(run) !== pipelineAttemptKey(completedRun)
    ) {
      setCompletedRun(null);
    }
  }, [run, completedRun]);
  useEffect(() => {
    if (
      run &&
      run.status === "done" &&
      completedRef.current !== `${run.event_id}:${run.started_at}`
    ) {
      completedRef.current = `${run.event_id}:${run.started_at}`;
      onCompleteRef.current?.();
    }
  }, [run]);
  const visibleRun =
    run?.status === "running" &&
    completedRun &&
    pipelineAttemptKey(run) === pipelineAttemptKey(completedRun)
      ? completedRun
      : run;

  if (progress.isError)
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p>Live analysis is temporarily unavailable. Your upload may still be processing.</p>
        <button
          type="button"
          onClick={() => void progress.refetch()}
          className="mt-2 text-primary underline"
        >
          Reconnect
        </button>
      </div>
    );
  if (
    onlyActive &&
    (!visibleRun || (visibleRun.status === "done" && visibleRun.outcome !== "failed"))
  )
    return null;
  if (!visibleRun && !active && !showIdle) return null;
  return (
    <Flow
      run={visibleRun}
      active={active}
      preparing={preparing}
      idle={!run && !active}
      detailed={detailed}
    />
  );
}

function Flow({
  run,
  active,
  preparing,
  idle,
  detailed,
}: {
  run: PipelineProgress | null;
  active: boolean;
  preparing: boolean;
  idle: boolean;
  detailed: boolean;
}) {
  const failed = run?.outcome === "failed";
  const running = run?.status === "running" || (!run && active);
  const stages = (run?.stages ?? []).filter((s) => s.key !== "cache");
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const lastKey = stages[stages.length - 1]?.key;
  const last = lastKey ? byKey.get(lastKey) : undefined;
  const cached = run?.outcome === "cached" || run?.stages.some((s) => s.key === "cache");

  return (
    <section
      aria-label="Current pipeline run"
      className="lt-fade-in rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "grid place-items-center rounded-xl transition-all shadow-xs",
              running
                ? "size-10 bg-[var(--color-brand)] text-white ring-2 ring-[var(--color-brand)]/30"
                : "size-8",
              failed
                ? "bg-[var(--color-danger-soft)] text-[var(--color-destructive)]"
                : running
                  ? "bg-[var(--color-brand)] text-white"
                  : idle
                    ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                    : "bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
            )}
          >
            {failed ? (
              <TriangleAlertIcon className="size-4.5" />
            ) : running ? (
              <Loader2Icon className="size-5.5 animate-spin" />
            ) : idle ? (
              <LoaderIcon className="size-4.5" />
            ) : (
              <CheckIcon className="size-4.5" />
            )}
          </span>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 role="status" className="text-[13px] font-semibold sm:text-sm">
                {idle
                  ? "Pipeline ready"
                  : preparing
                    ? "Preparing clip"
                    : running
                      ? "Analysing clip"
                      : run
                        ? outcomeTitle(run)
                        : "Analysis pending"}
              </h3>
              {running && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-brand-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-brand)]">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-brand)] opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-[var(--color-brand)]" />
                  </span>
                  Live
                </span>
              )}
            </div>
            {running && (
              <p className="text-[11px] text-muted-foreground">
                {preparing
                  ? "Checking video details before starting analysis"
                  : "AI outlines truck & load, reads plate, finds capacity, and estimates fill"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cached && (
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Cached
            </span>
          )}
          {run?.truck_id && (
            <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--color-muted-foreground)]">
              {run.truck_id}
            </span>
          )}
        </div>
      </header>

      {detailed ? (
        <div className="mt-1">
          <PipelineWorkbench
            stages={stages}
            isRunning={running}
            showInlineTrace={process.env.NODE_ENV === "test"}
          />
        </div>
      ) : (
        <ol className="flex gap-2 overflow-x-auto pb-3">
          {(() => {
            const activeChipIndex = running ? STAGE_FLOW.findIndex((st) => !byKey.has(st.key)) : -1;
            return STAGE_FLOW.map((s, i) => {
              const stage = byKey.get(s.key);
              const active = i === activeChipIndex;
              return (
                <li key={s.key} className="flex items-center gap-1.5">
                  <StageChip
                    label={s.label}
                    stage={stage}
                    active={active}
                    pending={!stage && (running || idle)}
                  />
                  {i < STAGE_FLOW.length - 1 && (
                    <span
                      aria-hidden
                      className={cn(
                        "h-px w-3 shrink-0",
                        stage ? "bg-[var(--color-ok)]" : "bg-[var(--color-border)]",
                      )}
                    />
                  )}
                </li>
              );
            });
          })()}
        </ol>
      )}

      {/* The most recent stage's one-line result, so the operator sees what each
          step produced as it happens. */}
      {!detailed && last && (
        <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
          <span className="font-medium text-[var(--color-text)]">{last.label}:</span> {last.summary}
        </p>
      )}

      {run?.detail &&
        run.outcome !== "created" &&
        run.outcome !== "drafted" &&
        run.outcome !== "cached" && (
          <p className="mt-2 text-[12px] text-[var(--color-warn)]">{run.detail}</p>
        )}
    </section>
  );
}

function outcomeTitle(run: PipelineProgress): string {
  switch (run.outcome) {
    case "created":
      return "Ticket created";
    case "drafted":
      return "Ticket created";
    case "cached":
      return "Ticket created";
    case "no_truck":
      return "No truck detected";
    case "failed":
      return "Run failed";
    default:
      return "Done";
  }
}

function StageChip({
  label,
  stage,
  active,
  pending,
}: {
  label: string;
  stage: PipelineStage | undefined;
  active: boolean;
  pending: boolean;
}) {
  const flagged = stage?.status === "flagged";
  const done = Boolean(stage);
  return (
    <span
      className={cn(
        "inline-flex min-h-12 shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors",
        active &&
          "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] ring-1 ring-[var(--color-brand)]",
        done &&
          !flagged &&
          !active &&
          "border-[var(--color-ok)] bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
        flagged &&
          "border-[var(--color-warn)] bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
        pending && "border-dashed border-[var(--color-border)] text-[var(--color-subtle)]",
      )}
    >
      <span className="grid size-4 place-items-center">
        {active ? (
          <Loader2Icon className="size-4 animate-spin text-[var(--color-brand)]" />
        ) : flagged ? (
          <TriangleAlertIcon className="size-4" />
        ) : done ? (
          <CheckIcon className="size-4" />
        ) : (
          <span className="size-1.5 rounded-full bg-current opacity-50" />
        )}
      </span>
      {label}
    </span>
  );
}
