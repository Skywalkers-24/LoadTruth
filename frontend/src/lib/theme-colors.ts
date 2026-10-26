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
  "--text": "#f1f5fb",
  "--muted": "#a5b2c4",
  "--subtle": "#7889a0",
  "--border": "#2b3a50",
  "--surface": "#111c2d",
  "--surface-2": "#172438",
  "--accent": "#4f8cff",
  "--money": "#f5a623",
  "--ok": "#35d08a",
  "--warn": "#f5a623",
  "--danger": "#ff6b6f",
  "--info": "#63a7ff",
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
