import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PipelineProgress } from "@/lib/api";
import { LivePipelineFlow } from "./live-pipeline-flow";
import { pipelinePollInterval } from "@/lib/pipeline-progress";

const state = vi.hoisted(() => ({
  data: null as PipelineProgress | null,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock("@/lib/hooks", () => ({ usePipelineProgress: () => state }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
async function render(props: Partial<Parameters<typeof LivePipelineFlow>[0]> = {}) {
  if (!root) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(<LivePipelineFlow eventId="event" detailed {...props} />));
}
function run(overrides: Partial<PipelineProgress> = {}): PipelineProgress {
  return {
    event_id: "event",
    content_hash: "same-clip",
    status: "running",
    outcome: null,
    ticket_id: null,
    truck_id: null,
    detail: null,
    started_at: 100,
    updated_at: 100,
    revision: 1,
    stages: [],
    ...overrides,
  };
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  state.data = null;
  state.isError = false;
  vi.clearAllMocks();
});

describe("live pipeline", () => {
  it("keeps discovering runs after completion and polls faster for an active upload", () => {
    expect(pipelinePollInterval(run({ status: "done" }), false)).toBe(5000);
    expect(pipelinePollInterval(run({ status: "done" }), true)).toBe(1500);
    expect(pipelinePollInterval(null, false)).toBe(5000);
  });
  it("does not present the previous result as a new upload", async () => {
    state.data = run({ status: "done", outcome: "drafted", truck_id: "OLD-TRUCK" });
    await render({ active: true, ignoredAttempt: "event:100" });
    expect(host.textContent).toContain("Analysing clip");
    expect(host.textContent).not.toContain("OLD-TRUCK");
  });
  it("lets a user inspect facts as a stage arrives and updates its analysis", async () => {
    state.data = run();
    await render();
    expect(host.textContent).not.toContain("EXTRACTED-3391");
    state.data = run({
      stages: [
        {
          key: "spark_ocr",
          label: "Read placard",
          model: "muse-spark",
          status: "ok",
          summary: "Read EXTRACTED-3391",
          confidence: 0.9,
          duration_ms: 200,
          details: [["Truck ID", "EXTRACTED-3391"]],
        },
      ],
    });
    await render();
    const button = host.querySelector("button[aria-expanded]") as HTMLButtonElement;
    await act(async () => button.click());
    expect(host.textContent).toContain("EXTRACTED-3391");
    expect(host.textContent).toContain("muse-spark");
    state.data = {
      ...state.data,
      stages: state.data!.stages.map((s) => ({
        ...s,
        analysis: "Placard visible in the rear frame.",
      })),
    };
    await render();
    expect(host.textContent).toContain("Placard visible in the rear frame.");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });
  it("shows failed processing and offers reconnection for telemetry errors", async () => {
    state.data = run({ status: "done", outcome: "failed", detail: "AI service error" });
    await render();
    expect(host.textContent).toContain("Run failed");
    expect(host.textContent).toContain("AI service error");
    state.isError = true;
    await render();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("refreshes history for repeated attempts using the same clip", async () => {
    const done = vi.fn();
    state.data = run({ status: "done", outcome: "drafted" });
    await render({ onComplete: done });
    await render({ onComplete: done });
    expect(done).toHaveBeenCalledTimes(1);
    state.data = run({ status: "done", outcome: "cached", started_at: 200 });
    await render({ onComplete: done });
    expect(done).toHaveBeenCalledTimes(2);
  });
});
