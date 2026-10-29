"use client";

import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/lib/theme";

/**
 * Lazy, mode-aware, adaptive video background for the login screen.
 *
 * Goals:
 *  - Text stays readable: the video sits behind a scrim and the real content.
 *  - Fast first paint on any link: a lightweight poster frame paints instantly,
 *    and the video is `preload="none"` so it never blocks sign-in. The clip
 *    only starts fetching once the browser is idle (requestIdleCallback).
 *  - Right-sized download: the tier (sm/md/lg/xl) is chosen from the visitor's
 *    connection so a phone on 3G pulls ~430KB while a desktop on wifi gets the
 *    full-quality clip. Data-saver and 2G skip the video entirely.
 *  - Mode aware: dark vs light sources picked from the active theme mode, and
 *    the element remounts on a mode switch (keyed) so the right clip plays.
 *  - Degrades gracefully: if the video can't load or play, the poster and the
 *    themed background color stay, so nothing ever looks broken.
 *
 * Static assets live in /public and are served with a long immutable cache
 * (see next.config.ts), so Cloudflare's edge serves repeat visits for free.
 */

type Tier = "sm" | "md" | "lg" | "xl";

/** Approximate byte weights per tier (both modes land close to these). */
const TIER_FILE = {
  sm: (mode: string) => `/login-${mode}-sm.mp4`, // ~430KB, 540p
  md: (mode: string) => `/login-${mode}-md.mp4`, // ~820KB, 720p
  lg: (mode: string) => `/login-${mode}-lg.mp4`, // ~1.7MB, 1080p
  xl: (mode: string) => `/login-${mode}.mp4`, // full source quality
} as const;

type NetworkInfo = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};

/** Pick a tier from the Network Information API, with safe fallbacks.
 *
 * The bias is toward playing the video: the only hard skip is an explicit
 * data-saver request. An unknown or ambiguous connection hint resolves to a
 * small tier so the clip still plays on a modest link rather than falling back
 * to a static poster (which is what "I can't see the video" looked like). */
function pickTier(): Tier | null {
  if (typeof navigator === "undefined") return "lg";
  const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;
  if (!conn) return "lg"; // no hint (Safari/Firefox): assume a healthy link

  if (conn.saveData) return null; // honor data-saver: skip video entirely

  const type = conn.effectiveType ?? "";
  const down = conn.downlink ?? 0;
  // Very slow links get the smallest clip rather than nothing; the file is
  // ~430KB, which is acceptable even on 2g, and it still looks intentional.
  if (type.includes("2g")) return "sm";
  if (type === "3g") return down >= 1.5 ? "md" : "sm";
  // 4g and better (or an unreported type): size by measured throughput.
  if (down >= 8) return "xl";
  if (down >= 4) return "lg";
  return "md";
}

