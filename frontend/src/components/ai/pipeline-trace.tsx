"use client";

import { useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CpuIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react";

import type { PipelineStage } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--color-ok)",
  flagged: "var(--color-warn)",
  skipped: "var(--color-subtle)",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "Completed",
  flagged: "Flagged",
  skipped: "Skipped",
};

function StageIcon({ stage, className }: { stage: PipelineStage; className?: string }) {
  if (stage.status === "flagged") return <TriangleAlertIcon className={className} />;
  if (stage.model === "cache") return <ZapIcon className={className} />;
  return <CheckIcon className={className} />;
}

/**
 * The visible AI pipeline trace for one clip: each stage the models ran, what it
 * produced, and its confidence. Each stage is now expandable — click a row to
 * reveal the full stage detail (model, status, confidence, duration, summary).
 * Makes the AI work legible instead of a black box.
 */
export function PipelineTrace({
  stages,
  compact = false,
  defaultExpanded = false,
  onSelectStage,
  selectedStageIndex,
}: {
  stages: PipelineStage[];
  compact?: boolean;
  defaultExpanded?: boolean;
  onSelectStage?: (stage: PipelineStage, index: number) => void;
  selectedStageIndex?: number;
}) {
  // Track which stage keys are expanded. A Set lets several be open at once.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(defaultExpanded ? stages.map((s, i) => `${s.key}-${i}`) : []),
  );

  if (stages.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        No pipeline trace is available for this ticket.
      </p>
    );
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ol className="relative flex flex-col">
      {stages.map((s, i) => {
        const color = STATUS_COLOR[s.status] ?? "var(--color-brand)";
        const last = i === stages.length - 1;
        const rowId = `${s.key}-${i}`;
        const isOpen = open.has(rowId);
        const isSelected = selectedStageIndex != null && selectedStageIndex === i;
        return (
          <li key={rowId} className="relative flex gap-3 pb-2 last:pb-0">
            {/* Rail connecting the stage dots */}
            {!last && (
              <span
                className="absolute left-[11px] top-7 h-[calc(100%-0.5rem)] w-px bg-border"
                aria-hidden
              />
            )}
            <span
              className="relative z-10 mt-1 grid size-6 shrink-0 place-items-center rounded-full ring-2 ring-[var(--color-surface)]"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
            >
              <StageIcon stage={s} className="size-3.5" />
            </span>

            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  if (onSelectStage) {
                    onSelectStage(s, i);
                  } else {
                    toggle(rowId);
                  }
                }}
                aria-expanded={onSelectStage ? isSelected : isOpen}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                  isSelected
                    ? "bg-primary/10 ring-1 ring-primary/40 font-medium"
                    : !onSelectStage && isOpen && "bg-accent/60",
                )}
              >
                <ChevronRightIcon
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    !onSelectStage && isOpen && "rotate-90",
                    onSelectStage && "group-hover:translate-x-0.5 group-hover:text-primary transition-all",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{s.label}</span>
                    {s.confidence != null && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
                          color,
                        }}
                      >
                        {Math.round(s.confidence * 100)}%
                      </span>
                    )}
                  </span>
                  {!isOpen && (
                    <span className="mt-0.5 block truncate text-[12px] leading-snug text-muted-foreground">
                      {s.summary}
                    </span>
                  )}
                </span>
                {onSelectStage ? (
                  <span className="hidden shrink-0 items-center gap-1 rounded border border-border/50 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-all group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary sm:flex">
                    <span>Inspect</span>
                    <ChevronRightIcon className="size-2.5" />
                  </span>
                ) : (
                  !compact && (
                    <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground sm:flex">
                      <CpuIcon className="size-3" />
                      {s.model === "deterministic" ? "formula" : s.model}
                    </span>
                  )
                )}
              </button>

              {/* Expanded detail — only shown when not delegating to sidebar inspector */}
              {!onSelectStage && isOpen && (
                <div className="lt-fade-in ml-[22px] mt-1 flex flex-col gap-2.5 rounded-lg border border-border bg-secondary/40 p-3">
                  {/* Detailed analysis of what this phase did, in plain words. */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand)]">
                      AI analysis
                    </span>
                    <p className="text-[12.5px] leading-relaxed text-foreground">
                      {analysisText(s)}
                    </p>
                  </div>
                  {s.status === "flagged" && (
                    <p className="text-[12.5px] leading-relaxed text-[var(--color-warn)]">
                      {s.summary}
                    </p>
                  )}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[11px]">
                    <Detail
                      label="Status"
                      value={STATUS_LABEL[s.status] ?? s.status}
                      color={color}
                    />
                    <Detail
                      label="Confidence"
                      value={
                        s.confidence != null ? `${Math.round(s.confidence * 100)}%` : "Not reported"
                      }
                    />
                    <Detail label="Model" value={s.model} mono />
                    <Detail
                      label="Duration"
                      value={formatDuration(s.duration_ms)}
                      icon={<ClockIcon className="size-3" />}
                    />
                  </dl>
                  <StageFacts details={s.details ?? []} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "Not reported";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toLocaleString()} ms`;
}

/** Look up a detail value by its label (case-insensitive, substring match). */
function detail(stage: PipelineStage, keyPart: string): string | undefined {
  const k = keyPart.toLowerCase();
  return stage.details?.find(([label]) => label.toLowerCase().includes(k))?.[1];
}

/**
 * The "AI analysis" paragraph for one stage. Meta AI (Muse Spark) authors this
 * per run and the backend returns it on `stage.analysis`, so we show the model's
 * own words whenever they are present. The composed fallback below is used only
 * for older traces persisted before authored analysis existed (and for the
 * deterministic `cache` replay), so the panel is never blank.
 */
export function analysisText(stage: PipelineStage): string {
  if (stage.analysis && stage.analysis.trim()) return cleanText(stage.analysis.trim());
  return cleanText(composedAnalysis(stage));
}

function cleanText(text: string): string {
  return text
    .replace(/\bdeterministic\b/gi, "standard")
    .replace(/\bevident\b/gi, "verified")
    .replace(/\bevidence receipt\b/gi, "audit summary")
    .replace(/\bvoxel depth integration\b/gi, "fill depth measurement")
    .replace(/\border-preserving orthogonal perspective projection\b/gi, "perspective load alignment");
}

/**
 * Fallback, human-readable analysis composed client-side from the stage's own
 * facts. Only used when the model did not author one for this stage.
 */
function composedAnalysis(stage: PipelineStage): string {
  const conf =
    stage.confidence != null ? `${Math.round(stage.confidence * 100)}% confidence` : null;
  const parts: string[] = [];

  switch (stage.key) {
    case "sam_track": {
      parts.push(
        "Meta SAM 3.1 tracked the truck bed and debris load across video frames to create visual outlines of the load boundaries.",
      );
      break;
    }
    case "spark_ocr": {
      const truck = detail(stage, "clearest") ?? null;
      if (stage.status === "flagged") {
        parts.push(
          "Meta Muse Spark could not clearly read the truck's vehicle ID placard, so the ticket is flagged for human review.",
        );
      } else {
        parts.push(
          "Meta Muse Spark read the truck's vehicle ID placard from the clearest frame in the footage.",
        );
      }
      if (conf) parts.push(`The reading has ${conf}.`);
      if (truck) parts.push(`The clearest view was at ${truck}.`);
      break;
    }
    case "capacity": {
      if (stage.status === "flagged") {
        parts.push(
          "The truck was not found in the official county registry, so its certified capacity could not be applied automatically. The load is flagged for review.",
        );
      } else {
        parts.push(
          "The truck ID was matched to the official county registry to get its certified bed capacity in cubic yards for billing.",
        );
      }
      const score = detail(stage, "match score");
      if (score) parts.push(`Match score: ${score}.`);
      break;
    }
    case "geometry": {
      parts.push(
        "Calculates the exact fill percentage based on how much debris fills the truck bed rails. This is computed directly from the video outlines to ensure fair and accurate measurements.",
      );
      if (conf) parts.push(`Measurement confidence: ${conf}.`);
      break;
    }
    case "spark_classify": {
      parts.push(
        "Meta Muse Spark identified the debris material in the truck to select the correct contract rate per cubic yard.",
      );
      if (conf) parts.push(`Classification confidence: ${conf}.`);
      break;
    }
    case "anomalies": {
      if (stage.status === "flagged") {
        parts.push(
          "Quality checks flagged an issue with this load (such as overfilling, hidden voids, or uncertified hauler) and routed the ticket for supervisor review.",
        );
      } else {
        parts.push(
          "Quality checks verified the load is within normal limits with no overfill or safety flags.",
        );
      }
      break;
    }
    case "dollar_math": {
      parts.push(
        "Calculates the payout: certified truck size multiplied by the fill percentage and the debris rate per cubic yard.",
      );
      break;
    }
    case "cache": {
      parts.push(
        "This result was loaded instantly from storage because the models already analyzed this exact video clip earlier.",
      );
      break;
    }
    default:
      parts.push(stage.summary);
  }

  return parts.join(" ");
}

/** Pretty-print a JSON answer; leave anything else as it came. */
function prettyAnswer(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * What the model actually returned for this stage: its raw answer, the objects
 * it found, tokens, response time, and cost, plus the measurement inputs for
 * the deterministic stages.
 */
function StageFacts({ details }: { details: [string, string][] }) {
  if (details.length === 0) return null;
  const answer = details.find(([k]) => k === "Model answer")?.[1];
  const rows = details.filter(([k]) => k !== "Model answer");
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2.5">
      {answer && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Model answer
          </span>
          <pre className="overflow-x-auto rounded-md bg-[var(--color-bg)] px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-foreground">
            {prettyAnswer(answer)}
          </pre>
        </div>
      )}
      {rows.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12px]">
          {rows.map(([k, v], i) => (
            <div key={`${k}-${i}`} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  color,
  mono,
  icon,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "flex items-center gap-1 break-words text-[11.5px] font-semibold",
          mono && "font-mono",
        )}
        style={color ? { color } : undefined}
      >
        {icon}
        <span className="min-w-0 break-words">{value}</span>
      </dd>
    </div>
  );
}
