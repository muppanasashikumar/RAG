"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "rag-theme";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  // Keep initial server/client render deterministic to avoid hydration mismatches.
  const [theme, setTheme] = useState<Theme>("light");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme: Theme =
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : prefersDarkMode
          ? "dark"
          : "light";

    setTheme(initialTheme);
    applyTheme(initialTheme);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isHydrated, theme]);

  const setActiveTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setActiveTheme(theme === "dark" ? "light" : "dark");
  }, [setActiveTheme, theme]);

  return {
    theme,
    setTheme: setActiveTheme,
    toggleTheme,
  };
}
