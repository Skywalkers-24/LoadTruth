import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("preserves a saved light palette when the provider mounts", async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    clear: () => values.clear(),
  });
  localStorage.setItem("loadtruth-theme", "enterprise");
  localStorage.setItem("loadtruth-mode", "light");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Probe() {
    const { theme, mode } = useTheme();
    return (
      <span>
        {theme}:{mode}
      </span>
    );
  }
  try {
    await act(async () =>
      root.render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      ),
    );
    expect(host.textContent).toBe("enterprise:light");
    expect(localStorage.getItem("loadtruth-theme")).toBe("enterprise");
    expect(localStorage.getItem("loadtruth-mode")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-mode");
  }
});

it("migrates disabled themes (such as field-ops, plum, arctic, indigo) to enterprise", async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    clear: () => values.clear(),
  });
  localStorage.setItem("loadtruth-theme", "field-ops");
  localStorage.setItem("loadtruth-mode", "dark");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Probe() {
    const { theme, mode } = useTheme();
    return (
      <span>
        {theme}:{mode}
      </span>
    );
  }
  try {
    await act(async () =>
      root.render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      ),
    );
    expect(host.textContent).toBe("enterprise:dark");
    expect(localStorage.getItem("loadtruth-theme")).toBe("enterprise");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-mode");
  }
});
