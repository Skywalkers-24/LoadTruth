"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  MinusCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { PipelineStage } from "@/lib/api";
import { PipelineTrace } from "./pipeline-trace";
import { StageInspectorDrawer } from "./stage-inspector-drawer";
import { cn } from "@/lib/utils";

function cleanModelName(model: string | null | undefined, key?: string): string {
  if (!model) return "";
  const m = model.toLowerCase();
  if (m === "geometry" || key === "geometry") return "Spatial Fill Estimator";
  if (m === "dollar_math" || m === "math" || key === "dollar_math") return "Rate Schedule Engine";
  if (m === "capacity" || key === "capacity") return "Certified Vehicle Registry";
  if (m === "anomalies" || key === "anomalies") return "FEMA Rules Engine";
  if (m === "deterministic") return "Spatial Fill Estimator";
  return model;
}

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  {
    key: "sam_track",
    label: "Outline truck and load",
    model: "Meta SAM 3.1",
    status: "pending",
    summary: "AI outlines the truck bed and visible load in the video.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "AI outlines the truck, bed, and visible load across the video. These outlines support review; the fill estimate is calculated separately.",
    details: [
      ["Vision Model", "Meta SAM 3.1 (Segment Anything Model)"],
      ["Input Footage", "High-definition video clip or sequential camera frames"],
      ["Detection Target", "Truck body, bed boundaries, and loaded debris pile"],
    ],
  },
  {
    key: "spark_ocr",
    label: "Read truck number",
    model: "Meta Muse Spark 1.3",
    status: "pending",
    summary: "AI reads the truck placard.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "AI reads the truck placard from the clearest video frame so the load can be matched to the right truck and hauler in county records.",
    details: [
      ["AI Model", "Meta Muse Spark 1.3 Vision-Language"],
      ["Where it appears", "Truck door, side label, or trailer"],
      ["Verification", "Matches against county registered hauler list"],
    ],
  },
  {
    key: "capacity",
    label: "Certified Vehicle Registry",
    model: "Certified Vehicle Registry",
    status: "pending",
    summary: "Looks up the truck's certified cubic-yard size in official county records.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Checks the identified truck against the official county hauler registry to pull its certified bed capacity in cubic yards. This ensures payment calculations use officially verified truck dimensions.",
    details: [
      ["Database", "County Certified Hauler Registry"],
      ["Certified Size", "Official truck bed volume in cubic yards (CY)"],
      ["Contractor Check", "Confirms active certification and valid hauling permit"],
    ],
  },
  {
    key: "geometry",
    label: "Spatial Fill Estimator",
    model: "Spatial Fill Estimator",
    status: "pending",
    summary: "Combines fill estimates from selected video frames.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "AI estimates how full the truck looks in selected frames, then combines those estimates. Truck and load outlines do not determine the fill percentage.",
    details: [
      ["Calculation Basis", "Spatial fill analysis of selected video frames"],
      ["Estimate Range", "0% (empty) to 100% (full to bed rails)"],
      ["Combination", "Median value of the frame estimates"],
    ],
  },
  {
    key: "spark_classify",
    label: "Identify material",
    model: "Meta Muse Spark 1.3",
    status: "pending",
    summary: "AI identifies the debris type to apply the correct rate.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "AI reviews the video to identify the debris type, such as branches, construction debris, or bulky items. This selects the contract rate per cubic yard.",
    details: [
      ["AI Model", "Meta Muse Spark 1.3 Visual Reasoning"],
      ["Common Categories", "Vegetative / Trees, Construction & Demolition, Bulky Goods"],
      ["Contract Rate", "Sets the billing rate per cubic yard"],
    ],
  },
  {
    key: "anomalies",
    label: "FEMA Rules Engine",
    model: "FEMA Rules Engine",
    status: "pending",
    summary: "Checks identity, certification, capacity, and cycle-time rules.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Automated FEMA rules verify identity, certification, capacity, and cycle-time requirements. Monitors review the visual estimate and can flag visual concerns during review.",
    details: [
      ["Audit Checks", "Identity, certification, capacity, and cycle time"],
      ["Supervisor Review", "Monitors review the visual estimate and can flag concerns"],
      ["Compliance Standard", "FEMA disaster-debris reimbursement guidelines"],
    ],
  },
  {
    key: "dollar_math",
    label: "Rate Schedule Engine",
    model: "Rate Valuation",
    status: "pending",
    summary:
      "Calculates the payout: certified truck size multiplied by the fill percentage and the debris rate per cubic yard.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Calculates the payout: certified truck size multiplied by the fill percentage and the debris rate per cubic yard.",
    details: [["Calculation Method", "Certified Cubic Yards × Fill % × Debris Unit Rate"]],
  },
];

export interface PipelineWorkbenchSummary {
  truck?: string;
  debris?: string;
  value?: string;
  flags?: number | string;
}

