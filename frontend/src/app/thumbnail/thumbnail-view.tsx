"use client";

import { useEffect, useState } from "react";
import { LoginVideoBg } from "@/components/auth/login-video-bg";
import { LogoMark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Clean thumbnail view for video captures, screenshots, and presentations.
 * Displays only:
 *  1. Adaptive CAD truck video background (light/dark mode aware)
 *  2. Official LoadTruth brand logo
 *  3. Theme toggle switch
 *
 * Press 'h' on keyboard to toggle UI visibility if recording raw video.
 */
export function ThumbnailView() {
  const [uiVisible, setUiVisible] = useState(true);
  const [showThemeToggle, setShowThemeToggle] = useState(true);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("poster")
    ) {
      setShowThemeToggle(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "h" || e.key === "H") {
        setUiVisible((v) => !v);
      }
      if (e.key === "t" || e.key === "T") {
        setShowThemeToggle((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="relative h-dvh min-h-dvh w-full overflow-hidden select-none bg-[var(--color-bg)]">
      {/* 1. Mode-aware CAD truck video background */}
      <LoginVideoBg hideVignette />

      {/* 2. Official LoadTruth logo centered with big brand name */}
      <div
        className={`absolute inset-0 z-20 flex items-center justify-center pointer-events-none select-none transition-opacity duration-300 ${
          uiVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Subtle radial ambient wash behind the logo for pristine legibility across all video frames */}
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div className="h-[280px] w-[680px] max-w-[90vw] rounded-full bg-black/40 blur-3xl" />
        </div>

        <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 md:gap-7 p-6">
          <LogoMark
            size={108}
            forceTheme="dark"
            className="shrink-0 drop-shadow-[0_10px_25px_rgba(0,0,0,0.7)]"
          />
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.9)] [text-shadow:0_4px_24px_rgba(0,0,0,0.9),0_2px_8px_rgba(0,0,0,0.95)]">
            LoadTruth
          </h1>
        </div>
      </div>

      {/* 3. Theme picker */}
      {showThemeToggle && (
        <div
          className={`absolute top-6 right-6 z-30 transition-opacity duration-300 xl:top-8 xl:right-8 ${
            uiVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <ThemeToggle />
        </div>
      )}
    </main>
  );
}
