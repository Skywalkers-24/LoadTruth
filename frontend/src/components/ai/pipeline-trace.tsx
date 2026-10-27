"use client";

import { CheckIcon, TriangleAlertIcon, ZapIcon } from "lucide-react";

import type { PipelineStage } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--color-ok)",
  flagged: "var(--color-warn)",
  skipped: "var(--color-subtle)",
};

/**
 * The visible AI pipeline trace for one clip: each stage the models ran, what it
 * produced, and its confidence. Makes the AI work legible instead of a black box.
 */
export function PipelineTrace({ stages, compact = false }: { stages: PipelineStage[]; compact?: boolean }) {
  if (stages.length === 0) {
    return <p className="text-[12px] text-muted-foreground">No pipeline trace is available for this ticket.</p>;
  }
  return (
    <ol className="relative flex flex-col">
      {stages.map((s, i) => {
        const color = STATUS_COLOR[s.status] ?? "var(--color-brand)";
        const last = i === stages.length - 1;
        return (
          <li key={`${s.key}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
            {/* Rail */}
            {!last && (
              <span
                className="absolute left-[11px] top-6 h-full w-px bg-border"
                aria-hidden
              />
            )}
            <span
              className="relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
            >
              {s.status === "flagged" ? (
                <TriangleAlertIcon className="size-3.5" />
              ) : s.model === "cache" ? (
                <ZapIcon className="size-3.5" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{s.label}</span>
                <span className="flex items-center gap-2">
                  {s.confidence != null && (
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {Math.round(s.confidence * 100)}%
                    </span>
                  )}
                  {!compact && (
                    <span className="font-mono text-[10px] text-muted-foreground">{s.model}</span>
                  )}
                </span>
              </div>
              <p className={cn("text-[12px] leading-snug", s.status === "flagged" ? "text-[var(--color-warn)]" : "text-muted-foreground")}>
                {s.summary}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
