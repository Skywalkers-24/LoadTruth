import manifest from "@/lib/benchmark-videos.json";
import pairs from "@/lib/processed-benchmark-pairs.json";

/** The selected processing batch covers clips 001–025. */
export const batchVideos = manifest.videos.filter((video) => Number(video.id) <= 25);
export const unprocessedVideos = manifest.videos.filter((video) => Number(video.id) > 25);
const completed = new Set(pairs.map((pair) => pair.contentHash));
export const batchVideosWithoutResults = batchVideos.filter(
  (video) => !completed.has(video.sha256),
);
