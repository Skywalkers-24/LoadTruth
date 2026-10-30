"use client";

import { useRef } from "react";

import manifest from "@/lib/benchmark-videos.json";
import { useInView } from "@/lib/use-in-view";

/** Source footage is independent of the database; results arrive in later batches. */
export function BenchmarkVideoLibrary() {
  return (
    <section aria-label="Benchmark source videos" className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {manifest.videos.length} source videos ready. Recorded analysis will be added as batches
        finish; no previous showcase results are included.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {manifest.videos.map((video) => (
          <BenchmarkClip key={video.id} video={video} />
        ))}
      </div>
    </section>
  );
}

function BenchmarkClip({ video }: { video: (typeof manifest.videos)[number] }) {
  const container = useRef<HTMLDivElement>(null);
  const visible = useInView(container, "300px");

  return (
    <div ref={container} className="overflow-hidden rounded-lg border border-border bg-card">
      {visible ? (
        <video
          src={video.url}
          controls
          playsInline
          preload="none"
          aria-label={`Benchmark clip ${video.id}`}
          className="aspect-video w-full bg-black object-contain"
        />
      ) : (
        <div className="aspect-video bg-black" />
      )}
      <div className="flex items-center justify-between gap-2 p-3 text-xs">
        <span className="font-medium">Clip {video.id}</span>
        <span className="text-muted-foreground">
          {(video.sizeBytes / 1024 ** 2).toFixed(1)} MiB
        </span>
      </div>
    </div>
  );
}
