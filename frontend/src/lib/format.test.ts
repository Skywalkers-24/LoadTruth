import { describe, expect, it } from "vitest";

import { cubicYards, debrisLabel, money, percent } from "./format";

describe("money", () => {
  it("formats a decimal string as USD", () => {
    expect(money("43.20")).toBe("$43.20");
    expect(money("192")).toBe("$192.00");
  });
  it("renders a dash for null/invalid", () => {
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
    expect(money("not-a-number")).toBe("—");
  });
});

describe("percent", () => {
  it("drops trailing zeros for whole numbers", () => {
    expect(percent("62.00")).toBe("62%");
    expect(percent("62.5")).toBe("62.5%");
  });
  it("renders a dash for null", () => {
    expect(percent(null)).toBe("—");
  });
});

describe("cubicYards", () => {
  it("appends CY and trims", () => {
    expect(cubicYards("12.400")).toBe("12.4 CY");
    expect(cubicYards("16.000")).toBe("16 CY");
  });
});

describe("debrisLabel", () => {
  it("maps known classes to short labels", () => {
    expect(debrisLabel("construction_demolition")).toBe("C&D");
    expect(debrisLabel("vegetative")).toBe("Vegetative");
  });
  it("passes through unknown values", () => {
    expect(debrisLabel("mystery")).toBe("mystery");
  });
});
