/**
 * Storage defaults and fallbacks for Eastyles extension
 * Provides default values and fallback mechanisms for all storage items
 */

import {
  DEFAULT_SETTINGS,
  ExportData,
  SettingsStorage,
  UserStyle,
} from "./schema";

/**
 * Default settings with sensible fallbacks
 */
export const STORAGE_DEFAULTS = {
  settings: DEFAULT_SETTINGS,
  styles: [] as UserStyle[],
} as const;

/**
 * Extension metadata defaults
 */
export const EXTENSION_METADATA = {
  name: "Eastyles",
  version: "1.0.0",
  exportVersion: "1.0.0",
  minSupportedVersion: "1.0.0",
} as const;

/**
 * Storage quota and limits
 */
export const STORAGE_LIMITS = {
  maxStyles: 1000,
  maxStyleNameLength: 100,
  maxStyleCodeLength: 100000, // 100KB of CSS code
  maxDomainsPerStyle: 50,
  maxExportSizeMB: 10,
} as const;

/**
 * Fallback mechanisms for corrupted or missing data
 */
export class StorageFallbacks {
  /**
   * Get fallback settings when stored settings are invalid
   */
  static getSettingsFallback(corruptedSettings?: unknown): SettingsStorage {
    const fallback = { ...DEFAULT_SETTINGS };

    // Try to preserve some values from corrupted settings if they exist and are valid
    if (corruptedSettings && typeof corruptedSettings === "object") {
      const corrupted = corruptedSettings as Record<string, unknown>;

      // Preserve version if it's a string
      if (typeof corrupted.version === "string") {
        fallback.version = corrupted.version;
      }

      // Preserve lastUsed if it's a reasonable number
      if (
        typeof corrupted.lastUsed === "number" &&
        corrupted.lastUsed > 0 &&
        corrupted.lastUsed <= Date.now()
      ) {
        fallback.lastUsed = corrupted.lastUsed;
      }

      // Preserve debug mode if it's a boolean
      if (typeof corrupted.isDebuggingEnabled === "boolean") {
        fallback.isDebuggingEnabled = corrupted.isDebuggingEnabled;
      }

      // Preserve theme mode if it's valid
      if (
        typeof corrupted.themeMode === "string" &&
        ["light", "dark", "system"].includes(corrupted.themeMode)
      ) {
        fallback.themeMode = corrupted.themeMode as "light" | "dark" | "system";
      }
    }

    return fallback;
  }

  /**
   * Get fallback styles array when stored styles are invalid
   */
  static getStylesFallback(corruptedStyles?: unknown): UserStyle[] {
    if (!Array.isArray(corruptedStyles)) {
      return [];
    }

    // Try to recover valid styles from the corrupted array
    const recoveredStyles: UserStyle[] = [];

    for (const item of corruptedStyles) {
      if (this.isRecoverableStyle(item)) {
        const recovered = this.recoverStyle(item);
        if (recovered) {
          recoveredStyles.push(recovered);
        }
      }
    }

    return recoveredStyles;
  }

  /**
   * Check if a style object can be recovered
   */
  private static isRecoverableStyle(item: unknown): boolean {
    if (!item || typeof item !== "object") return false;

    const style = item as Record<string, unknown>;

    // Must have essential fields
    return (
      typeof style.id === "string" &&
      typeof style.name === "string" &&
      typeof style.code === "string"
    );
  }

  /**
   * Attempt to recover a corrupted style object
   */
  private static recoverStyle(
    corruptedStyle: Record<string, unknown>,
  ): UserStyle | null {
    try {
      const now = Date.now();

      // Build recovered style with fallbacks
      const recovered: UserStyle = {
        id: String(corruptedStyle.id),
        name: String(corruptedStyle.name),
        code: String(corruptedStyle.code),
        enabled:
          typeof corruptedStyle.enabled === "boolean"
            ? corruptedStyle.enabled
            : true,
        domains: Array.isArray(corruptedStyle.domains)
          ? corruptedStyle.domains
              .filter((d) => typeof d === "string")
              .slice(0, STORAGE_LIMITS.maxDomainsPerStyle)
          : [],
        createdAt:
          typeof corruptedStyle.createdAt === "number" &&
          corruptedStyle.createdAt > 0
            ? corruptedStyle.createdAt
            : now,
        updatedAt:
          typeof corruptedStyle.updatedAt === "number" &&
          corruptedStyle.updatedAt > 0
            ? corruptedStyle.updatedAt
            : now,
        description:
          typeof corruptedStyle.description === "string"
            ? corruptedStyle.description
            : undefined,
        version:
          typeof corruptedStyle.version === "number"
            ? corruptedStyle.version
            : 1,
      };

      // Validate recovered style meets basic requirements
      if (recovered.name.length > STORAGE_LIMITS.maxStyleNameLength) {
        recovered.name = recovered.name.substring(
          0,
          STORAGE_LIMITS.maxStyleNameLength,
        );
      }

      if (recovered.code.length > STORAGE_LIMITS.maxStyleCodeLength) {
        // Truncate but try to keep valid CSS
        recovered.code = recovered.code.substring(
          0,
          STORAGE_LIMITS.maxStyleCodeLength,
        );
      }

      return recovered;
    } catch (error) {
      console.warn("[ea-Storage] Failed to recover corrupted style:", error);
      return null;
    }
  }

