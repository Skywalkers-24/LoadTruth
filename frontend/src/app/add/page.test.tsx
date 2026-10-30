import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewTicketPage from "./page";

const state = vi.hoisted(() => ({
  role: "super_admin",
  readonly: false,
  mutate: vi.fn(),
  push: vi.fn(),
  setSelectedId: vi.fn(),
  create: vi.fn(),
}));
const saved = [
  {
    id: "saved-1",
    event_id: "readonly-1",
    truck_id: "FL-DT-8043",
    debris_class: "vegetative",
    valuation: { est_fill_pct: "42" },
  },
  {
    id: "saved-2",
    event_id: "readonly-2",
    truck_id: "FL-DT-9014",
    debris_class: "white_goods",
    valuation: { est_fill_pct: "65" },
  },
];
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createPracticeTicket: (...args: unknown[]) => state.create(...args),
}));
vi.mock("@/components/console/evidence-canvas", () => ({
  EvidenceCanvas: ({ ticket }: { ticket: { id: string } }) => (
    <div data-testid="footage-preview">{ticket.id}</div>
  ),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ member: { role: state.role }, can: () => true }),
}));
vi.mock("@/lib/event-context", () => ({
  useEventContext: () => ({
    selectedId: "event-1",
    setSelectedId: state.setSelectedId,
    events: [{ id: "playground-1", name: "Practice Playground", tags: ["playground"] }],
    selected: { id: "event-1", name: "Cleanup", tags: state.readonly ? ["read-only"] : [] },
  }),
}));
vi.mock("@/lib/hooks", () => ({
  useSubmitIngestJob: () => ({ mutate: state.mutate, isPending: false }),
  useLatestIngestJob: () => ({ data: null, isLoading: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "practice-sources" ? saved : { analysis_max_bytes: 1000000 },
  }),
  useQueryClient: () => ({
    getQueryData: () => undefined,
    invalidateQueries: vi.fn(async () => undefined),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
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
  vi.clearAllMocks();
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
  it("offers saved footage instead of uploads for a read-only event", async () => {
    state.readonly = true;
    await render();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(host.querySelector("#practice-video")).not.toBeNull();
  });
});

describe("processed video replay from Add footage", () => {
  it("lets a monitor choose and replay saved footage from a read-only event", async () => {
    state.role = "monitor";
    state.readonly = true;
    await render();
    expect(host.textContent).toContain("Replay a processed video");
    expect(host.querySelector('[data-testid="footage-preview"]')?.textContent).toBe("saved-1");
    const select = host.querySelector<HTMLSelectElement>("#practice-video")!;
    await act(async () => {
      select.value = "saved-2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="footage-preview"]')?.textContent).toBe("saved-2");
    expect(host.querySelector('a[href*="ticket=saved-2"]')?.getAttribute("href")).toContain(
      "event=readonly-2",
    );
    expect(state.create).not.toHaveBeenCalled();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(host.querySelector('input[type="file"]')).toBeNull();
  });
  it("creates a practice copy in the playground without changing the read-only source", async () => {
    state.role = "monitor";
    state.readonly = true;
    state.create.mockResolvedValue({ id: "practice-ticket" });
    await render();
    const button = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Review a practice copy",
    )!;
    await act(async () => button.click());
    expect(state.create).toHaveBeenCalledWith("playground-1", "saved-1");
    expect(state.setSelectedId).toHaveBeenCalledWith("playground-1");
    expect(state.push).toHaveBeenCalledWith("/console?event=playground-1&ticket=practice-ticket");
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("lets an administrator switch between upload and saved replay", async () => {
    await render();
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Replay a processed video")!
        .click(),
    );
    expect(host.querySelector("#practice-video")).not.toBeNull();
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Upload new footage")!
        .click(),
    );
    expect(host.querySelector('input[type="file"]')).not.toBeNull();
  });
});
