import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewActions } from "./review-actions";
import type { Ticket } from "@/lib/api";

const mutations = vi.hoisted(() => ({ call: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/hooks", () => ({
  useEvents: () => ({ data: [{ id: "test-event", tags: [] }] }),
  useSetMonitorCall: () => ({ mutate: mutations.call, isPending: false }),
  useSetStatus: () => ({ mutate: mutations.status, isPending: false }),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const ticket = {
  id: "test-ticket",
  event_id: "test-event",
  status: "draft",
  valuation: { est_fill_pct: "55", monitor_fill_pct: null },
} as Ticket;
async function render() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ReviewActions ticket={ticket} layout="bar" />));
}
function button(text: string) {
  return [...host.querySelectorAll("button")].find((el) => el.textContent?.includes(text))!;
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe("guided ticket decision", () => {
  it("keeps the inspector call optional and prevents invalid or empty submissions", async () => {
    await render();
    expect(host.querySelector("input")).toBeNull();
    await act(async () => button("Add an inspector").click());
    expect(button("Save call").disabled).toBe(true);
    const input = host.querySelector("input")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "101");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(button("Save call").disabled).toBe(true);
    await act(async () => {
      setter.call(input, "62.5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(button("Save call").disabled).toBe(false);
    expect(button("Confirm estimate").disabled).toBe(true);
    expect(host.textContent).toContain("Save or clear the inspector call");
    await act(async () => button("Save call").click());
    expect(mutations.call.mock.calls[0]?.[0]).toEqual({ id: ticket.id, pct: "62.5" });
    expect(mutations.status).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation before changing a ticket", async () => {
    await render();
    await act(async () => button("Confirm estimate").click());
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(mutations.status).not.toHaveBeenCalled();
    const confirm = [...host.querySelectorAll('[role="dialog"] button')].find(
      (el) => el.textContent === "Confirm",
    ) as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(mutations.status.mock.calls[0]?.[0]).toEqual({ id: ticket.id, status: "confirmed" });
  });
});