/** Stage graph with side inspector modal. Fits completely on screen. */
export function PipelineWorkbench({
  stages,
  summary,
  showInlineTrace = false,
}: {
  stages: PipelineStage[];
  summary?: PipelineWorkbenchSummary;
  /** Keep false for clean view; only set to true if testing inline accordion. */
  showInlineTrace?: boolean;
}) {
  const filteredStages = stages.filter((s) => s.key !== "cache");
  const stageMap = new Map(filteredStages.map((s) => [s.key, s]));
  const defaultKeys = new Set(DEFAULT_PIPELINE_STAGES.map((s) => s.key));

  const hasStandardKeys = filteredStages.some((s) => defaultKeys.has(s.key));
  const displayStages = hasStandardKeys
    ? [
        ...DEFAULT_PIPELINE_STAGES.map((def) => {
          const incoming = stageMap.get(def.key);
          return incoming
            ? { ...def, ...incoming }
            : {
                ...def,
                status: "pending" as const,
                summary: "This step has not run in the current analysis.",
                analysis: "This step has not run in the current analysis.",
                details: [],
              };
        }),
        ...filteredStages.filter((s) => !defaultKeys.has(s.key)),
      ]
    : filteredStages.length > 0
      ? filteredStages
      : DEFAULT_PIPELINE_STAGES;

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auto-focus the latest arriving/completed stage as the pipeline progresses
  const latestCompletedKey = filteredStages[filteredStages.length - 1]?.key;
  useEffect(() => {
    if (latestCompletedKey) {
      const idx = displayStages.findIndex((s) => s.key === latestCompletedKey);
      if (idx >= 0) {
        setSelectedIndex(idx);
      }
    }
  }, [latestCompletedKey, displayStages]);

  const currentStage = displayStages[selectedIndex] ?? displayStages[0]!;

  function handleStageClick(index: number) {
    setSelectedIndex(index);
    setDrawerOpen(true);
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {/* Top summary row if provided */}
      {summary && (
        <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-border bg-secondary/40 p-3 sm:grid-cols-4">
          <SummaryField label="Truck" value={summary.truck ?? "Unidentified"} />
          <SummaryField label="Material" value={summary.debris ?? "N/A"} />
          <SummaryField label="Value" value={summary.value ?? "N/A"} />
          <SummaryField label="Flags" value={String(summary.flags ?? 0)} />
        </div>
      )}

      {/* Responsive stage cards grid: all 7 stages line up across the screen on desktop */}
      <ol
        aria-label="Analysis stages"
        className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7"
      >
        {displayStages.map((s, i) => {
          const isPending = s.status === "pending";
          const isSelected = i === selectedIndex && !isPending;
          const duration = s.duration_ms > 0 ? ` · ${(s.duration_ms / 1000).toFixed(1)}s` : "";
          return (
            <li key={`${s.key}-${i}`} className="min-w-0">
              <button
                type="button"
                aria-pressed={isSelected}
                aria-disabled={isPending}
                onClick={() => handleStageClick(i)}
                className={cn(
                  "group relative flex h-full w-full flex-col justify-between rounded-xl border border-border bg-secondary/30 p-3 text-left transition-all hover:border-[var(--brand)] hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isPending && "cursor-default opacity-50 grayscale",
                  isSelected &&
                    "border-[var(--brand)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand)] shadow-xs",
                )}
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Step {String(i + 1).padStart(2, "0")}</span>
                    {s.status === "flagged" ? (
                      <TriangleAlertIcon className="size-3.5 text-[var(--color-warn)]" />
                    ) : s.status === "skipped" ? (
                      <MinusCircleIcon className="size-3.5 text-muted-foreground" />
                    ) : isPending ? (
                      <CircleDashedIcon className="size-3.5 text-muted-foreground" />
                    ) : (
                      <CheckCircle2Icon className="size-3.5 text-[var(--color-ok)]" />
                    )}
                  </div>
                  <div className="mt-2 text-[13px] font-semibold leading-snug text-foreground">
                    {s.label}
                  </div>
                  <div
                    title={cleanModelName(s.model, s.key)}
                    className="mt-1 min-h-8 break-words text-[11px] leading-4 text-muted-foreground"
                  >
                    {cleanModelName(s.model, s.key)}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border pt-2 text-[11px]">
                  <span className="text-muted-foreground truncate">
                    {isPending
                      ? "Not run"
                      : s.status === "flagged"
                        ? `Flagged${duration}`
                        : s.status === "skipped"
                          ? `Skipped${duration}`
                          : `Done${duration}`}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground">
                    View details
                    <ArrowUpRightIcon className="size-3.5 text-[var(--color-brand)]" />
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Inline Stage Output Panel - ONLY rendered if explicitly enabled (e.g., test harness) */}
      {showInlineTrace && (
        <div className="min-h-56 rounded-xl border border-border bg-background/50 p-4 sm:p-5">
          <PipelineTrace key={currentStage.key} stages={[currentStage]} defaultExpanded />
        </div>
      )}

      {/* 35-40% Width Slide-over Right Drawer */}
      <StageInspectorDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stages={displayStages}
        currentStageIndex={selectedIndex}
        onSelectStageIndex={setSelectedIndex}
      />
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate text-[13px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}
