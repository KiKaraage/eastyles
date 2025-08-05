/**
 * Hook for managing theme preferences in Eastyles extension
 * Provides reactive access to theme settings and applies them to the UI
 */

import { useState, useEffect, useCallback } from "react";
import { storageClient } from "../services/storage/client";

/**
 * Theme modes supported by the extension
 */
export type ThemeMode = "light" | "dark" | "system";

/**
 * Theme hook return interface
 */
export interface UseThemeReturn {
  /** Current theme mode */
  themeMode: ThemeMode;
  /** Current effective theme (considering system preference) */
  effectiveTheme: "light" | "dark";
  /** Whether the theme is currently dark */
  isDark: boolean;
  /** Whether the theme is currently light */
  isLight: boolean;
  /** Update theme mode */
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  /** Switch to light mode */
  setLightMode: () => Promise<void>;
  /** Switch to dark mode */
  setDarkMode: () => Promise<void>;
  /** Switch to system preference */
  setSystemMode: () => Promise<void>;
  /** Toggle between light and dark */
  toggleTheme: () => Promise<void>;
  /** Get system preference */
  getSystemTheme: () => "light" | "dark";
}

/**
 * Hook for managing theme state and preferences
 */
export function useTheme(): UseThemeReturn {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(
    "light",
  );
  const [isDark, setIsDark] = useState(false);
  const [isLight, setIsLight] = useState(true);

  // Get system preference from the browser
  const getSystemTheme = useCallback((): "light" | "dark" => {
    if (typeof window !== "undefined" && "matchMedia" in window) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light"; // Default to light if browser API not available
  }, []);

  // Apply theme to the document
  const applyTheme = useCallback((theme: "light" | "dark") => {
    console.log("[useTheme] applyTheme called with theme:", theme);
    if (typeof document !== "undefined") {
      // DaisyUI automatically handles theme switching based on data-theme attribute
      const daisyTheme = theme === "light" ? "silk" : "sunset";
      document.documentElement.setAttribute("data-theme", daisyTheme);
      console.log("[useTheme] Set data-theme attribute to:", daisyTheme);

      // Also set the class on the document element for DaisyUI
      document.documentElement.className = daisyTheme;
      console.log("[useTheme] Set className to:", daisyTheme);

      // Update state
      setIsDark(theme === "dark");
      setIsLight(theme === "light");
      setEffectiveTheme(theme);
      console.log(
        "[useTheme] Updated state - isDark:",
        theme === "dark",
        "isLight:",
        theme === "light",
      );

      // Force a re-render by dispatching a custom event
      window.dispatchEvent(
        new CustomEvent("theme-changed", { detail: { theme } }),
      );
      console.log("[useTheme] Dispatched theme-changed event");
    } else {
      console.log("[useTheme] document is not defined");
    }
  }, []);

  // Update theme based on mode and system preference
  const updateTheme = useCallback(
    (mode: ThemeMode) => {
      console.log("[useTheme] updateTheme called with mode:", mode);
      setThemeModeState(mode);

      if (mode === "system") {
        const systemTheme = getSystemTheme();
        console.log("[useTheme] System theme detected:", systemTheme);
        applyTheme(systemTheme);
      } else {
        console.log("[useTheme] Applying manual theme:", mode);
        applyTheme(mode);
      }
    },
    [applyTheme, getSystemTheme],
  );

  // Load initial theme from storage
  const loadTheme = useCallback(async () => {
    try {
      const storedMode = await storageClient.getThemeMode();
      console.log("[useTheme] loadTheme: retrieved stored mode", storedMode);
      updateTheme(storedMode);
    } catch (error) {
      console.warn("Failed to load theme from storage, using defaults:", error);
      updateTheme("system");
    }
  }, [updateTheme]);

  // Save theme to storage
  const saveTheme = async (mode: ThemeMode) => {
    try {
      await storageClient.setThemeMode(mode);
      setThemeModeState(mode);
    } catch (error) {
      console.error("Failed to save theme to storage:", error);
      throw new Error(`Failed to save theme preference: ${error}`);
    }
  };

  // Watch for system preference changes
  useEffect(() => {
    loadTheme();

    if (themeMode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        // Only apply system theme changes if we're in system mode
        applyTheme(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleChange);

      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [loadTheme, themeMode, applyTheme]);

  // Theme update functions
  const setThemeModeHandler = async (mode: ThemeMode) => {
    console.log("[useTheme] setThemeModeHandler: saving mode", mode);
    await saveTheme(mode);
    console.log(
      "[useTheme] setThemeModeHandler: calling updateTheme with mode",
      mode,
    );
    updateTheme(mode);
    console.log("[useTheme] setThemeModeHandler: completed");
  };

  const setLightModeHandler = async () => {
    await setThemeModeHandler("light");
  };

  const setDarkModeHandler = async () => {
    await setThemeModeHandler("dark");
  };

  const setSystemModeHandler = async () => {
    await setThemeModeHandler("system");
  };

  const toggleThemeHandler = async () => {
    let nextMode: ThemeMode;
    if (themeMode === "light") {
      nextMode = "dark";
    } else if (themeMode === "dark") {
      nextMode = "system";
    } else {
      nextMode = "light";
    }

    console.log(
      "[useTheme] toggleTheme: switching from",
      themeMode,
      "to",
      nextMode,
    );
    await setThemeModeHandler(nextMode);
    console.log("[useTheme] toggleTheme: completed, new mode is", nextMode);
  };

  return {
    themeMode,
    effectiveTheme,
    isDark,
    isLight,
    setThemeMode: setThemeModeHandler,
    setLightMode: setLightModeHandler,
    setDarkMode: setDarkModeHandler,
    setSystemMode: setSystemModeHandler,
    toggleTheme: toggleThemeHandler,
    getSystemTheme,
  };
}

/**
 * Hook for theme analytics and monitoring
 */
export function useThemeAnalytics() {
  const [usageCount, setUsageCount] = useState(0);
  const [lastUsed, setLastUsed] = useState<Date | null>(null);

  const incrementUsage = () => {
    setUsageCount((prev) => prev + 1);
    setLastUsed(new Date());
  };

  const getUsageStats = () => ({
    totalChanges: usageCount,
    lastUsed,
    averageUsagePerDay:
      usageCount /
      (Date.now() - (lastUsed?.getTime() || Date.now())) /
      (1000 * 60 * 60 * 24),
  });

  return {
    incrementUsage,
    getUsageStats,
    usageCount,
    lastUsed,
  };
}
