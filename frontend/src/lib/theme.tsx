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
 * role-based color systems and WCAG 2.2 AA guidance.
 */
export type Theme = "enterprise" | "catppuccin" | "civic-evergreen";

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
const ENTERPRISE: ThemeMeta = {
  id: "enterprise",
  label: "Enterprise",
  description: "Neutral surfaces · clear blue actions",
  swatches: ["#1d2125", "#22272b", "#0c66e4"],
  swatchesLight: ["#f7f8f9", "#ffffff", "#0c66e4"],
};

export const THEMES: ThemeMeta[] = [
  ENTERPRISE,
  {
    id: "catppuccin",
    label: "Catppuccin",
    description: "Mocha at night · Latte in daylight",
    swatches: ["#1e1e2e", "#181825", "#cba6f7"],
    swatchesLight: ["#eff1f5", "#e6e9ef", "#8839ef"],
  },
  {
    id: "civic-evergreen",
    label: "Civic Evergreen",
    description: "Environmental · forest + mint",
    swatches: ["#0b1510", "#14251b", "#86efac"],
    swatchesLight: ["#f4f8f4", "#ffffff", "#166534"],
  },
];

const THEME_IDS = THEMES.map((t) => t.id);

export function themeMeta(id: Theme): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? ENTERPRISE;
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
const DEFAULT_THEME: Theme = "enterprise";
const DEFAULT_MODE: ThemeMode = "dark";

/**
 * Map legacy and disabled theme ids onto the active identities.
 * "command-blue" (now Enterprise) and disabled themes (Field Ops, Indigo, Arctic Cyan, Plum)
 * gracefully migrate to "enterprise".
 */
function migrateTheme(stored: string | null): Theme | null {
  if (isTheme(stored)) return stored;
  switch (stored) {
    case "enterprise":
    case "command-blue":
    case "midnight":
    case "dark":
    case "light":
    case "daylight":
    case "classic":
    case "field-ops":
    case "graphite":
    case "indigo-ai":
    case "indigo":
    case "arctic-cyan":
    case "arctic":
    case "abyss":
    case "plum-signal":
    case "plum":
      return "enterprise";
    case "catppuccin":
      return "catppuccin";
    case "civic-evergreen":
    case "evergreen":
      return "civic-evergreen";
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
  var map={
    enterprise:'enterprise',
    'command-blue':'enterprise',
    midnight:'enterprise',
    dark:'enterprise',
    light:'enterprise',
    daylight:'enterprise',
    classic:'enterprise',
    'field-ops':'enterprise',
    graphite:'enterprise',
    'indigo-ai':'enterprise',
    indigo:'enterprise',
    'arctic-cyan':'enterprise',
    arctic:'enterprise',
    abyss:'enterprise',
    'plum-signal':'enterprise',
    plum:'enterprise',
    catppuccin:'catppuccin',
    'civic-evergreen':'civic-evergreen',
    evergreen:'civic-evergreen'
  };
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
