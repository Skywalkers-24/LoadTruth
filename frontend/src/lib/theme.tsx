"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * LoadTruth theme system.
 *
 * Two independent axes:
 *   • Theme identity (`data-theme` on <html>) — one of six researched palettes,
 *     each a coordinated pair with its own dark AND light variant.
 *   • Mode (`data-mode` + the `.dark` class) — dark or light.
 *
 * Both are set before paint by the inline script to avoid a flash of the wrong
 * theme. Every theme/mode combination defines the same CSS-variable contract in
 * globals.css, so all screens and shadcn components recolor automatically.
 *
 * Semantic colors (verified green, rejected red, informational cyan) and the
 * financial-exposure accent (Signal Violet) are HELD CONSTANT across all six
 * themes — only the mode changes their exact value — so the meaning of a color
 * never shifts when a user picks a different theme. This follows the role-based
 * color approach of Carbon/Fluent/Atlassian and WCAG 2.2 AA guidance.
 */
export type Theme =
  "command-blue" | "field-ops" | "indigo-ai" | "civic-evergreen" | "arctic-cyan" | "plum-signal";

export type ThemeMode = "dark" | "light";

export interface ThemeMeta {
  id: Theme;
  /** Short display name shown in the picker. */
  label: string;
  /** One-line description of the identity / best use. */
  description: string;
  /** Preview swatches [bg, surface, accent] for the picker — dark mode. */
  swatches: [string, string, string];
  /** Preview swatches [bg, surface, accent] for the picker — light mode. */
  swatchesLight: [string, string, string];
}

/** Ordered theme catalog. Order = display order in the picker. */
const COMMAND_BLUE: ThemeMeta = {
  id: "command-blue",
  label: "Command Blue",
  description: "Best overall · professional navy + electric blue",
  swatches: ["#0b1220", "#121d30", "#8ab4ff"],
  swatchesLight: ["#f5f8fc", "#ffffff", "#245eea"],
};

export const THEMES: ThemeMeta[] = [
  COMMAND_BLUE,
  {
    id: "field-ops",
    label: "Field Ops Teal",
    description: "Operational · charcoal + teal",
    swatches: ["#0a1416", "#122426", "#5eead4"],
    swatchesLight: ["#f2f8f7", "#ffffff", "#0f766e"],
  },
  {
    id: "indigo-ai",
    label: "Indigo AI",
    description: "AI-focused · deep indigo + periwinkle",
    swatches: ["#0d1020", "#171d36", "#a5b4fc"],
    swatchesLight: ["#f7f7fc", "#ffffff", "#4338ca"],
  },
  {
    id: "civic-evergreen",
    label: "Civic Evergreen",
    description: "Environmental · forest + mint",
    swatches: ["#0b1510", "#14251b", "#86efac"],
    swatchesLight: ["#f4f8f4", "#ffffff", "#166534"],
  },
  {
    id: "arctic-cyan",
    label: "Arctic Cyan",
    description: "Technical · blue charcoal + sky cyan",
    swatches: ["#0b131a", "#132431", "#7dd3fc"],
    swatchesLight: ["#f3f8fb", "#ffffff", "#0369a1"],
  },
  {
    id: "plum-signal",
    label: "Plum Signal",
    description: "Experimental · plum + magenta",
    swatches: ["#160e1d", "#25182f", "#f0abfc"],
    swatchesLight: ["#fbf6fc", "#ffffff", "#a21caf"],
  },
];

const THEME_IDS = THEMES.map((t) => t.id);

export function themeMeta(id: Theme): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? COMMAND_BLUE;
}

function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEME_IDS as string[]).includes(v);
}

function isMode(v: unknown): v is ThemeMode {
  return v === "dark" || v === "light";
}

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  themes: ThemeMeta[];
  setTheme: (t: Theme) => void;
  setMode: (m: ThemeMode) => void;
  /** Flip dark⇄light (the single-button affordance for the command palette). */
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "loadtruth-theme";
const MODE_KEY = "loadtruth-mode";
const DEFAULT_THEME: Theme = "command-blue";
const DEFAULT_MODE: ThemeMode = "dark";

/**
 * Map legacy theme ids (from every prior iteration) onto the new identities so
 * a returning user keeps a sensible look.
 */
function migrateTheme(stored: string | null): Theme | null {
  if (isTheme(stored)) return stored;
  switch (stored) {
    case "enterprise":
    case "midnight":
    case "dark":
    case "light":
    case "daylight":
    case "classic":
      return "command-blue";
    case "graphite":
      return "field-ops";
    case "abyss":
    case "arctic":
      return "arctic-cyan";
    case "evergreen":
      return "civic-evergreen";
    case "plum":
      return "plum-signal";
    default:
      return null;
  }
}

function initialTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return migrateTheme(window.localStorage.getItem(THEME_KEY)) ?? DEFAULT_THEME;
}

function initialMode(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const stored = window.localStorage.getItem(MODE_KEY);
  return isMode(stored) ? stored : DEFAULT_MODE;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);

  // Align React state with the attributes the inline script already set.
  useEffect(() => {
    setThemeState(initialTheme());
    setModeState(initialMode());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const el = document.documentElement;
    el.setAttribute("data-theme", theme);
    el.setAttribute("data-mode", mode);
    el.style.colorScheme = mode;
    // shadcn components key dark mode off a `.dark` class; mirror it.
    el.classList.toggle("dark", mode === "dark");
    window.localStorage.setItem(THEME_KEY, theme);
    window.localStorage.setItem(MODE_KEY, mode);
    // Briefly ease colors so the switch cross-fades rather than cutting.
    el.setAttribute("data-theme-anim", "");
    const t = window.setTimeout(() => el.removeAttribute("data-theme-anim"), 350);
    return () => window.clearTimeout(t);
  }, [theme, mode, hydrated]);

  const setTheme = useCallback((t: Theme) => {
    if (isTheme(t)) setThemeState(t);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    if (isMode(m)) setModeState(m);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((m) => (m === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, themes: THEMES, setTheme, setMode, toggleMode }),
    [theme, mode, setTheme, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Inline script that sets `data-theme` + `data-mode` (and the `.dark` class)
 * before paint to avoid a flash of the wrong theme. Migrates every prior theme
 * id onto the new identities.
 */
export const themeInitScript = `
(function(){try{
  var tk='${THEME_KEY}',mk='${MODE_KEY}';
  var s=localStorage.getItem(tk);
  var map={enterprise:'command-blue',midnight:'command-blue',dark:'command-blue',light:'command-blue',daylight:'command-blue',classic:'command-blue',graphite:'field-ops',abyss:'arctic-cyan',arctic:'arctic-cyan',evergreen:'civic-evergreen',plum:'plum-signal'};
  var ids=${JSON.stringify(THEME_IDS)};
  var t=(ids.indexOf(s)>=0?s:map[s])||'${DEFAULT_THEME}';
  var m=localStorage.getItem(mk); if(m!=='dark'&&m!=='light'){m='${DEFAULT_MODE}';}
  var e=document.documentElement;
  e.setAttribute('data-theme',t);
  e.setAttribute('data-mode',m);
  e.style.colorScheme=m;
  if(m==='dark'){e.classList.add('dark');}
}catch(e){var el=document.documentElement;el.setAttribute('data-theme','${DEFAULT_THEME}');el.setAttribute('data-mode','${DEFAULT_MODE}');el.classList.add('dark');}})();
`;
