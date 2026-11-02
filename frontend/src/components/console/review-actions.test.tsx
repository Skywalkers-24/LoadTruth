import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewActions } from "./review-actions";
import type { Ticket } from "@/lib/api";

const mutations = vi.hoisted(() => ({
  file: vi.fn(),
  fileAsync: vi.fn(),
  transcription: vi.fn(),
  status: vi.fn(),
  statusAsync: vi.fn(),
}));
vi.mock("@/lib/hooks", () => ({
  useEvents: () => ({ data: [{ id: "test-event", tags: [] }] }),
  useFileManualMonitorReport: () => ({
    mutate: mutations.file,
    mutateAsync: mutations.fileAsync,
    isPending: false,
  }),
  useTranscribeMonitorCall: () => ({ mutateAsync: mutations.transcription, isPending: false }),
  useSetStatus: () => ({
    mutate: mutations.status,
    mutateAsync: mutations.statusAsync,
    isPending: false,
  }),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ can: () => true, member: { role: "super_admin" } }),
}));
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
async function render(layout: "stack" | "bar" = "bar") {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ReviewActions ticket={ticket} layout={layout} />));
}
function button(text: string) {
  return [...host.querySelectorAll("button")].find((el) => el.textContent?.includes(text))!;
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("guided ticket decision", () => {
  it("keeps manual filing optional and blocks invalid fill calls", async () => {
    await render();
    expect(host.querySelector("input")).toBeNull();
    await act(async () => button("Manual filing").click());
    expect(button("File ticket").disabled).toBe(true);
    const input = host.querySelector("input")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "101");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(button("File ticket").disabled).toBe(true);
    await act(async () => {
      setter.call(input, "62.5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(button("File ticket").disabled).toBe(false);
    expect(button("Confirm estimate").disabled).toBe(true);
    expect(host.textContent).toContain("File or clear the manual report");
    await act(async () => button("File ticket").click());
    expect(mutations.file.mock.calls[0]?.[0]).toEqual({
      id: ticket.id,
      monitor_fill_pct: "62.5",
      issue_description: undefined,
    });
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

  it("uses voice dispute details and submits the disputed status", async () => {
    const BrowserBlob = Blob;

    class TestBlob extends BrowserBlob {
      override async arrayBuffer() {
        return new ArrayBuffer(16);
      }
    }

    class TestMediaRecorder {
      static latest: TestMediaRecorder;
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void | Promise<void>) | null = null;
      completed: Promise<void> = Promise.resolve();

      constructor() {
        TestMediaRecorder.latest = this;
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        this.completed = Promise.resolve(this.onstop?.()).then(() => undefined);
      }
    }

    class TestAudioContext {
      async decodeAudioData() {
        return { duration: 0.5 };
      }

      async close() {}
    }

    class TestOfflineAudioContext {
      destination = {};
      constructor(
        _channels: number,
        private readonly frames: number,
        _sampleRate: number,
      ) {}

      createBufferSource() {
        return { buffer: null, connect: vi.fn(), start: vi.fn() };
      }

      async startRendering() {
        return { getChannelData: () => new Float32Array(this.frames) };
      }
    }

    vi.stubGlobal("MediaRecorder", TestMediaRecorder);
    vi.stubGlobal("Blob", TestBlob);
    vi.stubGlobal("AudioContext", TestAudioContext);
    vi.stubGlobal("OfflineAudioContext", TestOfflineAudioContext);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    });
    mutations.transcription.mockResolvedValue({
      transcript: "60% increase due to middle weight",
      audio_duration_ms: 500,
      suggested_fill_pct: 60,
      issue_flags: [],
      follow_up_question: "Could you clarify the reason?",
      dispute_reason: "Increase due to middle weight",
      saved_fill_pct: 60,
      updated_ticket: null,
    });
    mutations.fileAsync.mockResolvedValue(ticket);
    mutations.statusAsync.mockResolvedValue({ ...ticket, status: "disputed" });

    await render("stack");
    await act(async () => button("Raise a dispute").click());
    await act(async () => button("AI voice").click());
    await act(async () => button("Stop").click());
    await act(async () => TestMediaRecorder.latest.completed);

    expect(host.textContent).not.toContain("Transcription failed");
    expect(mutations.transcription).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "dispute" }),
    );
    await act(async () => TestMediaRecorder.latest.completed);
    expect(mutations.fileAsync).toHaveBeenCalledWith({
      id: ticket.id,
      monitor_fill_pct: "60",
      issue_description: "Increase due to middle weight",
    });
    expect(mutations.statusAsync).toHaveBeenCalledWith({
      id: ticket.id,
      status: "disputed",
    });
    expect(host.textContent).not.toContain("Could you clarify the reason?");
    expect(host.textContent).not.toContain("More detail needed");
  });
});
