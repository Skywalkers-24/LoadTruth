"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * LoadTruth theme system.
 *
 * Five curated themes, each driven by the `data-theme` attribute on <html>
 * (set before paint by the inline script to avoid a flash of the wrong theme).
 * Every theme defines the same CSS-variable contract in globals.css, so all
 * screens and shadcn components recolor automatically.
 *
 * Themes are grouped by their base `scheme` (dark | light) so the OS
 * `color-scheme` and form controls match, and so we can pick a sensible
 * default when a user has never chosen one.
 */
export type Theme = "midnight" | "graphite" | "daylight" | "classic" | "arctic";

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
  description: "Modern dark · indigo on deep navy",
  scheme: "dark",
  swatches: ["#0a0f1a", "#1a2236", "#6366f1"],
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
    id: "daylight",
    label: "Daylight",
    description: "Clean light · soft shadows, indigo",
    scheme: "light",
    swatches: ["#f5f6fb", "#ffffff", "#4f46e5"],
  },
  {
    id: "classic",
    label: "Classic",
    description: "Enterprise light · trustworthy blue",
    scheme: "light",
    swatches: ["#eef1f6", "#ffffff", "#2563eb"],
  },
  {
    id: "arctic",
    label: "Arctic",
    description: "Airy high-contrast · sky blue",
    scheme: "light",
    swatches: ["#ffffff", "#f1f5f9", "#0284c7"],
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

/** The last dark/light theme a user landed on, so toggle() returns there. */
const LIGHT_DEFAULT: Theme = "daylight";
const DARK_DEFAULT: Theme = "midnight";

/** Legacy values from the old binary toggle map onto the new theme ids. */
function migrate(stored: string | null): Theme | null {
  if (stored === "dark") return "midnight";
  if (stored === "light") return "daylight";
  return isTheme(stored) ? stored : null;
}

function initialTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return migrate(window.localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  // Remember the last theme used in each scheme so toggle() returns the user to
  // their chosen look (e.g. graphite⇄daylight⇄graphite), not a fixed default.
  const lastByScheme = useRef<Record<ThemeScheme, Theme>>({
    dark: DARK_DEFAULT,
    light: LIGHT_DEFAULT,
  });

  // Align React state with the attribute the inline script already set.
  useEffect(() => {
    const t = initialTheme();
    lastByScheme.current[isDarkTheme(t) ? "dark" : "light"] = t;
    setThemeState(t);
  }, []);

  // Keep the per-scheme memory current as the theme changes.
  useEffect(() => {
    lastByScheme.current[isDarkTheme(theme) ? "dark" : "light"] = theme;
  }, [theme]);

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

  const toggle = useCallback(() => {
    setThemeState((cur) =>
      isDarkTheme(cur) ? lastByScheme.current.light : lastByScheme.current.dark,
    );
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
  var map={dark:'midnight',light:'daylight'};
  var ids=${JSON.stringify(THEME_IDS)};
  var darks=${JSON.stringify(DARK_THEMES)};
  var t=map[s]||(ids.indexOf(s)>=0?s:'${DEFAULT_THEME}');
  var e=document.documentElement;
  e.setAttribute('data-theme',t);
  if(darks.indexOf(t)>=0){e.classList.add('dark');}
}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');document.documentElement.classList.add('dark');}})();
`;
