"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";

/**
 * Adaptive video background for the login screen.
 *
 * Requirements:
 *  - Instant Low-Quality Playback: Starts immediately with an ultra-lightweight low-quality clip
 *    (sm: ~435KB dark, ~633KB light, faststart moov atom at byte 0), ensuring video motion begins
 *    instantly on all connection types without waiting on static posters or heavy video files.
 *  - Seamless High-Quality Upgrade: Once the low-quality clip is playing, the optimal
 *    high-quality variant (md/lg/xl) is preloaded in the background. As soon as it is
 *    ready to play, time is synchronized and it smoothly crossfades in without any
 *    stutter, freeze, or black flash.
 *  - Autoplay Reliability: Explicitly configures DOM muted/playsInline properties and
 *    attaches fallback interaction listeners to satisfy browser media policies.
 *  - Graceful Degradation: If high-quality video fails or data saver is active, the low-quality
 *    stream continues playing smoothly.
 */

type Tier = "sm" | "md" | "lg" | "xl";

/** Asset mapping per tier and mode */
const TIER_FILE = {
  sm: (mode: string) => `/login-${mode}-sm.mp4`, // ~430-630KB, instant start
  md: (mode: string) => `/login-${mode}-md.mp4`, // ~1.1-1.5MB, 720p
  lg: (mode: string) => `/login-${mode}-lg.mp4`, // ~2.9-4.1MB, 1080p
  xl: (mode: string) => `/login-${mode}.mp4`,    // ~5.1-6.7MB, master source
} as const;

type NetworkInfo = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};

/**
 * Determine the optimal target tier based on connection throughput.
 */
function pickTargetTier(): Tier {
  if (typeof navigator === "undefined") return "lg";
  const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;
  if (!conn) return "lg"; // Default for Safari/Firefox without hint

  if (conn.saveData) return "sm";

  const type = conn.effectiveType ?? "";
  const down = conn.downlink ?? 0;

  if (type.includes("2g")) return "sm";
  if (type === "3g") return down >= 1.5 ? "md" : "sm";
  if (down >= 8) return "xl";
  if (down >= 4) return "lg";
  return "md";
}

/**
 * Attempt to reliably start muted autoplay on an HTMLVideoElement.
 */
function safelyPlay(video: HTMLVideoElement | null) {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      // Browser autoplay policy might defer playback until user gesture
    });
  }
}

export function LoginVideoBg() {
  const { mode } = useTheme();
  const videoMode = mode === "light" ? "light" : "dark";

  const lowSrc = TIER_FILE.sm(videoMode);

  const [targetTier, setTargetTier] = useState<Tier>("lg");
  const [isHighReady, setIsHighReady] = useState(false);

  const lowVideoRef = useRef<HTMLVideoElement>(null);
  const highVideoRef = useRef<HTMLVideoElement>(null);

  // Evaluate target tier on mount and when connection changes
  useEffect(() => {
    setTargetTier(pickTargetTier());
    setIsHighReady(false);
  }, [videoMode]);

  const highSrc = TIER_FILE[targetTier](videoMode);
  const shouldUpgrade = targetTier !== "sm";

  // Autoplay fallback listeners for initial user interaction
  useEffect(() => {
    const handleInteraction = () => {
      if (isHighReady && highVideoRef.current && highVideoRef.current.paused) {
        safelyPlay(highVideoRef.current);
      } else if (lowVideoRef.current && lowVideoRef.current.paused) {
        safelyPlay(lowVideoRef.current);
      }
    };

    window.addEventListener("pointerdown", handleInteraction, { passive: true });
    window.addEventListener("keydown", handleInteraction, { passive: true });
    window.addEventListener("touchstart", handleInteraction, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, [isHighReady]);

  // Attempt instant autoplay of low-quality video as soon as mounted
  useEffect(() => {
    const el = lowVideoRef.current;
    if (el) {
      safelyPlay(el);
    }
  }, [lowSrc]);

  // Handle upgrade to high-quality video
  const onHighCanPlay = () => {
    const low = lowVideoRef.current;
    const high = highVideoRef.current;
    if (!high) return;

    // Synchronize playhead with the low-quality video for a seamless transition
    if (low && Number.isFinite(low.currentTime) && low.currentTime > 0) {
      try {
        high.currentTime = low.currentTime;
      } catch {
        // Safe fallback if sync is rejected by browser
      }
    }

    safelyPlay(high);
    setIsHighReady(true);

    // Pause low-quality video after transition finishes to save GPU/CPU cycles
    setTimeout(() => {
      if (lowVideoRef.current) {
        lowVideoRef.current.pause();
      }
    }, 1000);
  };

  // Subtle loop crossfade on active video without React state churn
  useEffect(() => {
    let rafId = 0;
    const FADE = 0.5;

    const tick = () => {
      const activeEl = isHighReady ? highVideoRef.current : lowVideoRef.current;
      if (activeEl && Number.isFinite(activeEl.duration) && activeEl.duration > FADE * 2) {
        const t = activeEl.currentTime;
        const dur = activeEl.duration;
        let opacity = 1;

        if (t > dur - FADE) {
          // Fade out slightly at end of loop to soften cut
          opacity = Math.max(0.2, (dur - t) / FADE);
        } else if (t < FADE && t > 0.05) {
          // Fade back in at start of loop
          opacity = Math.max(0.2, t / FADE);
        }

        // Direct DOM style mutation to avoid 60 FPS React re-renders
        if (activeEl.style.opacity !== String(opacity)) {
          activeEl.style.opacity = String(opacity);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isHighReady]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[var(--color-bg)]"
    >
      {/* Layer 1: Low-quality stream (loads instantly, ~400-600KB) */}
      <video
        key={`low-${lowSrc}`}
        ref={lowVideoRef}
        src={lowSrc}
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
        disablePictureInPicture
        tabIndex={-1}
        className="size-full object-cover absolute inset-0"
        style={{
          filter:
            videoMode === "dark"
              ? "brightness(1.05) contrast(1.05)"
              : "brightness(1.02) contrast(1.02)",
        }}
      />

      {/* Layer 2: High-quality stream (preloaded in background, fades in seamlessly once ready) */}
      {shouldUpgrade && (
        <video
          key={`high-${highSrc}`}
          ref={highVideoRef}
          src={highSrc}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
          onCanPlay={onHighCanPlay}
          onError={() => setIsHighReady(false)}
          className={`size-full object-cover absolute inset-0 transition-opacity duration-1000 ${
            isHighReady ? "opacity-100" : "opacity-0"
          }`}
          style={{
            filter:
              videoMode === "dark"
                ? "brightness(1.05) contrast(1.05)"
                : "brightness(1.02) contrast(1.02)",
          }}
        />
      )}

      {/* Edge gradient vignette for copy legibility */}
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
