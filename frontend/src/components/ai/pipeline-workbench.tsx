"use client";

import { useState } from "react";
import { CheckCircle2Icon, ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import type { PipelineStage } from "@/lib/api";
import { PipelineTrace } from "./pipeline-trace";
import { cn } from "@/lib/utils";

/** CI-style stage graph with the selected stage's actual output below it. */
export function PipelineWorkbench({ stages }: { stages: PipelineStage[] }) {
  stages = stages.filter((s) => s.key !== "cache");
  const [selected, setSelected] = useState<string | null>(null);
  const stage = stages.find((s) => s.key === selected) ?? stages[0];
  if (!stage) return null;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="overflow-x-auto pb-2">
        <ol aria-label="Analysis stages" className="flex min-w-max items-stretch gap-2">
          {stages.map((s, i) => (
            <li key={`${s.key}-${i}`} className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={s === stage}
                onClick={() => setSelected(s.key)}
                className={cn(
                  "flex w-44 flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  s === stage && "border-primary bg-primary/10 ring-1 ring-primary",
                )}
              >
                <span className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Stage {String(i + 1).padStart(2, "0")}
                  {s.status === "flagged" ? (
                    <TriangleAlertIcon className="size-4 text-[var(--color-warn)]" />
                  ) : (
                    <CheckCircle2Icon className="size-4 text-[var(--color-ok)]" />
                  )}
                </span>
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="max-w-full truncate font-mono text-[10px] text-muted-foreground">
                  {s.model}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.status === "flagged"
                    ? "Flagged"
                    : s.status === "skipped"
                      ? "Skipped"
                      : "Completed"}{" "}
                  ·{" "}
                  {s.duration_ms == null
                    ? "Time unavailable"
                    : `${(s.duration_ms / 1000).toFixed(1)} s`}
                </span>
              </button>
              {i < stages.length - 1 && (
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              )}
            </li>
          ))}
        </ol>
      </div>
      <div className="min-h-64 rounded-xl border border-border bg-background/50 p-4 sm:p-5">
        <PipelineTrace key={stage.key} stages={[stage]} defaultExpanded />
      </div>
    </div>
  );
}
