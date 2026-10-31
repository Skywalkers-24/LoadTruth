import manifest from "@/lib/benchmark-videos.json";
import pairs from "@/lib/processed-benchmark-pairs.json";

const completed = new Set(pairs.map((pair) => pair.contentHash));
/** Benchmark clips with saved ticket and SAM evidence. */
export const batchVideos = manifest.videos.filter((video) => completed.has(video.sha256));
/** Clips that have no saved ticket or SAM evidence yet. */
export const unprocessedVideos = manifest.videos.filter((video) => !completed.has(video.sha256));
export const batchVideosWithoutResults = batchVideos.filter(
  (video) => !completed.has(video.sha256),
);
