"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2Icon, MaximizeIcon, MinimizeIcon, RotateCcwIcon } from "lucide-react";

import { benchmarkMediaUrl } from "@/lib/benchmark-media";
import type { Ticket } from "@/lib/api";
import { useTicketEvidence } from "@/lib/hooks";
import { SamPlayer } from "@/components/console/sam-player";
import { CameraIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Footage first. Outlines are an optional visual aid, never required to review. */
export function EvidenceCanvas({ ticket }: { ticket: Ticket }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [layers, setLayers] = useState({ body: true, bed: true, load: true });
  const [samFrame, setSamFrame] = useState({ frame: 0, total: 0 });
  const handleSamFrame = useCallback((frame: number, total: number) => {
    setSamFrame((prev) => (prev.frame === frame && prev.total === total ? prev : { frame, total }));
  }, []);
  const query = useTicketEvidence(ticket.id);
  const evidence = query.data;

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
    };
  }, [expanded]);
  async function toggleFullscreen() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (document.fullscreenElement === viewerRef.current) {
      await document.exitFullscreen();
      return;
    }
    try {
      if (!viewerRef.current?.requestFullscreen) {
        setExpanded(true);
        return;
      }
      await viewerRef.current.requestFullscreen();
    } catch {
      setExpanded(true);
    }
  }

  const viewer = (
    <div className="flex shrink-0 flex-col @[42rem]:min-h-0 @[42rem]:flex-1">
      <div
        ref={viewerRef}
        data-expanded={expanded || undefined}
        className="lt-evidence-viewer overflow-hidden rounded-lg border border-border @[42rem]:flex @[42rem]:min-h-0 @[42rem]:flex-1 @[42rem]:flex-col"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
          <div className="flex items-center gap-2.5">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CameraIcon size={15} className="text-muted-foreground" />
              Evidence
            </h3>
            {evidence?.has_media && (
              <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                AI outlines
              </span>
            )}
            {evidence?.has_media && samFrame.total > 0 && (
              <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums">
                Frame {samFrame.frame + 1} of {samFrame.total}
              </span>
            )}
          </div>
          {evidence?.has_media && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5" role="group" aria-label="Outline layers">
                <button
                  type="button"
                  aria-pressed={layers.body}
                  onClick={() => setLayers((prev) => ({ ...prev, body: !prev.body }))}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    layers.body
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold shadow-2xs"
                      : "border-border bg-transparent text-muted-foreground opacity-60 hover:opacity-100",
                  )}
                  title="Toggle Truck Body outline (amber)"
                >
                  <span className="size-2 rounded-full bg-amber-500" aria-hidden />
                  <span>Body</span>
                </button>

                <button
                  type="button"
                  aria-pressed={layers.bed}
                  onClick={() => setLayers((prev) => ({ ...prev, bed: !prev.bed }))}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    layers.bed
                      ? "border-sky-500/60 bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold shadow-2xs"
                      : "border-border bg-transparent text-muted-foreground opacity-60 hover:opacity-100",
                  )}
                  title="Toggle Truck Bed outline (cyan)"
                >
                  <span className="size-2 rounded-full bg-sky-500" aria-hidden />
                  <span>Bed</span>
                </button>

                <button
                  type="button"
                  aria-pressed={layers.load}
                  onClick={() => setLayers((prev) => ({ ...prev, load: !prev.load }))}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    layers.load
                      ? "border-purple-500/60 bg-purple-500/15 text-purple-600 dark:text-purple-400 font-semibold shadow-2xs"
                      : "border-border bg-transparent text-muted-foreground opacity-60 hover:opacity-100",
                  )}
                  title="Toggle Debris Load outline (purple)"
                >
                  <span className="size-2 rounded-full bg-purple-500" aria-hidden />
                  <span>Load</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const video = viewerRef.current?.querySelector("video");
                  if (video) {
                    video.currentTime = 0;
                    void video.play();
                  }
                }}
                aria-label="Replay ticket"
                title="Replay ticket from start"
                className="flex min-h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
              >
                <RotateCcwIcon size={13} className="text-primary" />
                <span>Replay ticket</span>
              </button>

              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                aria-label={
                  fullscreen || expanded ? "Exit evidence fullscreen" : "Fullscreen evidence"
                }
                className="flex min-h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-secondary cursor-pointer"
              >
                {fullscreen || expanded ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
                <span className="hidden sm:inline">
                  {fullscreen || expanded ? "Exit" : "Full screen"}
                </span>
              </button>
            </div>
          )}
        </div>
        <div className="lt-evidence-media relative aspect-video max-h-[min(58vh,42rem)] min-h-[14rem] w-full shrink-0 overflow-hidden bg-black @[64rem]:min-h-[20rem] @[64rem]:flex-none @[64rem]:aspect-video">
          {query.isLoading ? (
            <div
              role="status"
              className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/70"
            >
              <Loader2Icon className="size-5 animate-spin" />
              Loading footage…
            </div>
          ) : query.isError ? (
            <div
              role="alert"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/80"
            >
              <p>Footage could not be loaded.</p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="min-h-10 rounded-md border border-white/30 px-4"
              >
                Retry footage
              </button>
            </div>
          ) : evidence?.has_media ? (
            <SamPlayer
              key={ticket.id}
              ticketId={ticket.id}
              evidence={evidence}
              videoUrl={evidence.media_url ?? benchmarkMediaUrl(ticket.id)}
              show={layers}
              autoPlay={false}
              onFrame={handleSamFrame}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-card p-6">
              <EmptyState
                icon={<CameraIcon size={22} />}
                title={
                  evidence?.footage_expired
                    ? "Footage expired — ticket details retained"
                    : "No footage available"
                }
                description={
                  evidence?.footage_expired
                    ? "Temporary footage is no longer available for replay. The saved estimate, analysis and review decision remain available."
                    : "This ticket has no saved video. Check the ticket details before making a decision."
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
  return expanded ? createPortal(viewer, document.body) : viewer;
}
