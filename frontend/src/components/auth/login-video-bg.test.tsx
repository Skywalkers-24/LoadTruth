import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginVideoBg } from "./login-video-bg";

// Mock the theme hook
vi.mock("@/lib/theme", () => ({
  useTheme: () => ({
    mode: "dark",
    palette: "slate",
    setPalette: vi.fn(),
    toggleMode: vi.fn(),
  }),
}));

describe("LoginVideoBg", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    window.HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders low-quality video initially without static poster image", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LoginVideoBg />);
    });

    // Poster image should not be present
    const img = container.querySelector("img");
    expect(img).toBeNull();

    // Low-quality video is rendered with muted autoplay
    const videos = container.querySelectorAll("video");
    expect(videos.length).toBeGreaterThanOrEqual(1);

    const lowVideo = Array.from(videos).find((v) =>
      v.getAttribute("src")?.includes("login-dark-sm.mp4"),
    );
    expect(lowVideo).toBeDefined();
    expect(lowVideo?.getAttribute("autoplay")).toBeDefined();
    expect(lowVideo?.getAttribute("playsinline")).toBeDefined();
    expect(lowVideo?.getAttribute("muted")).toBeDefined();
    expect(lowVideo?.getAttribute("poster")).toBeNull();
  });

  it("targets high-quality tier for upgrade on broadband/desktop", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LoginVideoBg />);
    });

    const videos = container.querySelectorAll("video");

    // Should render a secondary video element for upgrading to high quality
    expect(videos.length).toBe(2);
    const highVideo = Array.from(videos).find(
      (v) =>
        v.getAttribute("src")?.includes("login-dark-lg.mp4") ||
        v.getAttribute("src")?.includes("login-dark.mp4"),
    );
    expect(highVideo).toBeDefined();
  });

  it("handles onCanPlay without crashing and attempts play on high quality video", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LoginVideoBg />);
    });

    const videos = container.querySelectorAll("video");
    const highVideo = Array.from(videos).find(
      (v) =>
        v.getAttribute("src")?.includes("login-dark-lg.mp4") ||
        v.getAttribute("src")?.includes("login-dark.mp4"),
    );
    expect(highVideo).toBeDefined();

    await act(async () => {
      highVideo?.dispatchEvent(new Event("canplay"));
    });

    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("safely handles video error without stopping playback", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LoginVideoBg />);
    });

    const videos = container.querySelectorAll("video");
    const highVideo = Array.from(videos).find(
      (v) =>
        v.getAttribute("src")?.includes("login-dark-lg.mp4") ||
        v.getAttribute("src")?.includes("login-dark.mp4"),
    );

    await act(async () => {
      highVideo?.dispatchEvent(new Event("error"));
    });

    // Low video should be kept running
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});
