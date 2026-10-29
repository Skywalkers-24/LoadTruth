"use client";

import { useEffect, useRef } from "react";
import { CheckIcon, LoaderIcon, TriangleAlertIcon } from "lucide-react";

import type { PipelineProgress, PipelineStage } from "@/lib/api";
import { usePipelineProgress } from "@/lib/hooks";
import { cn } from "@/lib/utils";

// The pipeline's stages in order, so the flow shows every step left to right
// and a step is "pending" until its event arrives. Keys match the backend
// stage keys (app/pipeline/orchestrator.py). A cached replay emits a single
// `cache` stage, handled as a full-width note.
const STAGE_FLOW: { key: string; label: string }[] = [
  { key: "sam_track", label: "Track & segment" },
  { key: "spark_ocr", label: "Read placard" },
  { key: "capacity", label: "Capacity" },
  { key: "geometry", label: "Measure fill" },
  { key: "spark_classify", label: "Classify" },
  { key: "anomalies", label: "Flag anomalies" },
  { key: "dollar_math", label: "Value load" },
];

/**
 * Live, left-to-right view of a clip moving through the pipeline. Polls the
 * event's progress snapshot (every 3s while running) and lights up each stage
 * as it lands, so the operator watches the run instead of staring at
 * "Analysing". Because the server holds the snapshot, a page refreshed mid-run
 * still shows the in-flight run. Renders nothing until a run exists.
 */
export function LivePipelineFlow({
  eventId,
  active = false,
  showIdle = false,
  onComplete,
}: {
  eventId: string | null | undefined;
  /** Keep polling and show pending stages while an upload is being processed. */
  active?: boolean;
  /** Render the pending stage map before the first upload. */
  showIdle?: boolean;
  /** Called once when a run transitions to done, so the caller can refresh. */
  onComplete?: () => void;
}) {
  const progress = usePipelineProgress(eventId ?? undefined, active);
  const run = progress.data ?? null;

  // Fire onComplete exactly once per finished run (keyed by content hash).
  const completedRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  useEffect(() => {
    if (run && run.status === "done" && completedRef.current !== run.content_hash) {
      completedRef.current = run.content_hash;
      onCompleteRef.current?.();
    }
  }, [run]);

  if (!run && !active && !showIdle) return null;
  return <Flow run={run} active={active} idle={!run && !active} />;
}

function Flow({
  run,
  active,
  idle,
}: {
  run: PipelineProgress | null;
  active: boolean;
  idle: boolean;
}) {
  const running = run?.status === "running" || (!run && active);
  const stages = run?.stages ?? [];
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const lastKey = stages[stages.length - 1]?.key;
  const last = lastKey ? byKey.get(lastKey) : undefined;
  const cached = byKey.has("cache");

  return (
    <section className="lt-fade-in rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <header className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "grid size-6 place-items-center rounded-md",
            running
              ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
              : idle
                ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
              : "bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
          )}
        >
          {running || idle ? (
            <LoaderIcon className={cn("size-3.5", running && "animate-spin")} />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
        </span>
        <h3 className="text-[13px] font-semibold">
          {idle ? "Pipeline ready" : running ? "Analysing clip" : run ? outcomeTitle(run) : "Analysis pending"}
        </h3>
        {run?.truck_id && (
          <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--color-muted-foreground)]">
            {run.truck_id}
          </span>
        )}
      </header>

      {cached ? (
        <p className="text-[12px] text-[var(--color-muted-foreground)]">
          Served from the result cache, no model call.
        </p>
      ) : (
        <ol className="flex flex-wrap gap-x-1.5 gap-y-2 pb-1">
          {STAGE_FLOW.map((s, i) => {
            const stage = byKey.get(s.key);
            const active = running && lastKey === s.key;
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
          })}
        </ol>
      )}

      {/* The most recent stage's one-line result, so the operator sees what each
          step produced as it happens. */}
      {last && (
        <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
          <span className="font-medium text-[var(--color-text)]">{last.label}:</span> {last.summary}
        </p>
      )}

      {run?.detail && run.outcome !== "drafted" && run.outcome !== "cached" && (
        <p className="mt-2 text-[12px] text-[var(--color-warn)]">{run.detail}</p>
      )}
    </section>
  );
}

function outcomeTitle(run: PipelineProgress): string {
  switch (run.outcome) {
    case "drafted":
      return "Ticket drafted";
    case "cached":
      return "Served from cache";
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
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors",
        active &&
          "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
        done &&
          !flagged &&
          !active &&
          "border-[var(--color-ok)] bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
        flagged &&
          "border-[var(--color-warn)] bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
        pending && "border-dashed border-[var(--color-border)] text-[var(--color-subtle)]",
      )}
    >
      <span className="grid size-3.5 place-items-center">
        {active ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : flagged ? (
          <TriangleAlertIcon className="size-3" />
        ) : done ? (
          <CheckIcon className="size-3" />
        ) : (
          <span className="size-1.5 rounded-full bg-current opacity-50" />
        )}
      </span>
      {label}
    </span>
  );
}
