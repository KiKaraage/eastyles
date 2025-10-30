/**
 * Storage schema definitions for Eastyles extension
 * Defines TypeScript interfaces for all data structures stored in browser storage
 */

import { regex } from "arkregex";
import { Asset, DomainRule, VariableDescriptor } from "../usercss/types";

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
 * Individual user style definition (legacy)
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
 * UserCSS style record with full metadata support
 */
export interface UserCSSStyle {
  /** Unique identifier for the style */
  id: string;
  /** Human-readable name of the style */
  name: string;
  /** Namespace for the style (helps avoid conflicts) */
  namespace: string;
  /** Version of the style */
  version: string;
  /** Description of what the style does */
  description: string;
  /** Author of the style */
  author: string;
  /** URL where the style can be found or updated */
  sourceUrl: string;
  /** Domain matching rules */
  domains: DomainRule[];
  /** Original @-moz-document condition string for display */
  originalDomainCondition?: string;
  /** Compiled CSS ready for injection */
  compiledCss: string;
  /** User-configurable variables with their current values */
  variables: Record<string, VariableDescriptor>;
  /** Original default values captured at install time for reset functionality */
  originalDefaults: Record<string, string>;
  /** Additional assets (fonts, images, etc.) */
  assets: Asset[];
  /** Timestamp when style was installed */
  installedAt: number;
  /** Whether the style is currently enabled */
  enabled: boolean;
  /** Original source code of the UserCSS */
  source: string;
}

/**
 * Complete export data structure for backup/restore functionality
 */
export interface ExportData {
  /** User settings */
  settings: SettingsStorage;
  /** Array of legacy user styles */
  styles: UserStyle[];
  /** Array of UserCSS styles */
  userCSSStyles: UserCSSStyle[];
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
  USERCSS_STYLES: "local:eastyles:usercss:styles",
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
 * Type guard to check if an object is a valid UserCSSStyle
 */
export function isUserCSSStyle(obj: unknown): obj is UserCSSStyle {
  if (!obj || typeof obj !== "object") return false;

  const style = obj as Record<string, unknown>;

  return (
    typeof style.id === "string" &&
    typeof style.name === "string" &&
    typeof style.namespace === "string" &&
    typeof style.version === "string" &&
    typeof style.description === "string" &&
    typeof style.author === "string" &&
    typeof style.sourceUrl === "string" &&
    Array.isArray(style.domains) &&
    style.domains.every((rule) => typeof rule === "object" && rule !== null) &&
    typeof style.compiledCss === "string" &&
    typeof style.variables === "object" &&
    style.variables !== null &&
    typeof style.originalDefaults === "object" &&
    style.originalDefaults !== null &&
    Array.isArray(style.assets) &&
    typeof style.installedAt === "number" &&
    typeof style.enabled === "boolean" &&
    typeof style.source === "string"
  );
}

/**
 * Type guard to check if an object is a valid ExportData
 */
export function isExportData(obj: unknown): obj is ExportData {
  if (!obj || typeof obj !== "object") return false;

  const exportData = obj as Record<string, unknown>;

  return (
    isSettingsStorage(exportData.settings) &&
    Array.isArray(exportData.styles) &&
    exportData.styles.every((style) => isUserStyle(style)) &&
    Array.isArray(exportData.userCSSStyles) &&
    exportData.userCSSStyles.every((style) => isUserCSSStyle(style)) &&
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

  if (data.version && !regex("^\\d+\\.\\d+\\.\\d+$").test(data.version)) {
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
 * Validates UserCSS style data
 */
export function validateUserCSSStyle(data: unknown): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [] };

  if (!isUserCSSStyle(data)) {
    result.isValid = false;
    result.errors.push("Invalid UserCSS style format");
    return result;
  }

  // Additional validation rules
  if (!data.id.trim()) {
    result.errors.push("Style ID cannot be empty");
  }

  if (!data.name.trim()) {
    result.errors.push("Style name cannot be empty");
  }

  if (!data.namespace.trim()) {
    result.errors.push("Style namespace cannot be empty");
  }

  if (!data.version.trim()) {
    result.errors.push("Style version cannot be empty");
  }

  if (!data.author.trim()) {
    result.errors.push("Style author cannot be empty");
  }

  if (data.installedAt > Date.now()) {
    result.errors.push("installedAt cannot be in the future");
  }

  // Validate domains
  data.domains.forEach((rule, index) => {
    if (!rule.kind || !rule.pattern) {
      result.errors.push(`Domain rule at index ${index} is invalid`);
    }
  });

  // Validate originalDefaults
  if (
    typeof data.originalDefaults !== "object" ||
    data.originalDefaults === null
  ) {
    result.errors.push("originalDefaults must be an object");
  } else {
    for (const [key, value] of Object.entries(data.originalDefaults)) {
      if (typeof key !== "string" || typeof value !== "string") {
        result.errors.push(
          `originalDefaults entry "${key}" must have string key and value`,
        );
      }
    }
  }

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

  // Validate nested legacy styles
  data.styles.forEach((style, index) => {
    const styleValidation = validateUserStyle(style);
    if (!styleValidation.isValid) {
      result.errors.push(
        ...styleValidation.errors.map(
          (error) => `Legacy Style ${index}: ${error}`,
        ),
      );
    }
  });

  // Validate nested UserCSS styles
  data.userCSSStyles.forEach((style, index) => {
    const styleValidation = validateUserCSSStyle(style);
    if (!styleValidation.isValid) {
      result.errors.push(
        ...styleValidation.errors.map(
          (error) => `UserCSS Style ${index}: ${error}`,
        ),
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
 * Extract original default values from variables
 */
function extractOriginalDefaults(
  variables: Record<string, VariableDescriptor>,
): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const [varName, varDescriptor] of Object.entries(variables)) {
    defaults[varName] = varDescriptor.default;
  }
  return defaults;
}

/**
 * Creates a new UserCSSStyle with sensible defaults
 */
export function createUserCSSStyle(
  partial: Partial<UserCSSStyle> & Pick<UserCSSStyle, "name" | "source">,
): UserCSSStyle {
  const now = Date.now();
  const variables = partial.variables || {};

  return {
    id:
      partial.id || `usercss_${now}_${Math.random().toString(36).substr(2, 9)}`,
    name: partial.name,
    namespace: partial.namespace || "user",
    version: partial.version || "1.0.0",
    description: partial.description || "",
    author: partial.author || "Unknown",
    sourceUrl: partial.sourceUrl || "",
    domains: partial.domains || [],
    compiledCss: partial.compiledCss || "",
    variables,
    originalDefaults:
      partial.originalDefaults || extractOriginalDefaults(variables),
    assets: partial.assets || [],
    installedAt: partial.installedAt || now,
    enabled: partial.enabled ?? true,
    source: partial.source,
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
