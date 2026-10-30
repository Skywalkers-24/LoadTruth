import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SamPlayer } from "./sam-player";
import type { TicketEvidence } from "@/lib/api";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.useRealTimers();
});
it("turns a stalled clip into an actionable retry instead of an endless spinner", async () => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const evidence = {
    media_kind: "video",
    mime: "video/mp4",
    fps: 3,
    has_media: true,
    segments: {},
  } as TicketEvidence;
  await act(async () =>
    root.render(
      <SamPlayer
        ticketId="ticket"
        evidence={evidence}
        videoUrl="/stalled.mp4"
        autoPlay={false}
        show={{ body: false, bed: false, load: false }}
      />,
    ),
  );
  expect(host.querySelector("video")).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(20_000));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Footage could not be loaded",
  );
  await act(async () => host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
  expect(host.querySelector("video")).not.toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await act(async () => host.querySelector("video")!.dispatchEvent(new Event("loadeddata")));
  await act(async () => vi.advanceTimersByTime(20_000));
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
