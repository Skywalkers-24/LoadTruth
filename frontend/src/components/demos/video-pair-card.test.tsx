import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BENCHMARK_PAIRS, VideoPairCard } from "./video-pair-card";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { media_kind: "video", fps: 3, has_media: true, segments: {} } }),
}));
vi.mock("@/components/console/sam-player", () => ({
  SamPlayer: ({
    videoRef,
    videoUrl,
  }: {
    videoRef: React.Ref<HTMLVideoElement>;
    videoUrl: string;
  }) => <video ref={videoRef} src={videoUrl} aria-label="Mask footage" />,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;
async function render() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<VideoPairCard pair={BENCHMARK_PAIRS[0]!} />));
}
function byText(text: string) {
  return [...host.querySelectorAll("button")].find((button) => button.textContent === text)!;
}
beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

describe("single clip playback", () => {
  it("starts with original footage and adds masks only when comparing", async () => {
    await render();
    expect(host.querySelectorAll("video")).toHaveLength(1);
    expect(host.querySelector("video")?.getAttribute("aria-label")).toBe("Original footage");
    await act(async () => byText("Compare").click());
    expect(host.querySelectorAll("video")).toHaveLength(2);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Play clip"]')!.click(),
    );
    expect(play).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[aria-label="Pause clip"]')).not.toBeNull();
    await act(async () => byText("Original").click());
    expect(host.querySelectorAll("video")).toHaveLength(1);
    expect(host.querySelector('[aria-label="Play clip"]')).not.toBeNull();
    expect(pause).toHaveBeenCalled();
  });
  it("stops both feeds and explains a rejected play attempt", async () => {
    await render();
    await act(async () => byText("Compare").click());
    play.mockRejectedValueOnce(new Error("playback blocked"));
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Play clip"]')!.click(),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Playback did not start");
    expect(host.querySelector('[aria-label="Play clip"]')).not.toBeNull();
  });
  it("preserves the current frame when switching from original to masks", async () => {
    await render();
    const first = host.querySelector("video")!;
    first.currentTime = 4;
    await act(async () => first.dispatchEvent(new Event("timeupdate")));
    await act(async () => byText("With masks").click());
    const source = host.querySelector("video")!;
    Object.defineProperty(source, "readyState", { value: 2 });
    Object.defineProperty(source, "duration", { value: 10 });
    await act(async () => source.dispatchEvent(new Event("loadedmetadata")));
    expect(source.currentTime).toBe(4);
    expect(host.textContent).toContain("0:04 / 0:10");
  });
  it("replays the selected clip from the start", async () => {
    await render();
    const video = host.querySelector("video")!;
    video.currentTime = 7;
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Replay clip"]')!.click(),
    );
    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();
    expect(host.querySelector('[aria-label="Pause clip"]')).not.toBeNull();
  });
});
