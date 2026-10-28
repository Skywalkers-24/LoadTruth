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

/** Pick a tier from the Network Information API, with safe fallbacks. */
function pickTier(): Tier | null {
  if (typeof navigator === "undefined") return "md";
  const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;
  if (!conn) return "lg"; // no hint (Safari/Firefox): assume a healthy link

  if (conn.saveData) return null; // honor data-saver: skip video entirely
  const type = conn.effectiveType ?? "";
  if (type.includes("2g")) return null; // slow-2g / 2g: skip
  if (type === "3g") {
    // slow-3g lands here too; lean on downlink to separate them
    return (conn.downlink ?? 0) >= 1.5 ? "md" : "sm";
  }
  // 4g and better: size by measured throughput
  const down = conn.downlink ?? 0;
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

  useEffect(() => {
    setReady(false);
    setArmed(false);

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const chosen = reduce ? null : pickTier();
    setTier(chosen);
    if (!chosen) return; // data-saver / 2g / reduced-motion: poster only

    const idle = (cb: () => void) => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
      if (ric) return ric(cb);
      return window.setTimeout(cb, 300);
    };
    const id = idle(() => setArmed(true));
    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void })
        .cancelIdleCallback;
      if (cic) cic(id as number);
      else clearTimeout(id as number);
    };
  }, [mode]);

  // Once armed, load + play. Autoplay only works muted + playsInline.
  useEffect(() => {
    if (!armed) return;
    const el = videoRef.current;
    if (!el) return;
    el.load();
    const onCanPlay = () => {
      setReady(true);
      void el.play().catch(() => {
        /* autoplay blocked — the poster + themed background stay, which is fine */
      });
    };
    el.addEventListener("canplay", onCanPlay, { once: true });
    return () => el.removeEventListener("canplay", onCanPlay);
  }, [armed]);

  const src = tier ? TIER_FILE[tier](videoMode) : null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[var(--color-bg)]"
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
          playsInline
          preload="none"
          poster={poster}
          disablePictureInPicture
          tabIndex={-1}
          className={`size-full object-cover transition-opacity duration-700 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        >
          <source src={src} type="video/mp4" />
        </video>
      )}
      {/* Readability scrim: a mode-appropriate wash so the sign-in text and
          member cards stay legible over the footage. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            videoMode === "light"
              ? "linear-gradient(90deg, color-mix(in srgb, var(--color-bg) 78%, transparent), color-mix(in srgb, var(--color-bg) 42%, transparent))"
              : "linear-gradient(90deg, color-mix(in srgb, var(--color-bg) 82%, transparent), color-mix(in srgb, var(--color-bg) 55%, transparent))",
        }}
      />
    </div>
  );
}
