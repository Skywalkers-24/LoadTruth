"use client";

import type { ReactNode } from "react";

import { Card } from "@/components/ui/shadcn/card";
import { Progress } from "@/components/ui/shadcn/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";
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

/**
 * A single KPI tile. `hint` renders an info tooltip for jargon. `progress` (0..1)
 * draws a thin bar under the value. `hero` gives a stronger border/background.
 */
export function StatCard({
  label,
  value,
  sub,
  hint,
  icon,
  tone = "default",
  progress,
  hero = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
  progress?: number;
  hero?: boolean;
}) {
  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden p-5 transition-shadow hover:shadow-md",
        hero && "ring-1 ring-[var(--color-money)]/30",
      )}
    >
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
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONE_ICON_BG[tone])}>
            {icon}
          </span>
        )}
      </div>

      <div className={cn("mt-3 text-[30px] font-bold leading-none tracking-tight tabular-nums", TONE_VALUE[tone])}>
        {value}
      </div>

      {progress !== undefined && (
        <Progress
          value={Math.round(Math.max(0, Math.min(1, progress)) * 100)}
          className="mt-3 h-1.5"
        />
      )}

      {sub && <p className="mt-2 text-[12px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}
