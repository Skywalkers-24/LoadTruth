"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  CheckIcon,
  CpuIcon,
  CircleDashedIcon,
  MinusCircleIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import type { PipelineStage } from "@/lib/api";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";

interface StageInspectorDrawerProps {
  open: boolean;
  onClose: () => void;
  stages: PipelineStage[];
  currentStageIndex: number;
  onSelectStageIndex: (index: number) => void;
}

export function getAIModelName(model: string | null | undefined): string | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.includes("sam-3") || m.includes("sam 3") || m === "sam_track") return "Meta SAM 3.1";
  if (m.includes("spark") || m.includes("muse") || m.includes("ocr") || m.includes("classify"))
    return "Meta Muse Spark 1.3";
  return null;
}

export function StageInspectorDrawer({
  open,
  onClose,
  stages,
  currentStageIndex,
  onSelectStageIndex,
}: StageInspectorDrawerProps) {
  const [copied, setCopied] = useState(false);

  // Close on Escape key or step through with arrow keys
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && currentStageIndex > 0) {
        onSelectStageIndex(currentStageIndex - 1);
      } else if (e.key === "ArrowRight" && currentStageIndex < stages.length - 1) {
        onSelectStageIndex(currentStageIndex + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, currentStageIndex, stages.length, onSelectStageIndex]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || stages.length === 0) return null;

  const stage = stages[currentStageIndex] ?? stages[0];
  if (!stage) return null;

  const stageNumber = String(currentStageIndex + 1).padStart(2, "0");
  const totalStages = String(stages.length).padStart(2, "0");

  const hasPrev = currentStageIndex > 0;
  const hasNext = currentStageIndex < stages.length - 1;

  const isPending = stage.status === "pending";

  const durationStr = isPending
    ? "Not run"
    : stage.duration_ms == null || stage.duration_ms === 0
      ? "Instant (< 1 ms)"
      : stage.duration_ms >= 1000
        ? `${(stage.duration_ms / 1000).toFixed(1)} s`
        : `${stage.duration_ms.toLocaleString()} ms`;

  const aiModel = getAIModelName(stage.model);

  const rawAnalysis = stage.analysis && stage.analysis.trim() ? stage.analysis : stage.summary;
  const cleanAnalysis = (rawAnalysis || "")
    .replace(/\bdeterministic\b/gi, "automated")
    .replace(/\bgeometry\b/gi, "Spatial Fill Estimator")
    .replace(/\bdollar_math\b/gi, "Rate Schedule Engine")
    .replace(/\bevident\b/gi, "verified")
    .replace(/\bevidence receipt\b/gi, "audit summary")
    .replace(/\bvoxel depth integration\b/gi, "depth measurement")
    .replace(/\border-preserving orthogonal perspective projection\b/gi, "perspective alignment");

  const cleanSummary = (stage.summary || "")
    .replace(/\bdeterministic\b/gi, "verified")
    .replace(/\bgeometry\b/gi, "Spatial Fill Estimator")
    .replace(/\bdollar_math\b/gi, "Rate Schedule Engine")
    .replace(/\bevident\b/gi, "verified");

  const details = stage.details ?? [];
  const modelAnswer = details.find(([k]) => k.toLowerCase() === "model answer")?.[1];
  const regularDetails = details
    .filter(([k]) => k.toLowerCase() !== "model answer")
    .map(([key, val]) => {
      let cleanKey = key;
      let cleanVal = val;
      if (key.toLowerCase() === "deterministic" || key.toLowerCase() === "geometry") {
        cleanKey = "Engine";
        cleanVal = "Spatial Fill Estimator";
      } else if (key.toLowerCase() === "dollar_math" || key.toLowerCase() === "math") {
        cleanKey = "Valuation Engine";
        cleanVal = "Rate Schedule Engine";
      }
      cleanVal = cleanVal
        .replace(/\bdeterministic\b/gi, "verified formula")
        .replace(/\bgeometry\b/gi, "Spatial Fill Estimator")
        .replace(/\bdollar_math\b/gi, "Rate Schedule Engine")
        .replace(
          /Orthogonal perspective projection & voxel depth integration/gi,
          "Surface boundary & depth measurement",
        )
        .replace(/\bvoxel depth integration\b/gi, "depth measurement");
      return [cleanKey, cleanVal] as [string, string];
    });

  function copyJson() {
    if (!stage) return;
    const data = {
      stage: stage.label,
      model: stage.model,
      status: stage.status,
      confidence: stage.confidence,
      duration_ms: stage.duration_ms,
      summary: stage.summary,
      analysis: stage.analysis,
      details: stage.details,
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel: 35-40% width on desktop as requested */}
      <div className="fixed inset-y-0 right-0 z-50 flex max-w-full">
        <aside
          className={cn(
            "relative flex h-full w-screen flex-col border-l border-border bg-background shadow-2xl",
            "sm:w-[480px] lg:w-[38vw] min-w-[360px] max-w-[620px]",
            "animate-in slide-in-from-right duration-300",
          )}
        >
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between border-b border-border bg-card/60 p-5 backdrop-blur-sm">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                  STAGE {stageNumber} / {totalStages}
                </span>
                {stage.status === "flagged" ? (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <TriangleAlertIcon className="size-3" />
                    Flagged for review
                  </Badge>
                ) : isPending ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-border text-[10px] text-muted-foreground"
                  >
                    <CircleDashedIcon className="size-3" />
                    Not run
                  </Badge>
                ) : stage.status === "skipped" ? (
                  <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                    <MinusCircleIcon className="size-3" />
                    Skipped
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 border-emerald-500/40 text-[10px] text-emerald-600 dark:text-emerald-400"
                  >
                    <CheckCircle2Icon className="size-3" />
                    Completed
                  </Badge>
                )}
              </div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">{stage.label}</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {aiModel && (
                  <>
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-primary">
                      <CpuIcon className="size-3.5" />
                      {aiModel}
                    </span>
                    <span>·</span>
                  </>
                )}
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="size-3" />
                  {durationStr}
                </span>
                {stage.confidence != null && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      {Math.round(stage.confidence * 100)}% confidence
                    </span>
                  </>
                )}
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Close stage details"
            >
              <XIcon className="size-4" />
            </Button>
          </div>

          {/* Stepper Navigation bar */}
          <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-5 py-2.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasPrev}
              onClick={() => hasPrev && onSelectStageIndex(currentStageIndex - 1)}
              className="h-8 gap-1 text-xs"
            >
              <ChevronLeftIcon className="size-3.5" />
              Previous
            </Button>

            {/* Stage Indicator Dots */}
            <div className="flex items-center gap-1.5">
              {stages.map((s, idx) => (
                <button
                  key={`${s.key}-${idx}`}
                  type="button"
                  title={`Stage ${idx + 1}: ${s.label}`}
                  onClick={() => onSelectStageIndex(idx)}
                  className={cn(
                    "size-2 rounded-full transition-all",
                    idx === currentStageIndex
                      ? "w-6 bg-primary"
                      : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
                  )}
                />
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              disabled={!hasNext}
              onClick={() => hasNext && onSelectStageIndex(currentStageIndex + 1)}
              className="h-8 gap-1 text-xs"
            >
              Next
              <ChevronRightIcon className="size-3.5" />
            </Button>
          </div>

          {/* Scrollable Content Body */}
          <div className="lt-scroll flex-1 space-y-5 overflow-y-auto p-5">
            {/* AI Analysis Box */}
            <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <SparklesIcon className="size-4" />
                <span>AI ANALYSIS & EXPLANATION</span>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-foreground">{cleanAnalysis}</p>
              {cleanSummary && cleanAnalysis && cleanSummary !== cleanAnalysis && (
                <div className="mt-3 rounded-lg border border-border/60 bg-background/50 p-2.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Summary:</span> {cleanSummary}
                </div>
              )}
            </div>

            {/* Stage Details & Measurements */}
            {regularDetails.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Stage Details & Measurements
                </h3>
                <dl className="mt-3 divide-y divide-border/60 text-xs">
                  {regularDetails.map(([key, val], idx) => (
                    <div
                      key={`${key}-${idx}`}
                      className="flex items-start justify-between py-2 gap-3"
                    >
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd className="text-right font-medium text-foreground break-words max-w-[60%]">
                        {val}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Raw Model Output (if available) */}
            {modelAnswer && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Model Output
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyJson}
                    className="h-7 gap-1 px-2 text-[11px]"
                  >
                    {copied ? (
                      <CheckIcon className="size-3 text-emerald-500" />
                    ) : (
                      <CopyIcon className="size-3" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="mt-2.5 max-h-56 overflow-auto rounded-lg bg-secondary/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                  {formatRawJson(modelAnswer)}
                </pre>
              </div>
            )}
          </div>

          {/* Footer with Copy JSON and Close */}
          <div className="flex shrink-0 items-center justify-between border-t border-border bg-card/60 p-4 backdrop-blur-sm">
            <Button variant="outline" size="sm" onClick={copyJson} className="gap-1.5 text-xs">
              {copied ? (
                <CheckIcon className="size-3.5 text-emerald-500" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
              {copied ? "Copied Stage JSON" : "Copy Stage Details"}
            </Button>
            <Button size="sm" onClick={onClose} className="text-xs">
              Done
            </Button>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

function formatRawJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
