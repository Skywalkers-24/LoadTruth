"use client";

import { useState } from "react";
import {
  ArrowUpRightIcon,
  CheckCircle2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { PipelineStage } from "@/lib/api";
import { PipelineTrace } from "./pipeline-trace";
import { StageInspectorDrawer } from "./stage-inspector-drawer";
import { cn } from "@/lib/utils";

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  {
    key: "sam_track",
    label: "Track & segment",
    model: "Meta SAM 3.1",
    status: "ok",
    summary: "Meta SAM 3.1 outlines the truck bed and debris pile across video frames.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Meta SAM 3.1 watches the truck footage and draws outlines around the truck bed and the loaded debris across each frame. These outlines show exactly how full the truck is without manual measuring.",
    details: [
      ["Vision Model", "Meta SAM 3.1 (Segment Anything Model)"],
      ["Input Footage", "High-definition video clip or sequential camera frames"],
      ["Detection Target", "Truck body, bed boundaries, and loaded debris pile"],
      ["Live Status", "Ready to process on video upload"],
    ],
  },
  {
    key: "spark_ocr",
    label: "Read placard",
    model: "Meta Muse Spark 1.3",
    status: "ok",
    summary: "Meta Muse Spark reads the truck ID number from the vehicle placard.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Meta Muse Spark reads the hauler's official placard or door stencil ID from the clearest video frame so the haul is credited to the right driver and contractor in county records.",
    details: [
      ["AI Model", "Meta Muse Spark 1.3 Vision-Language"],
      ["Target Location", "Truck door stencil, side placard, or trailer ID"],
      ["Verification", "Matches against county registered hauler list"],
      ["Live Status", "Ready to process on video upload"],
    ],
  },
  {
    key: "capacity",
    label: "Capacity lookup",
    model: "County Registry",
    status: "ok",
    summary: "Looks up the truck's certified cubic-yard size in official county records.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Checks the identified truck against the official county hauler registry to pull its certified bed capacity in cubic yards. This ensures payment calculations use officially verified truck dimensions.",
    details: [
      ["Database", "County Certified Hauler Registry"],
      ["Certified Size", "Official truck bed volume in cubic yards (CY)"],
      ["Contractor Check", "Confirms active certification and valid hauling permit"],
      ["Live Status", "Ready to process on video upload"],
    ],
  },
  {
    key: "geometry",
    label: "Measure fill",
    model: "Load Math",
    status: "ok",
    summary: "Calculates the exact percentage the truck bed is filled from the video outlines.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Combines the Meta SAM 3.1 outlines with the truck bed height to calculate the exact fill percentage (0% to 100%). This calculates load volume directly from video frames instead of human guesswork.",
    details: [
      ["Calculation Basis", "Visual load outline compared against bed rails"],
      ["Measurement Range", "0% (empty) to 100%+ (heaped load)"],
      ["Transparency", "Calculated directly from video pixels without guessing"],
      ["Live Status", "Ready to process on video upload"],
    ],
  },
  {
    key: "spark_classify",
    label: "Classify debris",
    model: "Meta Muse Spark 1.3",
    status: "ok",
    summary: "Meta Muse Spark identifies the debris material to apply the correct pay rate.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Meta Muse Spark inspects the video to identify the debris type (such as Trees & Brush, Construction Waste, or Bulky Items). This determines the contract reimbursement rate per cubic yard.",
    details: [
      ["AI Model", "Meta Muse Spark 1.3 Visual Reasoning"],
      ["Common Categories", "Vegetative / Trees, Construction & Demolition, Bulky Goods"],
      ["Contract Rate", "Sets the billing rate per cubic yard"],
      ["Live Status", "Ready to process on video upload"],
    ],
  },
  {
    key: "anomalies",
    label: "Flag anomalies",
    model: "Meta Muse Spark 1.3",
    status: "ok",
    summary: "Checks for billing discrepancies like overfilling or empty pockets.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Automated compliance checks and Meta Muse Spark check for anything abnormal, such as an overfilled bed, hidden empty voids, or an uncertified truck. If an issue is found, it flags the ticket for supervisor review.",
    details: [
      ["Audit Checks", "Overfilled loads, large voids, uncertified vehicles"],
      ["Supervisor Review", "Automatically alerts reviewers if an anomaly is detected"],
      ["Compliance Standard", "FEMA disaster-debris reimbursement guidelines"],
      ["Live Status", "Ready to process on video upload"],
    ],
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
  const displayStages = filteredStages.length > 0 ? filteredStages : DEFAULT_PIPELINE_STAGES;

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
          <SummaryField label="Debris" value={summary.debris ?? "N/A"} />
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
          const isSelected = i === selectedIndex;
          const isReady = s.duration_ms == null || s.duration_ms === 0;
          return (
            <li key={`${s.key}-${i}`} className="min-w-0">
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleStageClick(i)}
                className={cn(
                  "group relative flex h-full w-full flex-col justify-between rounded-xl border border-border bg-secondary/30 p-2.5 text-left transition-all hover:border-primary/60 hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isSelected && "border-primary bg-primary/10 ring-1 ring-primary shadow-xs",
                )}
              >
                <div>
                  <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Stage {String(i + 1).padStart(2, "0")}</span>
                    {s.status === "flagged" ? (
                      <TriangleAlertIcon className="size-3.5 text-[var(--color-warn)]" />
                    ) : (
                      <CheckCircle2Icon className="size-3.5 text-[var(--color-ok)]" />
                    )}
                  </div>
                  <div className="mt-1 text-[12px] font-semibold leading-tight text-foreground group-hover:text-primary transition-colors truncate">
                    {s.label}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[9.5px] text-muted-foreground">
                    {s.model}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5 text-[10px]">
                  <span className="text-muted-foreground truncate">
                    {s.status === "flagged"
                      ? "Flagged"
                      : s.status === "skipped"
                        ? "Skipped"
                        : isReady
                          ? "Ready"
                          : "Done"}
                    {" · "}
                    {isReady ? "Live" : `${(s.duration_ms! / 1000).toFixed(1)}s`}
                  </span>
                  <span className="inline-flex items-center text-[9px] font-medium text-primary opacity-70 group-hover:opacity-100 transition-opacity">
                    Inspect
                    <ArrowUpRightIcon className="ml-0.5 size-2.5" />
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
      <span className="truncate text-[13px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
