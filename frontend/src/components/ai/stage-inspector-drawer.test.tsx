import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PipelineStage } from "@/lib/api";
import { StageInspectorDrawer } from "./stage-inspector-drawer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;

const stages: PipelineStage[] = [
  {
    key: "sam_track",
    label: "Outline truck and load",
    model: "Meta SAM 3.1",
    status: "pending",
    summary: "AI outlines the truck bed and visible load.",
    confidence: null,
    duration_ms: 0,
    analysis: "Inspect the truck and load.",
    details: [],
  },
];

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("stage inspector drawer", () => {
  it("portals the fixed right sidebar to the viewport so page layout cannot clip it", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    await act(async () =>
      root!.render(
        <StageInspectorDrawer
          open
          onClose={vi.fn()}
          stages={stages}
          currentStageIndex={0}
          onSelectStageIndex={vi.fn()}
        />,
      ),
    );

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.parentElement).toBe(document.body);
    expect(dialog?.querySelector(":scope > div:last-child")?.className).toContain("right-0");
    expect(dialog?.querySelector("aside")?.className).toContain("lg:w-[38vw]");
    expect(dialog?.textContent).toContain("Outline truck and load");
  });
});
