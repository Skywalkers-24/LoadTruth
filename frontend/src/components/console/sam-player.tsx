"use client";

import { decodeMaskToSVGPath, formats } from "@meta-sam/parser";
import { useEffect, useMemo, useRef, useState } from "react";

import { fetchEvidenceMediaUrl, type TicketEvidence } from "@/lib/api";

/** One object SAM found on one frame: its box and its mask outline. */
export interface SamShape {
  objectId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Mask outline in mask-raster coordinates (translate by left, top). */
  path: string;
}

export interface SamTrack {
  /** frame index -> shapes on that frame */
  frames: Map<number, SamShape[]>;
  width: number;
  height: number;
  frameCount: number;
}

export const BED_LABEL = "truck bed";
export const LOAD_LABEL = "debris pile";

/**
 * Parse SAM 3.1's raw output (one line per frame, a box and a mask per object)
 * with Meta's official parser, and decode each mask to an SVG outline.
 */
export function parseSam(text: string, media: "video" | "image"): SamTrack {
  const frames = new Map<number, SamShape[]>();
  const size = /;w=(\d+);h=(\d+)/.exec(text);
  const width = size ? Number(size[1]) : 0;
  const height = size ? Number(size[2]) : 0;
  if (!text.trim()) return { frames, width, height, frameCount: 0 };

  const fmt = media === "image" ? formats.segmentation.image() : formats.segmentation.video();
  const parser = fmt.createParser();
  type Outcome = Parameters<typeof parser.finish>[0];
  parser.push(text.endsWith("\n") ? text : `${text}\n`, { emit: false });
  const { result } = parser.finish({ status: "completed" } as Outcome);

  for (const rec of result.records) {
    if (rec.kind !== "mask") continue;
    const frame = rec.frame?.frameIndex ?? 0;
    const shape: SamShape = {
      objectId: rec.objectId,
      left: rec.bounds.left,
      top: rec.bounds.top,
      right: rec.bounds.right,
      bottom: rec.bounds.bottom,
      path: decodeMaskToSVGPath(rec.mask),
    };
    const list = frames.get(frame);
    if (list) list.push(shape);
    else frames.set(frame, [shape]);
  }
  const frameCount = frames.size ? Math.max(...frames.keys()) + 1 : 0;
  return { frames, width, height, frameCount };
}

interface Props {
  ticketId: string;
  evidence: TicketEvidence;
  show: { bed: boolean; load: boolean };
  onFrame?: (frame: number, total: number) => void;
}

/**
 * The clip the models analyzed, with SAM's boxes and masks drawn over each
 * frame as it plays. Masks are drawn in the video's own pixel space and the SVG
 * letterboxes exactly like the video, so the overlay stays aligned at any size.
 */
export function SamPlayer({ ticketId, evidence, show, onFrame }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isImage = evidence.media_kind === "image";

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    fetchEvidenceMediaUrl(ticketId)
      .then((u) => {
        objectUrl = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ticketId]);

  const tracks = useMemo(() => {
    const media = isImage ? "image" : "video";
    return {
      bed: parseSam(evidence.segments[BED_LABEL] ?? "", media),
      load: parseSam(evidence.segments[LOAD_LABEL] ?? "", media),
    };
  }, [evidence.segments, isImage]);

  const width = tracks.bed.width || tracks.load.width;
  const height = tracks.bed.height || tracks.load.height;
  const total = Math.max(tracks.bed.frameCount, tracks.load.frameCount);

  // Follow playback: map media time to a SAM frame index.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isImage || total === 0) return;
    let handle = 0;
    let stopped = false;
    const fps = () => evidence.fps ?? (video.duration > 0 ? total / video.duration : 3);
    const update = (t: number) => {
      const f = Math.min(total - 1, Math.max(0, Math.floor(t * fps() + 1e-3)));
      setFrame((prev) => (prev === f ? prev : f));
    };
    // Frame-accurate updates where supported; timeupdate covers the rest.
    const hasRvfc = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    if (hasRvfc) {
      const loop = (_now: number, meta: VideoFrameCallbackMetadata) => {
        update(meta.mediaTime);
        if (!stopped) handle = video.requestVideoFrameCallback(loop);
      };
      handle = video.requestVideoFrameCallback(loop);
    }
    const onTime = () => update(video.currentTime);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("seeked", onTime);
    return () => {
      stopped = true;
      if (hasRvfc && handle) video.cancelVideoFrameCallback(handle);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeked", onTime);
    };
  }, [url, isImage, total, evidence.fps]);

  useEffect(() => {
    onFrame?.(frame, total);
  }, [frame, total, onFrame]);

  if (failed) {
    return (
      <div className="absolute inset-0 grid place-items-center p-6 text-[12px] text-[var(--color-subtle)]">
        The evidence clip could not be loaded.
      </div>
    );
  }

  const bedShapes = show.bed ? (tracks.bed.frames.get(frame) ?? []) : [];
  const loadShapes = show.load ? (tracks.load.frames.get(frame) ?? []) : [];

  return (
    <div className="absolute inset-0 bg-black">
      {url &&
        (isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL, not an optimizable asset
          <img src={url} alt="Evidence frame" className="size-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            src={url}
            className="size-full object-contain"
            autoPlay
            muted
            loop
            playsInline
            controls
            aria-label="Evidence clip with segmentation overlay"
          />
        ))}
      {width > 0 && height > 0 && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="pointer-events-none absolute inset-0 size-full"
          aria-hidden
        >
          {bedShapes.map((s) => (
            <Shape key={`b${s.objectId}`} s={s} color="var(--color-info)" />
          ))}
          {loadShapes.map((s) => (
            <Shape key={`l${s.objectId}`} s={s} color="var(--color-money)" />
          ))}
        </svg>
      )}
    </div>
  );
}

function Shape({ s, color }: { s: SamShape; color: string }) {
  return (
    <g>
      <path
        d={s.path}
        transform={`translate(${s.left} ${s.top})`}
        fill={color}
        fillOpacity={0.32}
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={s.left}
        y={s.top}
        width={s.right - s.left}
        height={s.bottom - s.top}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
