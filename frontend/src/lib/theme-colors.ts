"use client";

import { useEffect, useState } from "react";

import { useTheme } from "@/lib/theme";

/** The token names charts need as concrete colors. */
const TOKENS = [
  "--text",
  "--muted",
  "--subtle",
  "--border",
  "--surface",
  "--surface-2",
  "--accent",
  "--money",
  "--ok",
  "--warn",
  "--danger",
  "--info",
] as const;

export type ChartColors = Record<(typeof TOKENS)[number], string>;

const FALLBACK: ChartColors = {
  "--text": "#f4f7fc",
  "--muted": "#b8c5d9",
  "--subtle": "#96a5ba",
  "--border": "#2d3d56",
  "--surface": "#121d30",
  "--surface-2": "#1a2940",
  "--accent": "#8ab4ff",
  "--money": "#c4b5fd",
  "--ok": "#34d399",
  "--warn": "#c4b5fd",
  "--danger": "#fb7185",
  "--info": "#7dd3fc",
};

/**
 * Resolve the theme's CSS custom properties into concrete color strings for
 * Recharts (which can't consume `var(--x)` for every prop). Re-resolves on
 * theme change so charts recolor when the user toggles dark/light.
 */
export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  const [colors, setColors] = useState<ChartColors>(FALLBACK);

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const next = {} as ChartColors;
    for (const t of TOKENS) {
      const v = styles.getPropertyValue(t).trim();
      next[t] = v || FALLBACK[t];
    }
    setColors(next);
  }, [theme]);

  return colors;
}
