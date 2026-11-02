import { describe, expect, it } from "vitest";
import { defaultEventId, presentEvent } from "./event-presentation";
import type { EventSummary } from "./api";
const event = {
  id: "60cdc03c-ae67-4ff3-a482-6e6f08372dff",
  name: "50 Video Benchmark · Muse medium",
  location: null,
  status: "active",
  tags: ["benchmark", "read-only"],
  rate_table: { vegetative: 20 },
  tenant_id: "county",
  created_at: "2026-10-30",
} as EventSummary;
describe("operational event names", () => {
  it("labels the promoted 25-video dataset and keeps it read-only", () => {
    const result = presentEvent(event);
    expect(result.name).toBe("Hurricane Debris Recovery 2026");
    expect(result.location).toBe("Pinellas County, FL");
    expect(result.id).toBe(event.id);
    expect(result.rate_table).toBe(event.rate_table);
    expect(result.tags).toEqual(["benchmark", "read-only", "dataset-1", "meta-processed-muse"]);
    expect(result.tags).not.toContain("judge");
    expect(event.name).toBe("50 Video Benchmark · Muse medium");
  });
  it("preserves custom event names and other events", () => {
    const custom = { ...event, id: "custom-event", name: "County Storm Cleanup" };
    expect(presentEvent(custom)).toBe(custom);
    const other = { ...event, id: "another-event" };
    expect(presentEvent(other)).toBe(other);
  });
});

describe("default event selection", () => {
  it("defaults to the promoted benchmark event regardless of event ordering", () => {
    const demo = { ...event, id: "demo-event", tags: ["admin-only"] };
    expect(defaultEventId([demo, event])).toBe(event.id);
  });

  it("falls back to a benchmark-tagged event, then the first event", () => {
    const tagged = { ...event, id: "tagged-benchmark", tags: ["benchmark"] };
    const ordinary = { ...event, id: "ordinary-event", tags: [] };
    expect(defaultEventId([ordinary, tagged])).toBe(tagged.id);
    expect(defaultEventId([ordinary])).toBe(ordinary.id);
    expect(defaultEventId([])).toBeUndefined();
  });
});
