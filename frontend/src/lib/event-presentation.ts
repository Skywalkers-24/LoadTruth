import type { EventSummary } from "./api";

const BENCHMARK_EVENT_ID = "a64be422-dbb3-5bf9-9ce6-305cf96fb379";

/** Give the packaged benchmark its operational label; preserve its identity and access tags. */
export function presentEvent(event: EventSummary): EventSummary {
  if (event.id !== BENCHMARK_EVENT_ID || !/^50 Video Benchmark(?:\s|$)/i.test(event.name))
    return event;
  return {
    ...event,
    name: "Hurricane Debris Recovery 2026",
    location: event.location?.trim() || "Pinellas County, FL",
    tags: [
      ...new Set([...event.tags, "benchmark", "benchmark-50", "meta-processed", "muse-medium"]),
    ],
  };
}
