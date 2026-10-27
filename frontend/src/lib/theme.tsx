"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * LoadTruth theme system.
 *
 * Six curated dark themes, each driven by the `data-theme` attribute on <html>
 * (set before paint by the inline script to avoid a flash of the wrong theme).
 * Palettes follow Material Design's dark-theme guidance: dark-gray surfaces
 * with elevation shown via lighter overlays, desaturated accent hues, and
 * high-contrast text. Every theme defines the same CSS-variable contract in
 * globals.css, so all screens and shadcn components recolor automatically.
 */
export type Theme = "midnight" | "graphite" | "abyss" | "evergreen" | "plum" | "enterprise";

export type ThemeScheme = "dark" | "light";

export interface ThemeMeta {
  id: Theme;
  /** Short display name shown in the picker. */
  label: string;
  /** One-line description of the vibe / inspiration. */
  description: string;
  /** Base scheme — drives `color-scheme` and the dark-mode `.dark` class. */
  scheme: ThemeScheme;
  /** Three representative swatch colors for the picker preview (bg, surface, accent). */
  swatches: [string, string, string];
}

/**
 * Ordered theme catalog. Order = display order in the picker.
 * Swatches are static previews so the menu can render before the theme loads.
 */
const MIDNIGHT: ThemeMeta = {
  id: "midnight",
  label: "Midnight",
  description: "Material baseline dark · desaturated violet",
  scheme: "dark",
  swatches: ["#121212", "#1f1b24", "#bb86fc"],
};

export const THEMES: ThemeMeta[] = [
  MIDNIGHT,
  {
    id: "graphite",
    label: "Graphite",
    description: "Warm neutral dark · teal accent",
    scheme: "dark",
    swatches: ["#18181b", "#27272a", "#2dd4bf"],
  },
  {
    id: "abyss",
    label: "Abyss",
    description: "Deep blue dark · desaturated cyan",
    scheme: "dark",
    swatches: ["#0e1116", "#171c24", "#4dd0e1"],
  },
  {
    id: "evergreen",
    label: "Evergreen",
    description: "Calm dark · desaturated green",
    scheme: "dark",
    swatches: ["#121613", "#1b211c", "#81c995"],
  },
  {
    id: "plum",
    label: "Plum",
    description: "Dark · desaturated magenta-rose",
    scheme: "dark",
    swatches: ["#141016", "#1e1822", "#f48fb1"],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    description: "Professional dark navy · corporate blue",
    scheme: "dark",
    swatches: ["#0d1420", "#162133", "#4c8dff"],
  },
];

const THEME_IDS = THEMES.map((t) => t.id);
const DARK_THEMES = THEMES.filter((t) => t.scheme === "dark").map((t) => t.id);

export function themeMeta(id: Theme): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? MIDNIGHT;
}

function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEME_IDS as string[]).includes(v);
}

function isDarkTheme(id: Theme): boolean {
  return (DARK_THEMES as string[]).includes(id);
}

interface ThemeContextValue {
  theme: Theme;
  scheme: ThemeScheme;
  themes: ThemeMeta[];
  setTheme: (t: Theme) => void;
  /** Cycle dark⇄light (keeps the single-button affordance for the command palette). */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "loadtruth-theme";
const DEFAULT_THEME: Theme = "midnight";

/** Legacy values map onto the new theme ids (all themes are dark now). */
function migrate(stored: string | null): Theme | null {
  if (stored === "dark" || stored === "light" || stored === "daylight" || stored === "classic") {
    return "midnight";
  }
  if (stored === "arctic") return "abyss";
  return isTheme(stored) ? stored : null;
}

function initialTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return migrate(window.localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  // Align React state with the attribute the inline script already set.
  useEffect(() => {
    setThemeState(initialTheme());
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-theme", theme);
    // shadcn components key dark mode off a `.dark` class; mirror it.
    el.classList.toggle("dark", isDarkTheme(theme));
    window.localStorage.setItem(STORAGE_KEY, theme);
    // Briefly ease colors so the switch cross-fades rather than cutting.
    el.setAttribute("data-theme-anim", "");
    const t = window.setTimeout(() => el.removeAttribute("data-theme-anim"), 350);
    return () => window.clearTimeout(t);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    if (isTheme(t)) setThemeState(t);
  }, []);

  // All themes are dark; toggle cycles to the next theme in the catalog.
  const toggle = useCallback(() => {
    setThemeState((cur) => {
      const i = THEME_IDS.indexOf(cur);
      return THEME_IDS[(i + 1) % THEME_IDS.length] ?? DEFAULT_THEME;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      scheme: isDarkTheme(theme) ? "dark" : "light",
      themes: THEMES,
      setTheme,
      toggle,
    }),
    [theme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Inline script that sets data-theme (and the `.dark` class for dark themes)
 * before paint to avoid a flash of the wrong theme. Migrates the old binary
 * "dark"/"light" values to the new theme ids.
 */
export const themeInitScript = `
(function(){try{
  var k='${STORAGE_KEY}';var s=localStorage.getItem(k);
  var map={dark:'midnight',light:'midnight',daylight:'midnight',classic:'midnight',arctic:'abyss'};
  var ids=${JSON.stringify(THEME_IDS)};
  var t=map[s]||(ids.indexOf(s)>=0?s:'${DEFAULT_THEME}');
  var e=document.documentElement;
  e.setAttribute('data-theme',t);
  e.classList.add('dark');
}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');document.documentElement.classList.add('dark');}})();
`;
