"use client";

import { useState } from "react";
import { CheckCircle2Icon, ChevronRightIcon, PanelRightOpenIcon, TriangleAlertIcon } from "lucide-react";
import type { PipelineStage } from "@/lib/api";
import { PipelineTrace } from "./pipeline-trace";
import { StageInspectorDrawer } from "./stage-inspector-drawer";
import { Button } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  {
    key: "sam_track",
    label: "Track and segment",
    model: "sam-3.1",
    status: "ok",
    summary: "Meta SAM 3.1 tracks the truck bed and debris pile across sampled video frames.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Meta SAM 3.1 segments the truck body, bed rim, and debris pile across video frames. It produces high-precision pixel masks that serve as the foundational visual ground truth for all geometric volume and fill measurements.",
    details: [
      ["Framework", "Meta Segment Anything Model (SAM 3.1)"],
      ["Input", "High-definition video clip or sequential camera frames"],
      ["Primary Output", "Binary segmentation masks for truck bed and debris pile"],
      ["Deterministic", "No — zero-shot foundation vision model"],
    ],
  },
  {
    key: "spark_ocr",
    label: "Read placard",
    model: "muse-spark-1.3",
    status: "ok",
    summary: "Muse Spark extracts the truck placard ID from the clearest footage frame.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Muse Spark identifies and transcribes the hauler's official placard or stencil ID number from the sharpest video frame. This string is matched directly against county registration records.",
    details: [
      ["Model", "Meta Muse Spark 1.3 Vision-Language"],
      ["Target", "Truck door stencil, side placard, or trailer ID"],
      ["Verification", "Strict regex validation against registered hauler fleet formats"],
    ],
  },
  {
    key: "capacity",
    label: "Capacity lookup",
    model: "registry",
    status: "ok",
    summary: "Determines certified cubic yard capacity from the certified truck registry.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Capacity lookup is an authoritative deterministic database query. The identified placard is matched to the certified registry to load the certified water-level cubic yardage and allowable bed dimensions.",
    details: [
      ["Engine", "County Certified Hauler Registry"],
      ["Deterministic", "Yes — 100% auditable database lookup"],
      ["Outputs", "Certified capacity (cubic yards), tare weight, bed dimensions"],
    ],
  },
  {
    key: "geometry",
    label: "Measure fill",
    model: "geometry",
    status: "ok",
    summary: "Deterministic volumetric geometry calculates exact load percentage from masks.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "The deterministic geometry engine projects the SAM 3.1 load masks onto the truck bed rails. It calculates volumetric fill percentage by blending surface area coverage with depth profiles, immune to prompt drift.",
    details: [
      ["Method", "Orthogonal perspective projection & voxel depth integration"],
      ["Deterministic", "Yes — mathematical formula with zero hallucinations"],
      ["Auditable", "Reproducible offline via cryptographic evidence receipt"],
    ],
  },
  {
    key: "spark_classify",
    label: "Classify debris",
    model: "muse-spark-1.3",
    status: "ok",
    summary: "Muse Spark classifies debris type to apply the contract unit rate.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Muse Spark visual reasoning inspects the texture, material composition, and load uniformity to classify the debris (e.g. Vegetative, C&D, White Goods, Hazardous) for FEMA reimbursement rate calculation.",
    details: [
      ["Model", "Meta Muse Spark 1.3 Vision Reasoning"],
      ["Classes", "Vegetative, Construction & Demolition (C&D), White goods, Electronics"],
      ["Rate Applied", "Contract-specific per-cubic-yard schedule"],
    ],
  },
  {
    key: "anomalies",
    label: "Flag anomalies",
    model: "muse-spark-1.3",
    status: "ok",
    summary: "Automated audit rules check for overfilling, void cavities, or tampering.",
    confidence: null,
    duration_ms: 0,
    analysis:
      "Guardrail rules check for geometric impossibilities, over-capacity disputes, excessive void spaces, or placard mismatches. Muse Spark articulates specific plain-language rationale for flagged items.",
    details: [
      ["Rule Engine", "FEMA Audit Compliance Rulebook"],
      ["Monitored Flags", "Overfill >100%, Cavity/Void detected, Uncertified truck, Rate mismatch"],
      ["Action", "Routes ticket to human reviewer if any flag triggers"],
    ],
  },
];

export interface PipelineWorkbenchSummary {
  truck?: string;
  debris?: string;
  value?: string;
  flags?: number | string;
}

/** CI-style stage graph with interactive 35-40% right-side inspector modal and trace. */
export function PipelineWorkbench({
  stages,
  summary,
}: {
  stages: PipelineStage[];
  summary?: PipelineWorkbenchSummary;
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
    <div className="flex min-w-0 flex-col gap-4">
      {/* Top summary row if provided */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/40 p-3 sm:grid-cols-4">
          <SummaryField label="Truck" value={summary.truck ?? "Unidentified"} />
          <SummaryField label="Debris" value={summary.debris ?? "N/A"} />
          <SummaryField label="Value" value={summary.value ?? "N/A"} />
          <SummaryField label="Flags" value={String(summary.flags ?? 0)} />
        </div>
      )}

      {/* Stage Cards Horizontal Row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          Pipeline Stages · Click any stage to inspect output in right-side drawer
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDrawerOpen(true)}
          className="h-7 gap-1.5 text-xs"
        >
          <PanelRightOpenIcon className="size-3.5" />
          <span>Stage Inspector (Sidebar)</span>
        </Button>
      </div>

      <div className="overflow-x-auto pb-2">
        <ol aria-label="Analysis stages" className="flex min-w-max items-stretch gap-2">
          {displayStages.map((s, i) => {
            const isSelected = i === selectedIndex;
            return (
              <li key={`${s.key}-${i}`} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleStageClick(i)}
                  className={cn(
                    "group flex w-44 flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3 text-left transition-all hover:bg-accent hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected && "border-primary bg-primary/10 ring-1 ring-primary shadow-xs",
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
                  <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {s.label}
                  </span>
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
                    {s.duration_ms == null || s.duration_ms === 0
                      ? "Ready"
                      : `${(s.duration_ms / 1000).toFixed(1)} s`}
                  </span>
                </button>
                {i < displayStages.length - 1 && (
                  <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Inline Stage Output Panel */}
      <div className="min-h-56 rounded-xl border border-border bg-background/50 p-4 sm:p-5">
        <PipelineTrace key={currentStage.key} stages={[currentStage]} defaultExpanded />
      </div>

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
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate text-[13px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
