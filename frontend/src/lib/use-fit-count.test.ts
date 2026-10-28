import { describe, expect, it } from "vitest";

import { fitCount } from "./use-fit-count";

describe("fitCount", () => {
  it("counts whole rows including the gaps between them", () => {
    // 6 rows of 80px with 5 gaps of 6px = 510px.
    expect(fitCount(510, 80, 6, 3, 30)).toBe(6);
    expect(fitCount(509, 80, 6, 3, 30)).toBe(5);
  });
  it("clamps to the min and max", () => {
    expect(fitCount(40, 80, 6, 3, 30)).toBe(3);
    expect(fitCount(10_000, 80, 6, 3, 30)).toBe(30);
  });
  it("falls back to the min for a zero item height", () => {
    expect(fitCount(500, 0, 6, 3, 30)).toBe(3);
  });
});
