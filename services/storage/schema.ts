/**
 * Storage schema definitions for Eastyles extension
 * Defines TypeScript interfaces for all data structures stored in browser storage
 */

/**
 * Core settings stored in extension storage
 */
export interface SettingsStorage {
  /** Timestamp of last extension usage */
  lastUsed: number;
  /** Extension version string */
  version: string;
  /** Toggle for verbose logging and debug mode */
  isDebuggingEnabled?: boolean;
  /** User's preferred theme mode: 'light', 'dark', or 'system' */
  themeMode?: "light" | "dark" | "system";
}

/**
 * Individual user style definition
 */
export interface UserStyle {
  /** Unique identifier for the style */
  id: string;
  /** User-friendly name for the style */
  name: string;
  /** CSS code content */
  code: string;
  /** Whether the style is currently active */
  enabled: boolean;
  /** List of domains where this style applies */
  domains: string[];
  /** Timestamp when style was created */
  createdAt: number;
  /** Timestamp when style was last modified */
  updatedAt: number;
  /** Optional description of what the style does */
  description?: string;
  /** Version of the style for conflict resolution */
  version?: number;
}

/**
 * Complete export data structure for backup/restore functionality
 */
export interface ExportData {
  /** User settings */
  settings: SettingsStorage;
  /** Array of user styles */
  styles: UserStyle[];
  /** Timestamp when export was created */
  timestamp: number;
  /** Extension version that created this export */
  version: string;
  /** Format version for migration handling */
  exportVersion: string;
}

/**
 * Default values for settings storage
 */
export const DEFAULT_SETTINGS: SettingsStorage = {
  lastUsed: Date.now(),
  version: "1.0.0",
  isDebuggingEnabled: false,
  themeMode: "system",
};

/**
 * Storage keys used throughout the application
 */
export const STORAGE_KEYS = {
  SETTINGS: "local:eastyles:settings",
  STYLES: "local:eastyles:styles",
  STYLE_PREFIX: "local:eastyles:style:",
} as const;

/**
 * Type guard to check if an object is a valid SettingsStorage
 */
export function isSettingsStorage(obj: unknown): obj is SettingsStorage {
  if (!obj || typeof obj !== "object") return false;

  const settings = obj as Record<string, unknown>;

  return (
    typeof settings.lastUsed === "number" &&
    typeof settings.version === "string" &&
    (settings.isDebuggingEnabled === undefined ||
      typeof settings.isDebuggingEnabled === "boolean") &&
    (settings.themeMode === undefined ||
      ["light", "dark", "system"].includes(settings.themeMode as string))
  );
}

/**
 * Type guard to check if an object is a valid UserStyle
 */
export function isUserStyle(obj: unknown): obj is UserStyle {
  if (!obj || typeof obj !== "object") return false;

  const style = obj as Record<string, unknown>;

  return (
    typeof style.id === "string" &&
    typeof style.name === "string" &&
    typeof style.code === "string" &&
    typeof style.enabled === "boolean" &&
    Array.isArray(style.domains) &&
    style.domains.every((domain) => typeof domain === "string") &&
    typeof style.createdAt === "number" &&
    typeof style.updatedAt === "number" &&
    (style.description === undefined ||
      typeof style.description === "string") &&
    (style.version === undefined || typeof style.version === "number")
  );
}

/**
 * Type guard to check if an object is valid ExportData
 */
export function isExportData(obj: unknown): obj is ExportData {
  if (!obj || typeof obj !== "object") return false;

  const exportData = obj as Record<string, unknown>;

  return (
    isSettingsStorage(exportData.settings) &&
    Array.isArray(exportData.styles) &&
    exportData.styles.every((style) => isUserStyle(style)) &&
    typeof exportData.timestamp === "number" &&
    typeof exportData.version === "string" &&
    typeof exportData.exportVersion === "string"
  );
}

/**
 * Validation result for storage operations
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates settings storage data
 */
export function validateSettings(data: unknown): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [] };

  if (!isSettingsStorage(data)) {
    result.isValid = false;
    result.errors.push("Invalid settings storage format");
    return result;
  }

  // Additional validation rules
  if (data.lastUsed > Date.now()) {
    result.errors.push("lastUsed cannot be in the future");
  }

  if (data.version && !/^\d+\.\d+\.\d+/.test(data.version)) {
    result.errors.push("version must follow semantic versioning format");
  }

  if (result.errors.length > 0) {
    result.isValid = false;
  }

  return result;
}

/**
 * Validates user style data
 */
export function validateUserStyle(data: unknown): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [] };

  if (!isUserStyle(data)) {
    result.isValid = false;
    result.errors.push("Invalid user style format");
    return result;
  }

  // Additional validation rules
  if (!data.id.trim()) {
    result.errors.push("Style ID cannot be empty");
  }

  if (!data.name.trim()) {
    result.errors.push("Style name cannot be empty");
  }

  if (data.createdAt > Date.now()) {
    result.errors.push("createdAt cannot be in the future");
  }

  if (data.updatedAt > Date.now()) {
    result.errors.push("updatedAt cannot be in the future");
  }

  if (data.createdAt > data.updatedAt) {
    result.errors.push("createdAt cannot be after updatedAt");
  }

  // Validate domains
  data.domains.forEach((domain, index) => {
    if (!domain.trim()) {
      result.errors.push(`Domain at index ${index} cannot be empty`);
    }
  });

  if (result.errors.length > 0) {
    result.isValid = false;
  }

  return result;
}

/**
 * Validates export data
 */
export function validateExportData(data: unknown): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [] };

  if (!isExportData(data)) {
    result.isValid = false;
    result.errors.push("Invalid export data format");
    return result;
  }

  // Validate nested settings
  const settingsValidation = validateSettings(data.settings);
  if (!settingsValidation.isValid) {
    result.errors.push(
      ...settingsValidation.errors.map((error) => `Settings: ${error}`),
    );
  }

  // Validate nested styles
  data.styles.forEach((style, index) => {
    const styleValidation = validateUserStyle(style);
    if (!styleValidation.isValid) {
      result.errors.push(
        ...styleValidation.errors.map((error) => `Style ${index}: ${error}`),
      );
    }
  });

  if (result.errors.length > 0) {
    result.isValid = false;
  }

  return result;
}

/**
 * Creates a new UserStyle with sensible defaults
 */
export function createUserStyle(
  partial: Partial<UserStyle> & Pick<UserStyle, "name" | "code">,
): UserStyle {
  const now = Date.now();

  return {
    id: partial.id || `style_${now}_${Math.random().toString(36).substr(2, 9)}`,
    name: partial.name,
    code: partial.code,
    enabled: partial.enabled ?? true,
    domains: partial.domains || [],
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
    description: partial.description,
    version: partial.version || 1,
  };
}

/**
 * Merges partial settings with defaults
 */
export function mergeSettings(
  partial: Partial<SettingsStorage>,
): SettingsStorage {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    lastUsed: Date.now(), // Always update lastUsed
  };
}