  /**
   * Get fallback export data structure
   */
  static getExportDataFallback(): ExportData {
    return {
      settings: DEFAULT_SETTINGS,
      styles: [],
      userCSSStyles: [],
      timestamp: Date.now(),
      version: EXTENSION_METADATA.version,
      exportVersion: EXTENSION_METADATA.exportVersion,
    };
  }

  /**
   * Validate and clean up storage data on startup
   */
  static async performStorageHealthCheck(
    getStoredData: () => Promise<{ settings?: unknown; styles?: unknown }>,
  ): Promise<{
    settings: SettingsStorage;
    styles: UserStyle[];
    hadCorruption: boolean;
  }> {
    let hadCorruption = false;

    try {
      const stored = await getStoredData();

      // Check and recover settings
      let settings: SettingsStorage;
      if (!stored.settings) {
        settings = DEFAULT_SETTINGS;
      } else {
        // Check if settings are valid by attempting to validate them
        const isValidSettings =
          stored.settings &&
          typeof stored.settings === "object" &&
          "lastUsed" in stored.settings &&
          typeof (stored.settings as { lastUsed?: unknown }).lastUsed ===
            "number" &&
          "version" in stored.settings &&
          typeof (stored.settings as { version?: unknown }).version ===
            "string";

        if (isValidSettings) {
          settings = stored.settings as SettingsStorage;
        } else {
          console.warn(
            "[ea-Storage] Settings corruption detected, using fallback",
          );
          settings = this.getSettingsFallback(stored.settings);
          hadCorruption = true;
        }
      }

      // Check and recover styles
      let styles: UserStyle[];
      if (!stored.styles) {
        styles = [];
      } else {
        // Check if styles is a valid array
        if (Array.isArray(stored.styles)) {
          styles = stored.styles as UserStyle[];
        } else {
          console.warn(
            "[ea-Storage] Styles corruption detected, attempting recovery",
          );
          styles = this.getStylesFallback(stored.styles);
          hadCorruption = true;
        }
      }

      return { settings, styles, hadCorruption };
    } catch (error) {
      console.error(
        "[ea-Storage] Storage health check failed, using complete fallback:",
        error,
      );
      return {
        settings: DEFAULT_SETTINGS,
        styles: [],
        hadCorruption: true,
      };
    }
  }
}

/**
 * Storage migration utilities for handling version upgrades
 */
export class StorageMigrations {
  /**
   * Check if migration is needed based on stored version
   */
  static needsMigration(
    storedVersion: string,
    currentVersion: string,
  ): boolean {
    // Simple version comparison (assuming semantic versioning)
    const stored = storedVersion.split(".").map(Number);
    const current = currentVersion.split(".").map(Number);

    for (let i = 0; i < Math.max(stored.length, current.length); i++) {
      const s = stored[i] || 0;
      const c = current[i] || 0;

      if (s < c) return true;
      if (s > c) return false;
    }

    return false;
  }

  /**
   * Perform migration from one version to another
   */
  static async migrateData(
    data: { settings: SettingsStorage; styles: UserStyle[] },
    fromVersion: string,
    toVersion: string,
  ): Promise<{ settings: SettingsStorage; styles: UserStyle[] }> {
    // For now, just update the version in settings
    // Future migrations can be added here as needed
    const migratedData = {
      settings: {
        ...data.settings,
        version: toVersion,
        lastUsed: Date.now(),
      },
      styles: data.styles,
    };

    console.log(
      `[ea-Storage] Migrated storage from v${fromVersion} to v${toVersion}`,
    );
    return migratedData;
  }
}

/**
 * Utility functions for working with defaults
 */
export const StorageDefaults = {
  /**
   * Create a new user style with defaults
   */
  createDefaultStyle(
    overrides: Partial<UserStyle> = {},
  ): Omit<UserStyle, "id"> {
    const now = Date.now();

    return {
      name: "New Style",
      code: "/* Add your CSS here */\n",
      enabled: true,
      domains: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      ...overrides,
    };
  },

  /**
   * Get default theme based on system preference
   */
  getSystemTheme(): "light" | "dark" {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light"; // Default fallback
  },

  /**
   * Check if storage is approaching limits
   */
  checkStorageLimits(styles: UserStyle[]): {
    nearLimit: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let nearLimit = false;

    // Check style count
    if (styles.length > STORAGE_LIMITS.maxStyles * 0.9) {
      warnings.push(
        `Approaching maximum number of styles (${styles.length}/${STORAGE_LIMITS.maxStyles})`,
      );
      nearLimit = true;
    }

    // Check individual style sizes
    const oversizedStyles = styles.filter(
      (style) => style.code.length > STORAGE_LIMITS.maxStyleCodeLength * 0.9,
    );

    if (oversizedStyles.length > 0) {
      warnings.push(
        `${oversizedStyles.length} styles are approaching size limit`,
      );
      nearLimit = true;
    }

    return { nearLimit, warnings };
  },
} as const;
