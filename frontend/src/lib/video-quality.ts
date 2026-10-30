"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type VideoQualityTier = "auto" | "high" | "medium" | "low";
export type ResolvedQualityTier = "high" | "medium" | "low";

export interface NetworkConnectionInfo {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g" | string;
  downlink?: number;
  rtt?: number;
}

const STORAGE_KEY = "loadtruth-video-quality";

/**
 * Detect the optimal video resolution tier based on the client network connection.
 * Prioritizes immediate playback and prevents stalling on mobile / constrained links.
 */
export function detectNetworkQuality(): ResolvedQualityTier {
  if (typeof navigator === "undefined") return "medium";

  const conn = (navigator as Navigator & { connection?: NetworkConnectionInfo }).connection;
  if (!conn) return "medium";

  if (conn.saveData) return "low";

  const eff = conn.effectiveType ?? "";
  if (eff.includes("2g")) return "low";

  const down = conn.downlink ?? 0;
  if (eff === "3g") {
    return down >= 1.5 ? "medium" : "low";
  }

  // 4g / broadband / wifi
  if (down >= 4.0) return "high";
  if (down >= 1.5) return "medium";
  return "low";
}

/**
 * Resolve the effective video tier: if "auto", resolves via connection detection.
 */
export function resolveQualityTier(tier: VideoQualityTier): ResolvedQualityTier {
  if (tier === "auto") {
    return detectNetworkQuality();
  }
  return tier;
}

/**
 * Replaces or appends the quality suffix to an MP4 video URL.
 * Handles both relative and absolute (e.g. Cloudflare Worker) paths:
 *   - "high"   -> original .mp4
 *   - "medium" -> -med.mp4
 *   - "low"    -> -low.mp4
 */
export function getVideoVariantUrl(url: string | null | undefined, quality: ResolvedQualityTier): string | null {
  if (!url) return null;
  // If not an mp4 (e.g. image, blob: or data: url), return as-is
  if (!url.toLowerCase().includes(".mp4")) return url;

  // Clean any existing quality variant suffix
  const base = url.replace(/-(?:low|med|high)\.mp4$/i, ".mp4");

  switch (quality) {
    case "low":
      return base.replace(/\.mp4$/i, "-low.mp4");
    case "medium":
      return base.replace(/\.mp4$/i, "-med.mp4");
    case "high":
    default:
      return base;
  }
}

export function getQualityLabel(tier: VideoQualityTier): string {
  switch (tier) {
    case "auto":
      return "Auto";
    case "high":
      return "HD (1080p)";
    case "medium":
      return "720p";
    case "low":
      return "480p";
  }
}

export function getQualityBadge(tier: VideoQualityTier, resolved?: ResolvedQualityTier): string {
  if (tier === "auto") {
    const res = resolved ?? detectNetworkQuality();
    const tag = res === "high" ? "HD" : res === "medium" ? "720p" : "480p";
    return `Auto (${tag})`;
  }
  return tier === "high" ? "HD" : tier === "medium" ? "720p" : "480p";
}

let subscribers: Array<() => void> = [];
function notifySubscribers() {
  subscribers.forEach((s) => s());
}

function getStoredQuality(): VideoQualityTier {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "auto";
  try {
    const val = localStorage?.getItem(STORAGE_KEY);
    if (val === "auto" || val === "high" || val === "medium" || val === "low") {
      return val;
    }
  } catch {
    // localStorage not accessible (e.g. security sandbox, jsdom, SSR)
  }
  return "auto";
}

/**
 * Reactive hook for managing adaptive video quality across the application.
 */
export function useVideoQuality() {
  const [tier, setTierState] = useState<VideoQualityTier>("auto");
  const [resolvedTier, setResolvedTier] = useState<ResolvedQualityTier>("medium");

  useEffect(() => {
    const initial = getStoredQuality();
    setTierState(initial);
    setResolvedTier(resolveQualityTier(initial));

    const handleNetworkChange = () => {
      setResolvedTier(resolveQualityTier(getStoredQuality()));
    };

    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    conn?.addEventListener("change", handleNetworkChange);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const next = getStoredQuality();
        setTierState(next);
        setResolvedTier(resolveQualityTier(next));
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      conn?.removeEventListener("change", handleNetworkChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setQuality = (next: VideoQualityTier) => {
    setTierState(next);
    setResolvedTier(resolveQualityTier(next));
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, next);
      }
      notifySubscribers();
    } catch {
      // storage unavailable / quota exceeded
    }
  };

  const getVariant = (url: string | null | undefined): string | null => {
    return getVideoVariantUrl(url, resolvedTier);
  };

  return {
    tier,
    resolvedTier,
    setQuality,
    getVariant,
    badge: getQualityBadge(tier, resolvedTier),
    isAuto: tier === "auto",
  };
}
