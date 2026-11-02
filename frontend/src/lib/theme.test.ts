import { describe, expect, it, vi } from "vitest";

import { themeInitScript } from "./theme";

describe("themeInitScript", () => {
  it("references the storage key and sets data-theme", () => {
    expect(themeInitScript).toContain("loadtruth-theme");
    expect(themeInitScript).toContain("data-theme");
  });
  it("falls back to Enterprise Light when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is unavailable", "SecurityError");
    });

    try {
      new Function(themeInitScript)();
      expect(document.documentElement.getAttribute("data-theme")).toBe("enterprise");
      expect(document.documentElement.getAttribute("data-mode")).toBe("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    } finally {
      vi.restoreAllMocks();
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.removeAttribute("data-mode");
      document.documentElement.style.removeProperty("color-scheme");
      document.documentElement.classList.remove("dark");
    }
  });
});
