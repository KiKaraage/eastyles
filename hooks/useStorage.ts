/**
 * Hook for reactive access to extension storage
 * Provides real-time updates when storage values change
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { storageClient } from "../services/storage/client";
import { SettingsStorage } from "../services/storage/schema";

/**
 * Storage hook return interface
 */
export interface UseStorageReturn<T> {
  /** Current stored value */
  data: T | null;
  /** Whether the data is loading */
  isLoading: boolean;
  /** Whether an error occurred */
  error: Error | null;
  /** Update the stored value */
  setData: (value: T) => Promise<void>;
  /** Refresh the data from storage */
  refresh: () => Promise<void>;
  /** Reset to default value */
  reset: () => Promise<void>;
  /** Whether the data has been modified */
  isDirty: boolean;
}

/**
 * Hook for reactive storage access
 */
export function useStorage<T>(
  key: string,
  defaultValue: T,
): UseStorageReturn<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const previousDataRef = useRef<T | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const storedData = await storageClient.getSettings();
      const value = (storedData as any)[key] ?? defaultValue;
      previousDataRef.current = value;
      setDataState(value);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setDataState(defaultValue);
    } finally {
      setIsLoading(false);
    }
  }, [key, defaultValue]);

  // Update stored data
  const setData = useCallback(async (value: T) => {
    try {
      const currentSettings = await storageClient.getSettings();
      const updatedSettings = {
        ...currentSettings,
        [key]: value,
      };

      await storageClient.updateSettings(updatedSettings);
      previousDataRef.current = value;
      setDataState(value);
      setIsDirty(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [key]);

  // Refresh data from storage
  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // Reset to default value
  const reset = useCallback(async () => {
    try {
      const currentSettings = await storageClient.getSettings();
      const updatedSettings = {
        ...currentSettings,
        [key]: defaultValue,
      };

      await storageClient.updateSettings(updatedSettings);
      previousDataRef.current = defaultValue;
      setDataState(defaultValue);
      setIsDirty(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [key, defaultValue]);

  // Check if data has changed
  useEffect(() => {
    if (previousDataRef.current && data) {
      const hasChanged = JSON.stringify(previousDataRef.current) !== JSON.stringify(data);
      setIsDirty(hasChanged);
    }
  }, [data]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    isLoading,
    error,
    setData,
    refresh,
    reset,
    isDirty,
  };
}

/**
 * Hook specifically for theme mode storage
 */
export function useThemeMode() {
  const { data: themeMode, setData: setThemeMode, ...rest } = useStorage(
    "themeMode",
    "system" as "light" | "dark" | "system",
  );

  return {
    themeMode: themeMode || "system",
    setThemeMode,
    ...rest,
  };
}

/**
 * Hook specifically for debug mode storage
 */
export function useDebugMode() {
  const { data: debugMode, setData: setDebugMode, ...rest } = useStorage(
    "isDebuggingEnabled",
    false,
  );

  return {
    debugMode: debugMode ?? false,
    setDebugMode,
    ...rest,
  };
}

/**
 * Hook specifically for settings storage
 */
export function useSettings() {
  const [settings, setSettingsState] = useState<SettingsStorage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load settings
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const settingsData = await storageClient.getSettings();
      setSettingsState(settingsData);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setSettingsState(storageClient.getSettings() as any);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update settings
  const updateSettings = useCallback(async (updates: Partial<SettingsStorage>) => {
    try {
      await storageClient.updateSettings(updates);
      if (settings) {
        setSettingsState({ ...settings, ...updates });
      } else {
        await loadSettings();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [settings, loadSettings]);

  // Reset settings
  const resetSettings = useCallback(async () => {
    try {
      await storageClient.resetSettings();
      await loadSettings();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  }, [loadSettings]);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Watch for settings changes
  useEffect(() => {
    const unsubscribe = storageClient.watchSettings((newSettings) => {
      setSettingsState(newSettings);
    });

    return unsubscribe;
  }, []);

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    resetSettings,
    refresh: loadSettings,
  };
}

/**
 * Hook for watching storage changes
 */
export function useStorageWatcher<T>(
  key: string,
  callback: (newValue: T, oldValue?: T) => void,
) {
  useEffect(() => {
    const unsubscribe = storageClient.watchSettings((newSettings, oldSettings) => {
      const newValue = (newSettings as any)[key];
      const oldValue = oldSettings ? (oldSettings as any)[key] : undefined;
      callback(newValue, oldValue);
    });

    return unsubscribe;
  }, [key, callback]);
}
