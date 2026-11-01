import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThumbnailView } from "./thumbnail-view";

vi.mock("@/components/auth/login-video-bg", () => ({
  LoginVideoBg: ({ hideVignette }: { hideVignette?: boolean }) => (
    <div data-testid="video-bg" data-hide-vignette={hideVignette} />
  ),
}));

vi.mock("@/components/ui/logo", () => ({
  LogoMark: ({ size }: { size?: number }) => (
    <div data-testid="logo-mark" data-size={size}>
      LogoMark
    </div>
  ),
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}));

describe("ThumbnailView", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("renders only video, logo, and theme toggle", () => {
    const root = createRoot(container);
    act(() => {
      root.render(<ThumbnailView />);
    });

    expect(container.querySelector("[data-testid='video-bg']")).toBeTruthy();
    expect(container.querySelector("[data-testid='logo-mark']")).toBeTruthy();
    expect(container.querySelector("[data-testid='theme-toggle']")).toBeTruthy();
    expect(container.textContent).toContain("LoadTruth");

    // Confirms no login form, cards, or role selectors are rendered
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("button.login-screen-continue")).toBeNull();
  });

  it("toggles UI visibility when pressing 'h'", () => {
    const root = createRoot(container);
    act(() => {
      root.render(<ThumbnailView />);
    });

    const logoContainer = container
      .querySelector("[data-testid='logo-mark']")
      ?.closest(".transition-opacity");
    expect(logoContainer?.className).toContain("opacity-100");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
    });
    expect(logoContainer?.className).toContain("opacity-0");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
    });
    expect(logoContainer?.className).toContain("opacity-100");
  });
});
