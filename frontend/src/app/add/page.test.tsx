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
  getTicket: vi.fn(async () => ({
    id: "saved-ticket",
    truck_id: "FL-DT-8043",
    debris_class: "white_goods",
    status: "confirmed",
    valuation: { certified_cubic_yards: "20", est_dollar_value: "120", est_fill_pct: "42" },
  })),
  getTicketPipeline: vi.fn(async () => []),
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
  getTicket: () => state.getTicket(),
  getTicketPipeline: () => state.getTicketPipeline(),
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
    selectedId: "60cdc03c-ae67-4ff3-a482-6e6f08372dff",
    setSelectedId: state.setSelectedId,
    events: [{ id: "playground-1", name: "Practice Playground", tags: ["playground"] }],
    selected: {
      id: "60cdc03c-ae67-4ff3-a482-6e6f08372dff",
      name: "Cleanup",
      tags: state.readonly ? ["read-only"] : [],
    },
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
    expect(host.textContent).toContain("may use paid AI calls");
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    await act(async () => checkbox.click());
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["clip"], "haul.mp4", { type: "video/mp4" });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(state.mutate.mock.calls[0]?.[0]).toEqual({
      eventId: "60cdc03c-ae67-4ff3-a482-6e6f08372dff",
      file,
      bypassCache: true,
      keepFootage: true,
    });
    // Upload box is hidden once uploaded, keeping pipeline on screen
    expect(host.textContent).toContain("Footage uploaded");
    expect(host.textContent).toContain("haul.mp4");
    expect(host.querySelector('input[type="file"]')).toBeNull();
  });
  it("does not offer fresh analysis to monitors", async () => {
    state.role = "monitor";
    await render();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });
  it("provides a dropdown to select and analyze an existing processed video on the same page", async () => {
    await render();
    const select = host.querySelector<HTMLSelectElement>("#existing-video-select");
    expect(select).not.toBeNull();
    expect(select?.options.length).toBeGreaterThan(1);
    expect(host.textContent).toContain("Use existing video from library");
    expect(host.textContent).not.toContain("Replay a processed video");
  });
  it("drafts a ticket when an existing video is selected", async () => {
    state.create.mockResolvedValueOnce({
      id: "new-ticket-123",
      truck_id: "FL-DT-5590",
      debris_class: "construction_demolition",
      valuation: {
        certified_cubic_yards: "20.00",
        est_dollar_value: "350.00",
        est_fill_pct: "36.3",
      },
    });
    await render();
    const select = host.querySelector<HTMLSelectElement>("#existing-video-select")!;
    const testOption = select.options[1]!.value;
    await act(async () => {
      select.value = testOption;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Replay saved video"))
        ?.click(),
    );
    expect(state.getTicket).toHaveBeenCalled();
    expect(state.getTicketPipeline).toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });
});
