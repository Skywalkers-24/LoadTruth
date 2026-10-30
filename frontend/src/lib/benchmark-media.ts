import pairs from "./processed-benchmark-pairs.json";

/** Exact ticket-to-source mapping for the packaged public benchmark results. */
const urls = new Map(pairs.map((pair) => [pair.ticketId, `/videos/${pair.matchFilename}`]));
export function benchmarkMediaUrl(ticketId: string): string | undefined {
  return urls.get(ticketId);
}
