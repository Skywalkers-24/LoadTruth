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
  "--text": "#ece8f1",
  "--muted": "#b4aec1",
  "--subtle": "#a39eb0",
  "--border": "#302b3a",
  "--surface": "#1e1b24",
  "--surface-2": "#272330",
  "--accent": "#bb86fc",
  "--money": "#ffca62",
  "--ok": "#03dac6",
  "--warn": "#ffca62",
  "--danger": "#cf6679",
  "--info": "#cbb2fc",
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
