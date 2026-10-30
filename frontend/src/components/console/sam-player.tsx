"use client";

import { decodeMaskToSVGPath, formats } from "@meta-sam/parser";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PlayIcon, PauseIcon, Volume2Icon, VolumeXIcon, Loader2Icon } from "lucide-react";

import { fetchEvidenceMediaUrl, type TicketEvidence } from "@/lib/api";
import { getVideoVariantUrl, useVideoQuality } from "@/lib/video-quality";
import { QualitySelector } from "@/components/video/quality-selector";

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
export const TRUCK_BODY_LABEL = "truck body";
export const LOAD_LABEL = "debris pile";
const LOAD_PREFIX = "load: ";

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
  show: { body: boolean; bed: boolean; load: boolean };
  onFrame?: (frame: number, total: number) => void;
  onLoadCoverage?: (coveredFrames: number, totalFrames: number) => void;
  videoUrl?: string | null;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  hideControls?: boolean;
  autoPlay?: boolean;
  poster?: string;
  className?: string;
}

/**
 * The clip the models analyzed, with SAM's boxes and masks drawn over each
 * frame as it plays. Masks are drawn in the video's own pixel space and the SVG
 * letterboxes exactly like the video, so the overlay stays aligned at any size.
 */
export function SamPlayer({
  ticketId,
  evidence,
  show,
  onFrame,
  onLoadCoverage,
  videoUrl,
  videoRef: externalVideoRef,
  hideControls,
  autoPlay = true,
  poster,
  className,
}: Props) {
  const [rawUrl, setRawUrl] = useState<string | null>(videoUrl ?? null);
  const { resolvedTier } = useVideoQuality();
  const isImage = evidence.media_kind === "image";
  const url = useMemo(() => {
    if (!rawUrl || isImage) return rawUrl;
    return getVideoVariantUrl(rawUrl, resolvedTier);
  }, [rawUrl, isImage, resolvedTier]);

  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playError, setPlayError] = useState(false);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalVideoRef ?? internalVideoRef;
  const timeRef = useRef(0);
  const loadClipId = useId().replaceAll(":", "");

  useEffect(() => {
    if (videoUrl) {
      setRawUrl(videoUrl);
      setFailed(false);
      return;
    }
    setRawUrl(null);
    setFailed(false);
    setFrame(0);
    setTime(0);
    timeRef.current = 0;
    setDuration(0);
    setPlaying(false);
    setPlayError(false);
    let alive = true;
    let objectUrl: string | null = null;
    fetchEvidenceMediaUrl(ticketId)
      .then((u) => {
        objectUrl = u;
        if (alive) setRawUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ticketId, videoUrl, attempt]);

  // A stalled network request or undecodable clip must not leave an endless spinner.
  useEffect(() => {
    if (url && readyUrl === url) return;
    const timeout = window.setTimeout(() => setFailed(true), 20_000);
    return () => window.clearTimeout(timeout);
  }, [url, readyUrl, attempt]);

  const tracks = useMemo(() => {
    if (!show.body && !show.bed && !show.load && !onLoadCoverage && !onFrame) {
      const empty: SamTrack = { frames: new Map(), width: 0, height: 0, frameCount: 0 };
      return { body: empty, bed: empty, rim: empty, load: empty };
    }
    const media = isImage ? "image" : "video";
    return {
      body: parseSam(evidence.segments[TRUCK_BODY_LABEL] ?? "", media),
      bed: parseSam(evidence.segments[BED_LABEL] ?? "", media),
      rim: parseSam(evidence.segments.tailgate ?? "", media),
      load: mergeSamTracks(loadTexts(evidence.segments).map((text) => parseSam(text, media))),
    };
  }, [evidence.segments, isImage, show.body, show.bed, show.load, onLoadCoverage, onFrame]);

  const width = tracks.body.width || tracks.bed.width || tracks.load.width;
  const height = tracks.body.height || tracks.bed.height || tracks.load.height;
  const total = Math.max(
    tracks.body.frameCount,
    tracks.bed.frameCount,
    tracks.load.frameCount,
    tracks.rim.frameCount,
  );
  const visibleLoadFrames = useMemo(() => {
    let covered = 0;
    for (let f = 0; f < total; f++) {
      if (frameLayers(tracks.bed, tracks.load, tracks.rim, f).loads.length > 0) covered += 1;
    }
    return covered;
  }, [tracks, total]);

  useEffect(() => {
    onLoadCoverage?.(visibleLoadFrames, total);
  }, [onLoadCoverage, visibleLoadFrames, total]);

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
      <div
        role="alert"
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center text-sm text-white/80"
      >
        <p>Footage could not be loaded.</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setReadyUrl(null);
            setAttempt((value) => value + 1);
          }}
          className="min-h-10 rounded-md border border-white/30 px-4"
        >
          Retry footage
        </button>
      </div>
    );
  }

  const layers = frameLayers(tracks.bed, tracks.load, tracks.rim, frame);
  const bodyShapes = tracks.body.frames.get(frame) ?? [];
  const { bed, rim, loads, rimShapes } = layers;
  const videoReady = url !== null && readyUrl === url;
  const showMasks = isImage || videoReady;
  const openingId = `${loadClipId}-opening`;
  const exteriorId = `${loadClipId}-exterior`;
  const bodyMaskId = `${loadClipId}-body-mask`;

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) video.pause();
    else {
      try {
        await video.play();
        setPlayError(false);
      } catch {
        setPlayError(true);
      }
    }
  }

  return (
    <div className={className ?? "absolute inset-0 flex flex-col bg-black"}>
      <div className="relative min-h-0 flex-1">
        {!url && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black text-xs text-white/80">
            <Loader2Icon className="size-6 animate-spin text-white/90" />
            <span>Loading footage…</span>
          </div>
        )}
        {url &&
          (isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- authenticated blob media
            <img
              src={url}
              alt="Evidence frame"
              onLoad={() => setReadyUrl(url)}
              className="size-full object-contain"
              onError={() => setFailed(true)}
            />
          ) : (
            <video
              ref={videoRef}
              src={url}
              poster={poster}
              preload="auto"
              className="size-full object-contain"
              autoPlay={autoPlay}
              muted={muted}
              loop
              playsInline
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => {
                const cur = e.currentTarget.currentTime;
                setTime(cur);
                timeRef.current = cur;
              }}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                if (timeRef.current > 0 && Math.abs(e.currentTarget.currentTime - timeRef.current) > 0.1) {
                  e.currentTarget.currentTime = timeRef.current;
                }
              }}
              onLoadedData={() => setReadyUrl(url)}
              onError={() => setFailed(true)}
              aria-label="Evidence clip with segmentation overlay"
            />
          ))}
        {url && !isImage && !videoReady && (
          <div className="absolute inset-0 grid place-items-center bg-black/80 text-xs text-white/80">
            <span className="flex items-center gap-2">
              <Loader2Icon className="size-4 animate-spin" />
              Loading footage…
            </span>
          </div>
        )}
        {showMasks && width > 0 && height > 0 && (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            className="pointer-events-none absolute inset-0 size-full"
            aria-hidden
          >
            <defs>
              <clipPath id={openingId} clipPathUnits="userSpaceOnUse">
                {bed && <rect x={bed.left} y={0} width={bed.right - bed.left} height={rim} />}
              </clipPath>
              <clipPath id={exteriorId} clipPathUnits="userSpaceOnUse">
                {bed && (
                  <rect
                    x={bed.left}
                    y={rim}
                    width={bed.right - bed.left}
                    height={Math.max(0, bed.bottom - rim)}
                  />
                )}
              </clipPath>
              <mask
                id={bodyMaskId}
                maskUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={width}
                height={height}
                style={{ maskType: "luminance" }}
              >
                <rect width={width} height={height} fill="white" />
                {bed && (
                  <rect
                    x={bed.left}
                    y={bed.top}
                    width={bed.right - bed.left}
                    height={Math.max(0, rim - bed.top)}
                    fill="black"
                  />
                )}
                {loads.map((s) => (
                  <path
                    key={s.objectId}
                    d={s.path}
                    transform={`translate(${s.left} ${s.top})`}
                    fill="black"
                  />
                ))}
              </mask>
            </defs>
            {show.body && (
              <g mask={`url(#${bodyMaskId})`}>
                {bodyShapes.map((s) => (
                  <Shape key={`body-${s.objectId}`} s={s} color="#f59e0b" />
                ))}
                {/* Render tailgate in amber Body color */}
                {rimShapes?.map((s) => (
                  <Shape key={`tailgate-${s.objectId}`} s={s} color="#f59e0b" />
                ))}
                {/* A bed prompt often includes the tailgate face. Reassign that visible
                  exterior to Body using the same rim boundary as measurement. */}
                {bed && (
                  <g clipPath={`url(#${exteriorId})`}>
                    <Shape s={bed} color="#f59e0b" />
                  </g>
                )}
              </g>
            )}
            {show.bed && bed && (
              <g clipPath={`url(#${openingId})`}>
                <Shape s={bed} color="#0284c7" />
              </g>
            )}
            {show.load && (
              <g clipPath={`url(#${openingId})`}>
                {loads.map((s) => (
                  <Shape key={s.objectId} s={s} color="#8b5cf6" prominent />
                ))}
              </g>
            )}
          </svg>
        )}
      </div>
      {!isImage && url && !hideControls && (
        <div className="flex shrink-0 items-center gap-2 bg-black px-3 py-2 text-white">
          <button
            type="button"
            aria-label={playing ? "Pause evidence" : "Play evidence"}
            onClick={() => void togglePlayback()}
            className="rounded p-1.5 hover:bg-white/20 focus-visible:outline-2"
          >
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </button>
          <input
            aria-label="Seek evidence"
            type="range"
            min={0}
            max={Number.isFinite(duration) ? duration : 0}
            step={0.01}
            value={time}
            onChange={(e) => {
              const t = Number(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = t;
              setTime(t);
            }}
            className="min-w-0 flex-1 accent-violet-400"
          />
          <span className="text-[11px] tabular-nums">
            {clockTime(time)} / {clockTime(duration)}
          </span>
          <QualitySelector />
          <button
            type="button"
            aria-label={muted ? "Unmute evidence" : "Mute evidence"}
            onClick={() => setMuted((m) => !m)}
            className="rounded p-1.5 hover:bg-white/20 focus-visible:outline-2"
          >
            {muted ? <VolumeXIcon size={16} /> : <Volume2Icon size={16} />}
          </button>
          {playError && (
            <span role="status" className="text-xs">
              Playback could not start. Try again.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function clockTime(seconds: number) {
  const n = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

/** All named material prompts contribute; the legacy aggregate is a fallback. */
export function loadTexts(segments: Record<string, string>): string[] {
  const named = Object.entries(segments)
    .filter(([key, text]) => key.startsWith(LOAD_PREFIX) && text.trim().length > 0)
    .map(([, text]) => text);
  const texts = named.length ? named : [segments[LOAD_LABEL] ?? ""];
  return [...new Set(texts.filter((text) => text.trim().length > 0))];
}

/** Mirror the backend's dominant bed and tailgate boundary without intersecting
 * cargo with visible metal surfaces (which exclude the cargo by definition). */
export function frameLayers(beds: SamTrack, loads: SamTrack, rims: SamTrack, frame: number) {
  const totals = new Map<string, number>();
  for (const shapes of beds.frames.values())
    for (const s of shapes) {
      totals.set(
        s.objectId,
        (totals.get(s.objectId) ?? 0) + (s.right - s.left) * (s.bottom - s.top),
      );
    }
  const id = [...totals].sort((a, b) => b[1] - a[1])[0]?.[0];
  let bed = beds.frames.get(frame)?.find((s) => s.objectId === id);

  // If the bed tracking starts a few frames into the video (e.g. truck entering view before lock-on),
  // borrow the earliest tracked bed frame for pre-roll frames so masks don't drop out during the first 1-2s.
  if (!bed && id) {
    const validBedFrames = [...beds.frames.entries()]
      .filter(([, shapes]) => shapes.some((s) => s.objectId === id))
      .map(([f]) => f)
      .sort((a, b) => a - b);
    if (validBedFrames.length > 0 && frame < validBedFrames[0]!) {
      bed = beds.frames.get(validBedFrames[0]!)?.find((s) => s.objectId === id);
    }
  }

  const rimShapes = rims.frames.get(frame) ?? [];
  const loadShapes = loads.frames.get(frame) ?? [];

  if (!bed) {
    return {
      bed: undefined,
      rim: rimShapes.length ? Math.min(...rimShapes.map((s) => s.top)) : 0,
      loads: loadShapes,
      rimShapes,
    };
  }

  const floor = bed.top + (bed.bottom - bed.top) * 0.25;
  const candidates = rimShapes.filter(
    (s) => overlapShare(s, bed) > 0 && s.top >= floor && s.top < bed.bottom,
  );
  const rim = candidates.length
    ? Math.min(...candidates.map((s) => s.top))
    : rimShapes.length
      ? Math.min(...rimShapes.map((s) => s.top))
      : bed.bottom;

  const filteredLoads = loadShapes.filter((s) => overlapShare(s, bed) >= 0.35 && s.top < rim);
  const finalLoads =
    filteredLoads.length > 0 ? filteredLoads : loadShapes.filter((s) => s.top < rim);

  return {
    bed,
    rim,
    loads: finalLoads,
    rimShapes,
  };
}

/** Combine every phrase SAM used for this load into one frame-indexed track. */
function mergeSamTracks(tracks: SamTrack[]): SamTrack {
  const frames = new Map<number, SamShape[]>();
  let width = 0;
  let height = 0;
  let frameCount = 0;
  for (const [trackIndex, track] of tracks.entries()) {
    width ||= track.width;
    height ||= track.height;
    frameCount = Math.max(frameCount, track.frameCount);
    for (const [frame, shapes] of track.frames) {
      const uniquelyIdentified = shapes.map((shape) => ({
        ...shape,
        objectId: `${trackIndex}-${shape.objectId}`,
      }));
      frames.set(frame, [...(frames.get(frame) ?? []), ...uniquelyIdentified]);
    }
  }
  return { frames, width, height, frameCount };
}

/** Suppress prompt matches outside the measured bed; it commonly includes
 * stationary debris in the background that is unrelated to this truckload. */
function overlapShare(shape: SamShape, bed: SamShape): number {
  const width = Math.max(0, Math.min(shape.right, bed.right) - Math.max(shape.left, bed.left));
  const height = Math.max(0, Math.min(shape.bottom, bed.bottom) - Math.max(shape.top, bed.top));
  const area = Math.max(1, shape.right - shape.left) * Math.max(1, shape.bottom - shape.top);
  return (width * height) / area;
}

function Shape({
  s,
  color,
  prominent = false,
}: {
  s: SamShape;
  color: string;
  prominent?: boolean;
}) {
  return (
    <g>
      <path
        d={s.path}
        transform={`translate(${s.left} ${s.top})`}
        fill={color}
        fillOpacity={prominent ? 0.38 : 0.22}
        stroke={color}
        strokeWidth={prominent ? 1.8 : 1.3}
        fillRule="evenodd"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
