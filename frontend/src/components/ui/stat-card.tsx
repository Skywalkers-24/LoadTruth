"use client";

import type { ReactNode } from "react";

import { Card } from "@/components/ui/shadcn/card";
import { Progress } from "@/components/ui/shadcn/progress";
import { Sparkline } from "@/components/ui/sparkline";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "money" | "ok" | "primary";

const TONE_VALUE: Record<Tone, string> = {
  default: "text-foreground",
  money: "text-[var(--color-money)]",
  ok: "text-[var(--color-ok)]",
  primary: "text-[var(--color-brand)]",
};

const TONE_ICON_BG: Record<Tone, string> = {
  default: "bg-secondary text-muted-foreground",
  money: "bg-[var(--color-money-soft)] text-[var(--color-money)]",
  ok: "bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
  primary: "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
};

const TONE_BAR: Record<Tone, string> = {
  default: "bg-[var(--color-subtle)]",
  money: "bg-[var(--color-money)]",
  ok: "bg-[var(--color-ok)]",
  primary: "bg-[var(--color-brand)]",
};

const TONE_SPARK: Record<Tone, string> = {
  default: "var(--color-subtle)",
  money: "var(--color-money)",
  ok: "var(--color-ok)",
  primary: "var(--color-brand)",
};

/**
 * A single KPI tile. `hint` adds an info tooltip for jargon; `progress` (0..1)
 * draws a bar under the value; `trend` draws a small sparkline; `hero` adds a
 * stronger ring. A colored accent bar runs down the left edge.
 */
export function StatCard({
  label,
  value,
  sub,
  hint,
  icon,
  tone = "default",
  progress,
  trend,
  hero = false,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
  progress?: number;
  trend?: number[];
  hero?: boolean;
  compact?: boolean;
}) {
  return (
    <Card
      className={cn(
        "group relative flex h-full flex-col gap-0 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        compact ? "p-4" : "p-5",
        hero && "ring-1 ring-[var(--color-money)]/30",
      )}
    >
      {/* Left accent bar */}
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_BAR[tone])} aria-hidden />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
          {hint && (
            <Tooltip>
              <TooltipTrigger
                aria-label={`About ${label}`}
                className="text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <InfoIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-relaxed">{hint}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {icon && (
          <span
            className={cn(
              cn(
                "grid shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-105",
                compact ? "size-7" : "size-8",
              ),
              TONE_ICON_BG[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <div className={cn("flex items-end justify-between gap-2", compact ? "mt-2" : "mt-3")}>
        <div
          className={cn(
            compact ? "text-[26px]" : "text-[30px]",
            "font-bold leading-none tracking-tight tabular-nums",
            TONE_VALUE[tone],
          )}
        >
          {value}
        </div>
        {trend && trend.length > 1 && (
          <Sparkline data={trend} color={TONE_SPARK[tone]} className="mb-0.5 opacity-80" />
        )}
      </div>

      {progress !== undefined && (
        <Progress
          value={Math.round(Math.max(0, Math.min(1, progress)) * 100)}
          className={cn(compact ? "mt-2" : "mt-3", "h-1.5")}
        />
      )}

      {/* Pin the sub line to the bottom so every card in a row aligns, whether
          or not it has a progress bar above it. */}
      {sub && (
        <p
          className={cn(
            "mt-auto text-muted-foreground",
            compact ? "pt-1.5 text-[11px] leading-snug" : "pt-2 text-[12px]",
          )}
        >
          {sub}
        </p>
      )}
    </Card>
  );
}
