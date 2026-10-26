import { describe, expect, it } from "vitest";

import { themeInitScript } from "./theme";

describe("themeInitScript", () => {
  it("references the storage key and sets data-theme", () => {
    expect(themeInitScript).toContain("loadtruth-theme");
    expect(themeInitScript).toContain("data-theme");
  });
  it("falls back to dark on error", () => {
    expect(themeInitScript).toContain("'dark'");
  });
});
