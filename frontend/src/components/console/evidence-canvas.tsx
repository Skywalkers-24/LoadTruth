"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2Icon, MaximizeIcon, MinimizeIcon } from "lucide-react";

import { benchmarkMediaUrl } from "@/lib/benchmark-media";
import type { Ticket } from "@/lib/api";
import { useTicketEvidence } from "@/lib/hooks";
import { SamPlayer } from "@/components/console/sam-player";
import { CameraIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/primitives";

/** Footage first. Outlines are an optional visual aid, never required to review. */
export function EvidenceCanvas({ ticket }: { ticket: Ticket }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [outlines, setOutlines] = useState(false);
  const [layers, setLayers] = useState({ body: false, bed: true, load: true });
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
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <CameraIcon size={15} className="text-muted-foreground" />
            Footage
          </h3>
          {evidence?.has_media && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-pressed={outlines}
                onClick={() => setOutlines((show) => !show)}
                className="min-h-9 rounded-md px-2 text-xs text-muted-foreground hover:bg-secondary"
              >
                {outlines ? "Hide outlines" : "Show outlines"}
              </button>
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                aria-label={
                  fullscreen || expanded ? "Exit evidence fullscreen" : "Fullscreen evidence"
                }
                className="flex min-h-9 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-secondary"
              >
                {fullscreen || expanded ? <MinimizeIcon size={15} /> : <MaximizeIcon size={15} />}
                <span className="hidden sm:inline">
                  {fullscreen || expanded ? "Exit fullscreen" : "Full screen"}
                </span>
              </button>
            </div>
          )}
        </div>
        {outlines && evidence?.has_media && (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground"
            role="group"
            aria-label="Outline layers"
          >
            {(["bed", "load", "body"] as const).map((layer) => (
              <label key={layer} className="inline-flex min-h-8 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={layers[layer]}
                  onChange={() => setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))}
                />
                {layer === "bed" ? "Bed" : layer === "load" ? "Load" : "Truck body"}
              </label>
            ))}
            <span className="ml-auto">
              Outlines are a visual aid, separate from the fill estimate.
            </span>
          </div>
        )}
        <div className="lt-evidence-media relative aspect-video min-h-[14rem] w-full shrink-0 overflow-hidden bg-black @[42rem]:min-h-0 @[42rem]:flex-1 @[42rem]:aspect-auto">
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
              show={{
                body: outlines && layers.body,
                bed: outlines && layers.bed,
                load: outlines && layers.load,
              }}
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
