import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceCanvas } from "./evidence-canvas";
import type { Ticket } from "@/lib/api";

const media = vi.hoisted(() => ({ expired: false }));
vi.mock("@/lib/hooks", () => ({
  useTicketEvidence: () => ({
    data: {
      has_media: !media.expired,
      footage_expired: media.expired,
      media_kind: "video",
      fps: 3,
      segments: { "truck bed": "", "debris pile": "" },
    },
  }),
  useTicketPipeline: () => ({
    data: null,
    isLoading: false,
  }),
}));
vi.mock("@/lib/api", () => ({ fetchEvidenceMediaUrl: vi.fn(async () => "blob:evidence") }));
const ticket = {
  id: "ticket-1",
  evidence_frames: [],
  valuation: { est_fill_pct: "41.83", monitor_fill_pct: null },
} as unknown as Ticket;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const originalFullscreen = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "requestFullscreen",
);
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  media.expired = false;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalFullscreen)
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", originalFullscreen);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen;
});

describe("evidence fullscreen", () => {
  it("provides interactive Body, Bed, and Load layer toggles", async () => {
    vi.stubGlobal("URL", { revokeObjectURL: vi.fn() });
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<EvidenceCanvas ticket={ticket} />));
    expect(host.querySelector('[aria-label="Mask layers"]')).not.toBeNull();
    expect(host.textContent).toContain("SAM 3.1 segmentation");
    const buttons = host.querySelectorAll('[aria-label="Mask layers"] button');
    expect(buttons).toHaveLength(3);
    const bodyBtn = [...buttons].find((b) => b.textContent?.includes("Body"))!;
    expect(bodyBtn.getAttribute("aria-pressed")).toBe("true");
    await act(async () => (bodyBtn as HTMLButtonElement).click());
    expect(bodyBtn.getAttribute("aria-pressed")).toBe("false");
  });
  it("requests fullscreen on the whole viewer containing video and layer controls", async () => {
    const request = vi.fn(async function (this: HTMLElement) {
      expect(this.classList.contains("lt-evidence-viewer")).toBe(true);
      expect(this.querySelector("video")).not.toBeNull();
      expect(this.textContent).toContain("Body");
      expect(this.textContent).toContain("Bed");
      expect(this.textContent).toContain("Load");
    });
    vi.stubGlobal("URL", { revokeObjectURL: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: request,
    });
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<EvidenceCanvas ticket={ticket} />));
    expect(host.querySelector("video")?.controls).toBe(false);
    await act(async () =>
      (host.querySelector('[aria-label="Fullscreen evidence"]') as HTMLButtonElement).click(),
    );
    expect(request).toHaveBeenCalledOnce();
  });
  it("keeps an expanded viewer available without the Fullscreen API and exits with Escape", async () => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    vi.stubGlobal("URL", { revokeObjectURL: vi.fn() });
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<EvidenceCanvas ticket={ticket} />));
    await act(async () =>
      (host.querySelector('[aria-label="Fullscreen evidence"]') as HTMLButtonElement).click(),
    );
    expect(document.querySelector('[data-expanded="true"] video')).not.toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.querySelector('[data-expanded="true"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});

it("explains expired footage while keeping the review workspace available", async () => {
  media.expired = true;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<EvidenceCanvas ticket={ticket} />));
  expect(host.textContent).toContain("Footage expired — ticket details retained");
  expect(host.textContent).toContain("saved estimate, analysis and review decision");
  expect(host.querySelector("video")).toBeNull();
});
