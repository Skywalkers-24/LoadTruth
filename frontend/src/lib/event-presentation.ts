import type { EventSummary } from "./api";

const BENCHMARK_EVENT_ID = "60cdc03c-ae67-4ff3-a482-6e6f08372dff";

/** Keep the promoted 25-video dataset's display labels stable across deployments. */
export function presentEvent(event: EventSummary): EventSummary {
  if (event.id !== BENCHMARK_EVENT_ID) return event;
  return {
    ...event,
    name: "Hurricane Debris Recovery 2026",
    location: event.location?.trim() || "Pinellas County, FL",
    tags: [...new Set([...event.tags, "dataset-1", "meta-processed-muse", "read-only"])],
  };
}
