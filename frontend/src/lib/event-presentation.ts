import type { EventSummary } from "./api";

const BENCHMARK_EVENT_ID = "60cdc03c-ae67-4ff3-a482-6e6f08372dff";
const ARCHIVED_DATASET_EVENT_ID = "9041997f-3d84-475a-863c-5efe36273d75";
const ADMIN_WORKSPACE_ID = "5152264c-5a7f-485b-990b-6f8f23bcb7c4";
const TRAINING_WORKSPACE_ID = "7dcdd0cf-1e3b-434d-b163-85091762a376";

/** Keep the promoted 25-video dataset's display labels stable across deployments. */
export function presentEvent(event: EventSummary): EventSummary {
  const labels: Record<
    string,
    Pick<EventSummary, "name" | "location" | "status" | "tags">
  > = {
    [BENCHMARK_EVENT_ID]: {
      name: "Hurricane Debris Recovery 2026",
      location: "Pinellas County, FL",
      status: "active",
      tags: ["dataset-1", "meta-processed-muse", "read-only"],
    },
    [ARCHIVED_DATASET_EVENT_ID]: {
      name: "Lahaina Wildfire Recovery 2023",
      location: "Maui County, HI",
      status: "archived",
      tags: ["dataset-2", "meta-processed-muse", "read-only", "synthetic-demo"],
    },
    [ADMIN_WORKSPACE_ID]: {
      name: "LoadTruth Demo",
      location: "Demonstration workspace",
      status: "active",
      tags: ["admin-only"],
    },
    [TRAINING_WORKSPACE_ID]: {
      name: "LoadTruth Sandbox",
      location: "Interactive training workspace",
      status: "active",
      tags: ["playground", "saved-results"],
    },
  };
  const label = labels[event.id];
  return label
    ? { ...event, ...label, tags: [...new Set([...event.tags, ...label.tags])] }
    : event;
}
