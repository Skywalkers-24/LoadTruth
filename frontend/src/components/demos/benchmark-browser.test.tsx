import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BenchmarkBrowser, GALLERY_CLIPS, filterClips } from "./benchmark-browser";

vi.mock("./video-pair-card", async () => {
  const pairs = await import("@/lib/processed-benchmark-pairs.json");
  return {
    BENCHMARK_PAIRS: pairs.default,
    VideoPairCard: ({ pair }: { pair: { pairNumber: number } }) => (
      <div data-player={pair.pairNumber}>Focused clip player</div>
    ),
  };
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
async function render() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<BenchmarkBrowser />));
}
function button(text: string) {
  return [...host.querySelectorAll("button")].find((el) => el.textContent?.includes(text))!;
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
});

describe("focused footage browser", () => {
  it("partitions all 50 clips and preserves honest result states", () => {
    expect(filterClips(GALLERY_CLIPS, "batch", "")).toHaveLength(25);
    expect(filterClips(GALLERY_CLIPS, "unprocessed", "")).toHaveLength(25);
    expect(GALLERY_CLIPS.filter((clip) => clip.status === "processed")).toHaveLength(21);
    expect(
      GALLERY_CLIPS.filter((clip) => clip.status === "pending").map((clip) => clip.id),
    ).toEqual(["019", "024", "025"]);
    expect(filterClips(GALLERY_CLIPS, "all", "FL-DT-2204")[0]?.id).toBe("001");
  });
  it("mounts one player and supports keyboard selection", async () => {
    await render();
    expect(host.querySelectorAll("[data-player]")).toHaveLength(1);
    const first = host.querySelector('[role="option"]')!;
    await act(async () =>
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
    );
    expect(host.querySelector("[data-player]")?.getAttribute("data-player")).toBe("2");
    expect(host.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain(
      "002",
    );
    expect(host.querySelector('a[href*="ticket="]')?.getAttribute("href")).toContain(
      "event=a64be422",
    );
  });
  it("unprocessed clips show original footage without a fabricated result", async () => {
    await render();
    await act(async () => button("Unprocessed").click());
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(25);
    const unprocessedOpt = [...host.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (el) => el.textContent?.includes("030"),
    );
    if (unprocessedOpt) {
      await act(async () => unprocessedOpt.click());
    }
    expect(host.querySelector("[data-player]")).toBeNull();
    expect(host.querySelector("video")?.getAttribute("src")).toContain("benchmark-030");
    expect(host.textContent).toContain("has not been analyzed");
    expect(host.querySelector('a[href*="ticket="]')).toBeNull();
  });
  it("explains empty search results and restores the collection", async () => {
    await render();
    const input = host.querySelector("input")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "no-matching-truck");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("No matching clips");
    expect(host.querySelector("[data-player]")).toBeNull();
    await act(async () => button("Clear search").click());
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(25);
  });
});
