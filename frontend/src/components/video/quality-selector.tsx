"use client";

import { useState, useRef, useEffect } from "react";
import { CheckIcon, GaugeIcon } from "lucide-react";
import {
  useVideoQuality,
  type VideoQualityTier,
  getQualityLabel,
  getQualityBadge,
} from "@/lib/video-quality";
import { cn } from "@/lib/utils";

interface QualitySelectorProps {
  className?: string;
  onQualityChange?: (quality: VideoQualityTier) => void;
  align?: "left" | "right";
}

const TIERS: Array<{ id: VideoQualityTier; label: string; desc: string }> = [
  { id: "auto", label: "Auto", desc: "Adaptive · fast start on mobile & slow links" },
  { id: "high", label: "HD", desc: "Original master resolution · maximum clarity" },
  { id: "medium", label: "720p", desc: "Balanced · crisp details & smooth streaming" },
  { id: "low", label: "480p", desc: "Lightweight · fastest buffering & data saver" },
];

export function QualitySelector({
  className,
  onQualityChange,
  align = "right",
}: QualitySelectorProps) {
  const { tier, resolvedTier, setQuality } = useVideoQuality();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const selectTier = (next: VideoQualityTier) => {
    setQuality(next);
    onQualityChange?.(next);
    setOpen(false);
  };

  const badge = getQualityBadge(tier, resolvedTier);

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Video quality: ${badge}. Click to change quality`}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded bg-white/10 px-2 py-1 text-xs font-medium text-white/90 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-white/50"
      >
        <GaugeIcon className="size-3.5 text-white/70" />
        <span>{badge}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className={cn(
            "absolute bottom-full mb-2 z-50 w-56 rounded-lg border border-border/80 bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-md transition-all animate-in fade-in-0 zoom-in-95",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Video Quality
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {TIERS.map(({ id, label, desc }) => {
              const active = tier === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  onClick={() => selectTier(id)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                    active
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-foreground hover:bg-muted/70",
                  )}
                >
                  <span className="mt-0.5 flex size-3.5 items-center justify-center shrink-0">
                    {active && <CheckIcon className="size-3.5 text-primary" />}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-medium leading-none">
                      {label}
                      {id === "auto" && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
                          ({resolvedTier === "high" ? "HD" : resolvedTier === "medium" ? "720p" : "480p"})
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
                      {desc}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

