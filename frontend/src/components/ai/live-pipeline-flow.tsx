"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, LoaderIcon, TriangleAlertIcon } from "lucide-react";

import { streamPipelineProgress, type PipelineProgressEvent, type PipelineStage } from "@/lib/api";
import { cn } from "@/lib/utils";

// The pipeline's stages in order, so the flow shows every step left to right
// and a step is "pending" until its event arrives. Keys match the backend
// stage keys (app/pipeline/orchestrator.py). `cache` replaces the AI stages on
// a cached replay, so it is handled as a special full-width step.
const STAGE_FLOW: { key: string; label: string }[] = [
  { key: "sam_track", label: "Track & segment" },
  { key: "spark_ocr", label: "Read placard" },
  { key: "capacity", label: "Capacity" },
  { key: "geometry", label: "Measure fill" },
  { key: "spark_classify", label: "Classify" },
  { key: "anomalies", label: "Flag anomalies" },
  { key: "dollar_math", label: "Value load" },
];

type RunState = {
  contentHash: string;
  stages: Record<string, PipelineStage>;
  order: string[];
  outcome: PipelineProgressEvent["outcome"];
  ticketId: string | null;
  truckId: string | null;
  detail: string | null;
  startedAt: number;
};

/**
 * Live, left-to-right view of a clip moving through the pipeline. Subscribes to
 * the event's SSE progress stream and lights up each stage as it lands, so the
 * operator watches the run instead of staring at "Analysing". Shows nothing
 * until a run starts, then stays on the last run with its outcome.
 */
export function LivePipelineFlow({
  eventId,
  onComplete,
}: {
  eventId: string | null | undefined;
  /** Called when a run resolves, so the caller can refresh its jobs list. */
  onComplete?: () => void;
}) {
  const [run, setRun] = useState<RunState | null>(null);
  const runRef = useRef<RunState | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!eventId) return;
    runRef.current = null;
    setRun(null);
    const stop = streamPipelineProgress(eventId, (e) => {
      if (e.kind === "started") {
        const fresh: RunState = {
          contentHash: e.content_hash,
          stages: {},
          order: [],
          outcome: null,
          ticketId: null,
          truckId: e.truck_id,
          detail: null,
          startedAt: e.at,
        };
        runRef.current = fresh;
        setRun(fresh);
        return;
      }
      const cur = runRef.current;
      // A stage/done for a run we never saw "started" (page opened mid-run):
      // seed a run from this event's content hash so the backlog still renders.
      const base: RunState =
        cur && cur.contentHash === e.content_hash
          ? cur
          : {
              contentHash: e.content_hash,
              stages: {},
              order: [],
              outcome: null,
              ticketId: null,
              truckId: null,
              detail: null,
              startedAt: e.at,
            };
      if (e.kind === "stage" && e.stage) {
        const key = e.stage.key;
        const next: RunState = {
          ...base,
          stages: { ...base.stages, [key]: e.stage },
          order: base.order.includes(key) ? base.order : [...base.order, key],
        };
        runRef.current = next;
        setRun(next);
      } else if (e.kind === "done") {
        const next: RunState = {
          ...base,
          outcome: e.outcome,
          ticketId: e.ticket_id,
          truckId: e.truck_id ?? base.truckId,
          detail: e.detail,
        };
        runRef.current = next;
        setRun(next);
        onCompleteRef.current?.();
      }
    });
    return stop;
  }, [eventId]);

  if (!run) return null;

  const running = run.outcome === null;
  const cached = run.order.includes("cache");

  return (
    <section className="lt-fade-in rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <header className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "grid size-6 place-items-center rounded-md",
            running
              ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
              : "bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
          )}
        >
          {running ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
        </span>
        <h3 className="text-[13px] font-semibold">
          {running ? "Analysing clip" : outcomeTitle(run)}
        </h3>
        {run.truckId && (
          <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--color-muted-foreground)]">
            {run.truckId}
          </span>
        )}
      </header>

      {cached ? (
        <p className="text-[12px] text-[var(--color-muted-foreground)]">
          Served from the result cache, no model call.
        </p>
      ) : (
        <ol className="flex gap-1.5 overflow-x-auto pb-1">
          {STAGE_FLOW.map((s, i) => {
            const stage = run.stages[s.key];
            const lastKey = run.order[run.order.length - 1];
            const active = running && lastKey === s.key;
            return (
              <li key={s.key} className="flex items-center gap-1.5">
                <StageChip
                  label={s.label}
                  stage={stage}
                  active={active}
                  pending={!stage && running}
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
      {(() => {
        const lastKey = run.order[run.order.length - 1];
        const last = lastKey ? run.stages[lastKey] : undefined;
        if (!last) return null;
        return (
          <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
            <span className="font-medium text-[var(--color-text)]">{last.label}:</span>{" "}
            {last.summary}
          </p>
        );
      })()}

      {run.detail && run.outcome !== "drafted" && run.outcome !== "cached" && (
        <p className="mt-2 text-[12px] text-[var(--color-warn)]">{run.detail}</p>
      )}
    </section>
  );
}

function outcomeTitle(run: RunState): string {
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
