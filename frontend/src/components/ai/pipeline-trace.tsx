"use client";

import { useState } from "react";
import { CheckIcon, ChevronRightIcon, ClockIcon, CpuIcon, TriangleAlertIcon, ZapIcon } from "lucide-react";

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
export function PipelineTrace({ stages, compact = false }: { stages: PipelineStage[]; compact?: boolean }) {
  // Track which stage keys are expanded. A Set lets several be open at once.
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (stages.length === 0) {
    return <p className="text-[12px] text-muted-foreground">No pipeline trace is available for this ticket.</p>;
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
            {!last && <span className="absolute left-[11px] top-7 h-[calc(100%-0.5rem)] w-px bg-border" aria-hidden />}
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
                <div className="lt-fade-in ml-[22px] mt-1 flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 p-3">
                  <p
                    className={cn(
                      "text-[12.5px] leading-relaxed",
                      s.status === "flagged" ? "text-[var(--color-warn)]" : "text-foreground",
                    )}
                  >
                    {s.summary}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4">
                    <Detail label="Status" value={STATUS_LABEL[s.status] ?? s.status} color={color} />
                    <Detail label="Model" value={s.model} mono />
                    <Detail
                      label="Confidence"
                      value={s.confidence != null ? `${Math.round(s.confidence * 100)}%` : "—"}
                    />
                    <Detail
                      label="Duration"
                      value={s.duration_ms != null ? `${s.duration_ms.toLocaleString()} ms` : "—"}
                      icon={<ClockIcon className="size-3" />}
                    />
                  </dl>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
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
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={cn("flex items-center gap-1 truncate text-[11.5px] font-semibold", mono && "font-mono")}
        style={color ? { color } : undefined}
      >
        {icon}
        {value}
      </dd>
    </div>
  );
}
