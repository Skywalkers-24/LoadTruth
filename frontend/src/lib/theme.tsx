"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "loadtruth-theme";

/** Reads the persisted theme, else defaults to the dark operator theme. */
function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return "dark"; // dark-first operator console; users can opt into light
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Sync from storage/OS after mount (the inline script already set the attribute
  // to avoid a flash; this aligns React state with it).
  useEffect(() => {
    setThemeState(initialTheme());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Inline script that sets data-theme before paint to avoid a flash of wrong theme. */
export const themeInitScript = `
(function(){try{
  var k='${STORAGE_KEY}';var s=localStorage.getItem(k);
  var t=(s==='dark'||s==='light')?s:'dark';
  document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();
`;