export function LoginVideoBg() {
  const { mode } = useTheme();
  const videoMode = mode === "light" ? "light" : "dark";
  const poster = `/login-${videoMode}-poster.jpg`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  // Defer loading until the browser is idle so the login form paints first.
  const [armed, setArmed] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  // 1 = fully visible; dips toward 0 at the loop seam to hide the restart cut.
  const [loopFade, setLoopFade] = useState(1);

  useEffect(() => {
    setReady(false);
    setArmed(false);

    // Only an explicit data-saver / 2g skips the clip. Reduced-motion still gets
    // the video: it is muted and loops gently as an ambient background, not an
    // attention-grabbing animation, and the poster remains the fallback if it
    // can't load.
    const chosen = pickTier();
    setTier(chosen);
    if (!chosen) return; // data-saver only: poster stays

    const idle = (cb: () => void) => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
      if (ric) return ric.call(window, cb);
      return window.setTimeout(cb, 300);
    };
    const id = idle(() => setArmed(true));
    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void })
        .cancelIdleCallback;
      if (cic) cic.call(window, id as number);
      else clearTimeout(id as number);
    };
  }, [mode]);

  // Once armed, load + play. Autoplay only works muted + playsInline. We reveal
  // the video on the first frame that can paint (canplay OR loadeddata, since
  // browsers differ on which fires first) and attempt playback; if the browser
  // blocks autoplay or the file errors, `ready` stays false and the poster
  // keeps showing.
  useEffect(() => {
    if (!armed) return;
    const el = videoRef.current;
    if (!el) return;
    const reveal = () => {
      void el
        .play()
        .then(() => setReady(true))
        .catch(() => {
          /* Keep the poster visible if autoplay is blocked. */
        });
    };
    const retryPlayback = () => reveal();
    el.addEventListener("canplay", reveal);
    el.addEventListener("loadeddata", reveal);
    const onError = () => setReady(false);
    el.addEventListener("error", onError);
    window.addEventListener("pointerdown", retryPlayback);
    window.addEventListener("keydown", retryPlayback);
    // Attach listeners before loading so quick/cached media cannot fire past them.
    el.load();
    return () => {
      el.removeEventListener("canplay", reveal);
      el.removeEventListener("loadeddata", reveal);
      el.removeEventListener("error", onError);
      window.removeEventListener("pointerdown", retryPlayback);
      window.removeEventListener("keydown", retryPlayback);
    };
  }, [armed]);

  // Smooth, seamless loop. The clip's last frame does not match its first, so a
  // raw `loop` shows a hard cut. The earlier fix reversed playback by stepping
  // currentTime every frame, but that forces a seek/decode per frame and the
  // decoder visibly STALLS at the turn-around. Instead we keep normal forward
  // playback (never seek) and hide the restart seam behind a short opacity
  // crossfade: as the clip nears its end we dip the video toward the poster for
  // ~0.5s, it loops back to 0, and we fade it back in. No seeking, so no stall.
  useEffect(() => {
    if (!armed || !ready) return;
    const el = videoRef.current;
    if (!el) return;

    let raf = 0;
    const FADE = 0.55; // seconds of fade at each end of the loop

    const tick = () => {
      const dur = el.duration;
      if (Number.isFinite(dur) && dur > FADE * 2) {
        const t = el.currentTime;
        // Fade out over the last FADE seconds and back in over the first FADE.
        const outA = t > dur - FADE ? (dur - t) / FADE : 1;
        const inA = t < FADE ? t / FADE : 1;
        const a = Math.max(0, Math.min(1, Math.min(outA, inA)));
        setLoopFade(a);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      setLoopFade(1);
    };
  }, [armed, ready]);

  const src = tier ? TIER_FILE[tier](videoMode) : null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[var(--color-bg)]"
    >
      {/* Poster paints instantly for a non-blank first frame on every link. */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
        style={{
          backgroundImage: `url(${poster})`,
          opacity: ready ? 0 : 1,
        }}
      />
      {armed && src && (
        <video
          key={src}
          ref={videoRef}
          muted
          loop
          autoPlay
          playsInline
          preload="none"
          poster={poster}
          disablePictureInPicture
          tabIndex={-1}
          className="size-full object-cover"
          // The source clip is a dark, low-contrast scanner shot (avg ~rgb(45,76,87)).
          // A gentle brightness/contrast/saturation lift makes the teal footage
          // read as intentional ambient motion against the dark console. Kept
          // moderate on purpose: a heavy brightness boost amplifies the clip's
          // compression noise into a washed-out haze. Opacity = ready gate times
          // the loop-seam crossfade (dips at the restart so the cut is hidden).
          style={{
            opacity: ready ? loopFade : 0,
            transition: ready ? "none" : "opacity 700ms",
            filter:
              videoMode === "dark"
                ? "brightness(1.35) contrast(1.1) saturate(1.3)"
                : "brightness(1.15) contrast(1.05) saturate(1.2)",
          }}
        >
          <source src={src} type="video/mp4" />
        </video>
      )}
      {/* Very light vignette only. The brand panel carries its own left-edge
          gradient for text legibility, so this just keeps the footage from
          blowing out at the extreme edges. Kept minimal so the truck reads. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            videoMode === "light"
              ? "linear-gradient(90deg, color-mix(in srgb, var(--color-bg) 18%, transparent), transparent 30%)"
              : "linear-gradient(90deg, color-mix(in srgb, var(--color-bg) 20%, transparent), transparent 30%)",
        }}
      />
    </div>
  );
}
