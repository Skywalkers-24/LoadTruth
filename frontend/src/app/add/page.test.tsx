import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewTicketPage from "./page";

const state = vi.hoisted(() => ({ role: "super_admin", readonly: false, mutate: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ member: { role: state.role }, can: () => true }),
}));
vi.mock("@/lib/event-context", () => ({
  useEventContext: () => ({
    selectedId: "event-1",
    selected: { name: "Cleanup", tags: state.readonly ? ["read-only"] : [] },
  }),
}));
vi.mock("@/lib/hooks", () => ({
  useSubmitIngestJob: () => ({ mutate: state.mutate, isPending: false }),
  useLatestIngestJob: () => ({ data: null, isLoading: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { analysis_max_bytes: 1000000 } }),
  useQueryClient: () => ({ getQueryData: () => undefined }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/shell/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ai/pipeline-workbench", () => ({
  DEFAULT_PIPELINE_STAGES: [],
  PipelineWorkbench: () => null,
}));
vi.mock("@/components/ai/live-pipeline-flow", () => ({ LivePipelineFlow: () => null }));
vi.mock("@/components/ui/motion", () => ({
  FadeIn: ({ children }: { children: React.ReactNode }) => children,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
async function render() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<NewTicketPage />));
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  state.role = "super_admin";
  state.readonly = false;
  state.mutate.mockClear();
});

describe("administrator fresh-analysis option", () => {
  it("defaults to cached analysis and submits the selected mode with the file", async () => {
    await render();
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    await act(async () => checkbox.click());
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["clip"], "haul.mp4", { type: "video/mp4" });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(state.mutate.mock.calls[0]?.[0]).toEqual({
      eventId: "event-1",
      file,
      bypassCache: true,
      keepFootage: true,
    });
    expect(host.textContent).toContain("additional model usage charges");
  });
  it("does not offer fresh analysis to monitors", async () => {
    state.role = "monitor";
    await render();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });
  it("does not enable the checkbox for a read-only event", async () => {
    state.readonly = true;
    await render();
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
  });
});
