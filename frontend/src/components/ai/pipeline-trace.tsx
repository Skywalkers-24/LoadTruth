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
}: {
  stages: PipelineStage[];
  compact?: boolean;
}) {
  // Track which stage keys are expanded. A Set lets several be open at once.
  const [open, setOpen] = useState<Set<string>>(new Set());

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
                onClick={() => toggle(rowId)}
                aria-expanded={isOpen}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
                  isOpen && "bg-accent/60",
                )}
              >
                <ChevronRightIcon
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-90",
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
                {!compact && (
                  <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground sm:flex">
                    <CpuIcon className="size-3" />
                    {s.model}
                  </span>
                )}
              </button>

              {/* Expanded detail — all the fields for this stage, including the
                  previously-hidden duration. */}
              {isOpen && (
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
function analysisText(stage: PipelineStage): string {
  if (stage.analysis && stage.analysis.trim()) return stage.analysis.trim();
  return composedAnalysis(stage);
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
        "Meta SAM 3.1 tracked the truck bed and the debris pile across the sampled frames and returned a segmentation mask for each.",
      );
      const billed = detail(stage, "billed");
      const media = detail(stage, "media sent");
      if (media) parts.push(`The clip was sent ${media.toLowerCase()}.`);
      if (billed) parts.push(`SAM was billed for ${billed.toLowerCase()}.`);
      parts.push(
        "These masks are the pixel evidence every downstream measurement is derived from.",
      );
      break;
    }
    case "spark_ocr": {
      const truck = detail(stage, "clearest") ?? null;
      if (stage.status === "flagged") {
        parts.push(
          "Muse Spark could not read the truck's ID placard confidently, so the ticket is flagged for manual identification.",
        );
      } else {
        parts.push(
          "Muse Spark read the truck's ID placard from the clearest frame of the footage.",
        );
      }
      if (conf) parts.push(`The read carries ${conf}.`);
      if (truck) parts.push(`The clearest view was at ${truck}.`);
      break;
    }
    case "capacity": {
      if (stage.status === "flagged") {
        parts.push(
          "The identified truck was not found in the certified registry, so no certified capacity could be applied. The load still measures, but it is flagged for verification.",
        );
      } else {
        parts.push(
          "The placard read was matched to a certified truck in the registry, which supplies the bed's registered cubic-yard capacity used in the volume math.",
        );
      }
      const score = detail(stage, "match score");
      if (score) parts.push(`The registry match scored ${score}.`);
      break;
    }
    case "geometry": {
      parts.push(
        "The deterministic geometry estimator converted the bed and load masks into a fill percentage. It blends how much of the bed opening the load covers with how high the load sits against the rails, weighted by a body-type depth prior, so the number traces to the pixels rather than to a model's opinion.",
      );
      if (conf)
        parts.push(
          `The estimate carries ${conf}; lower confidence means occlusion or a near-empty or near-heaped load.`,
        );
      break;
    }
    case "spark_classify": {
      parts.push(
        "Muse Spark classified the load into one debris class, which selects the per-cubic-yard rate the valuation applies.",
      );
      if (conf) parts.push(`The classification carries ${conf}.`);
      break;
    }
    case "anomalies": {
      if (stage.status === "flagged") {
        parts.push(
          "Deterministic rules checked the measured facts against the truck's certification, capacity, and the surface-versus-depth relationship, and raised one or more flags. Muse Spark phrased each flag in plain language; the rules, not the model, decide whether a flag fires.",
        );
      } else {
        parts.push(
          "Deterministic rules checked the measured facts against certification, capacity, and the surface-versus-depth relationship, and found nothing to flag.",
        );
      }
      break;
    }
    case "dollar_math": {
      parts.push(
        "The valuation is exact arithmetic, never a model output: fill percent times the truck's certified capacity gives cubic yards, and cubic yards times the event's rate for this debris class gives the measured dollar value. Once a monitor records a call, the signed delta against that value is computed here too.",
      );
      break;
    }
    case "cache": {
      parts.push(
        "This result was served from the durable, content-hash-keyed cache. The models already ran on this exact clip, so the stored outputs were replayed with no new model call and no cost.",
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
