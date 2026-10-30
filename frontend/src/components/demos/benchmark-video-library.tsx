"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  FilmIcon,
  PlayIcon,
  PauseIcon,
  RotateCcwIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react";

import manifest from "@/lib/benchmark-videos.json";
import { useInView } from "@/lib/use-in-view";
import { cn } from "@/lib/utils";

/** Source footage awaiting batch processing (without masks yet) */
export function BenchmarkVideoLibrary({
  className,
  videos = manifest.videos,
}: {
  className?: string;
  videos?: typeof manifest.videos;
}) {
  return (
    <section aria-label="Benchmark source videos" className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex size-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-semibold text-foreground">
            {videos.length} Unprocessed Source Clips
          </span>
          <span className="text-muted-foreground hidden sm:inline">
            · Awaiting batch processing (no masks recorded yet)
          </span>
        </div>
        <Link
          href="/pipeline"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline text-xs"
        >
          <SparklesIcon className="size-3" />
          <span>Batch Ingest Pipeline →</span>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos.map((video) => (
          <BenchmarkClip key={video.id} video={video} />
        ))}
      </div>
    </section>
  );
}

function BenchmarkClip({ video }: { video: (typeof manifest.videos)[number] }) {
  const container = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const visible = useInView(container, "300px");
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  // Instant thumbnail poster from generated edge assets
  const posterUrl = video.url.replace("/videos/", "/videos/thumbnails/").replace(".mp4", ".jpg");

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (hasEnded) {
      v.currentTime = 0;
      setHasEnded(false);
      void v.play();
      setIsPlaying(true);
      return;
    }
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      void v.play();
      setIsPlaying(true);
    }
  }

  function handleReplay(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    setHasEnded(false);
    void v.play();
    setIsPlaying(true);
  }

  return (
    <div
      ref={container}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xs transition-all hover:border-primary/40"
    >
      {/* Clip Header */}
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-2.5 py-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <FilmIcon className="size-3 text-muted-foreground" />
          <span className="font-semibold text-foreground">Clip {video.id}</span>
        </div>
        <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
          No mask yet
        </span>
      </div>

      {/* Video / Preview Stage */}
      <div
        className="relative aspect-video w-full bg-black cursor-pointer overflow-hidden"
        onClick={togglePlay}
      >
        {visible ? (
          <>
            <video
              ref={videoRef}
              src={`${video.url}#t=0.001`}
              poster={posterUrl}
              playsInline
              preload="metadata"
              controls={isPlaying}
              onPlay={() => {
                setIsPlaying(true);
                setHasEnded(false);
              }}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false);
                setHasEnded(true);
              }}
              aria-label={`Unprocessed benchmark clip ${video.id}`}
              className="size-full object-cover"
            />

            {/* Center Play / Replay Overlay (visible when paused or hover) */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                <div className="grid size-9 place-items-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-xs border border-white/20 transition-transform group-hover:scale-110">
                  {hasEnded ? (
                    <RotateCcwIcon className="size-4" />
                  ) : (
                    <PlayIcon className="size-4 fill-current ml-0.5" />
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex size-full items-center justify-center bg-muted/20 text-muted-foreground">
            <VideoIcon className="size-5 opacity-40" />
          </div>
        )}
      </div>

      {/* Clip Footer */}
      <div className="flex items-center justify-between border-t border-border/70 bg-card px-2.5 py-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{(video.sizeBytes / 1024 ** 2).toFixed(1)} MiB</span>
          <span>·</span>
          <span>10.0s</span>
          <span>·</span>
          <span>720p</span>
        </div>

        <div className="flex items-center gap-1">
          {isPlaying && (
            <button
              type="button"
              onClick={handleReplay}
              className="inline-flex h-6 items-center gap-0.5 rounded border border-border bg-background px-1.5 text-[10px] font-medium text-foreground hover:bg-accent"
              title="Replay from start"
            >
              <RotateCcwIcon className="size-2.5 text-primary" />
              <span>Replay</span>
            </button>
          )}
          <Link
            href="/pipeline"
            className="inline-flex h-6 items-center gap-1 rounded bg-secondary px-2 text-[10px] font-medium text-secondary-foreground hover:bg-accent transition-colors"
          >
            <SparklesIcon className="size-2.5 text-primary" />
            <span>Pipeline</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
