"use client";

import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/lib/theme";

/**
 * Lazy, mode-aware video background for the login screen.
 *
 * Goals:
 *  - Text stays readable: the video sits behind a scrim and the real content.
 *  - Fast first paint even on slow links: the container shows a solid themed
 *    color immediately; the video is `preload="none"` and only starts fetching
 *    once the browser is idle (requestIdleCallback), so it never blocks sign-in.
 *  - Mode aware: dark vs light source picked from the active theme mode, and the
 *    element remounts on a mode switch (keyed) so the right clip plays.
 *  - Degrades gracefully: if the video can't load or play (low data, codec, data
 *    saver), the themed background color just stays — nothing breaks.
 */
export function LoginVideoBg() {
  const { mode } = useTheme();
  const src = mode === "light" ? "/login-light.mp4" : "/login-dark.mp4";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  // Defer loading until the browser is idle so the login form paints first.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setReady(false);
    setArmed(false);
    // Respect data-saver and reduced-motion: skip the video entirely.
    const saveData =
      typeof navigator !== "undefined" &&
      // @ts-expect-error - connection is not in the standard lib types
      (navigator.connection?.saveData === true ||
        // @ts-expect-error - effectiveType is not in the standard lib types
        /2g/.test(navigator.connection?.effectiveType ?? ""));
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (saveData || reduce) return;

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
        /* autoplay blocked — the themed background stays, which is fine */
      });
    };
    el.addEventListener("canplay", onCanPlay, { once: true });
    return () => el.removeEventListener("canplay", onCanPlay);
  }, [armed]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[var(--color-bg)]"
    >
      {armed && (
        <video
          key={src}
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          tabIndex={-1}
          className={`size-full object-cover transition-opacity duration-700 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        >
          <source src={src} type="video/mp4" />
        </video>
      )}
      {/* Readability scrim: a mode-appropriate wash + edge vignette so the
          sign-in text and member cards stay legible over the footage. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            mode === "light"
              ? "linear-gradient(90deg, color-mix(in srgb, var(--color-bg) 78%, transparent), color-mix(in srgb, var(--color-bg) 42%, transparent))"
              : "linear-gradient(90deg, color-mix(in srgb, var(--color-bg) 82%, transparent), color-mix(in srgb, var(--color-bg) 55%, transparent))",
        }}
      />
    </div>
  );
}
