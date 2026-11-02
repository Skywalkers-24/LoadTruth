import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PipelineStage } from "@/lib/api";
import { PipelineWorkbench } from "./pipeline-workbench";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;

const stages: PipelineStage[] = [
  {
    key: "sam_track",
    label: "Outline truck and load",
    model: "Meta SAM 3.1",
    status: "ok",
    summary: "Tracked the truck.",
    confidence: 0.9,
    duration_ms: 100,
    analysis: "Truck analysis.",
    details: [],
  },
  {
    key: "spark_ocr",
    label: "Read truck number",
    model: "Meta Muse Spark 1.3",
    status: "ok",
    summary: "Read truck number.",
    confidence: 0.9,
    duration_ms: 100,
    analysis: "Truck number analysis.",
    details: [],
  },
];

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("pipeline workbench", () => {
  it("keeps clicked stages selected after updates and supports drawer navigation", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    await act(async () => root!.render(<PipelineWorkbench stages={stages} />));
    const stageButtons = host.querySelectorAll<HTMLButtonElement>(
      'ol[aria-label="Analysis stages"] button',
    );
    await act(async () => stageButtons[0]!.click());

    expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe(
      "Outline truck and load",
    );

    await act(async () =>
      root!.render(<PipelineWorkbench stages={stages.map((stage) => ({ ...stage }))} />),
    );
    expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe(
      "Outline truck and load",
    );

    const next = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ).find((button) => button.textContent?.includes("Next"));
    await act(async () => next?.click());
    expect(document.body.querySelector('[role="dialog"] h2')?.textContent).toBe(
      "Read truck number",
    );
  });
});
