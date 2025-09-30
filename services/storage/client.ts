/**
 * Storage client wrapper for Eastyles extension
 * Provides a type-safe interface to the @wxt-dev/storage API
 */

import { storage } from "@wxt-dev/storage";
import {
  SettingsStorage,
  UserStyle,
  UserCSSStyle,
  ExportData,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  validateSettings,
  validateUserStyle,
  validateUserCSSStyle,
  validateExportData,
  mergeSettings,
  createUserStyle,
  createUserCSSStyle,
} from "./schema";

/**
 * Storage client interface for managing extension data
 */
export interface StorageClient {
  // Settings management
  getSettings(): Promise<SettingsStorage>;
  updateSettings(settings: Partial<SettingsStorage>): Promise<void>;
  resetSettings(): Promise<void>;

  // Theme management
  getThemeMode(): Promise<"light" | "dark" | "system">;
  setThemeMode(mode: "light" | "dark" | "system"): Promise<void>;

  // Debug mode management
  getDebugMode(): Promise<boolean>;
  setDebugMode(enabled: boolean): Promise<void>;

  // User styles management (prepared for future use)
  getStyles(): Promise<UserStyle[]>;
  getStyle(id: string): Promise<UserStyle | null>;
  addStyle(
    style: Partial<UserStyle> & Pick<UserStyle, "name" | "code">,
  ): Promise<UserStyle>;
  updateStyle(id: string, updates: Partial<UserStyle>): Promise<UserStyle>;
  removeStyle(id: string): Promise<void>;
  enableStyle(id: string, enabled: boolean): Promise<void>;

  // UserCSS styles management
  getUserCSSStyles(): Promise<UserCSSStyle[]>;
  getUserCSSStyle(id: string): Promise<UserCSSStyle | null>;
  addUserCSSStyle(
    style: Partial<UserCSSStyle> & Pick<UserCSSStyle, "name" | "source">,
  ): Promise<UserCSSStyle>;
  updateUserCSSStyle(id: string, updates: Partial<UserCSSStyle>): Promise<UserCSSStyle>;
  removeUserCSSStyle(id: string): Promise<void>;
  enableUserCSSStyle(id: string, enabled: boolean): Promise<void>;
  updateUserCSSStyleVariables(id: string, variables: Record<string, unknown>): Promise<UserCSSStyle>;

  // Batch operations
  getMultipleStyles(ids: string[]): Promise<UserStyle[]>;
  updateMultipleStyles(
    updates: Array<{ id: string; updates: Partial<UserStyle> }>,
  ): Promise<void>;

  // Import/Export functionality
  exportAll(): Promise<ExportData>;
  importAll(data: ExportData, options?: { overwrite?: boolean }): Promise<void>;
  resetAll(): Promise<void>;

  // Storage watchers
  watchSettings(
    callback: (
      newSettings: SettingsStorage,
      oldSettings?: SettingsStorage,
    ) => void,
  ): () => void;
  watchStyles(
    callback: (newStyles: UserStyle[], oldStyles?: UserStyle[]) => void,
  ): () => void;
  watchUserCSSStyles(
    callback: (newStyles: UserCSSStyle[], oldStyles?: UserCSSStyle[]) => void,
  ): () => void;
}

/**
 * Create storage items with proper configuration
 */
const settingsStorage = storage.defineItem<SettingsStorage>(
  STORAGE_KEYS.SETTINGS,
  {
    fallback: DEFAULT_SETTINGS,
    version: 1,
  },
);

const stylesStorage = storage.defineItem<UserStyle[]>(STORAGE_KEYS.STYLES, {
  fallback: [],
  version: 1,
});

const userCSSStylesStorage = storage.defineItem<UserCSSStyle[]>(STORAGE_KEYS.USERCSS_STYLES, {
  fallback: [],
  version: 1,
});

/**
 * Storage client implementation
 */
export class EastylesStorageClient implements StorageClient {
  private debugEnabled = false;

  constructor() {
    // Initialize debug mode state
    this.initializeDebugMode();
  }

  private async initializeDebugMode(): Promise<void> {
    try {
      const settings = await this.getSettings();
      this.debugEnabled = settings.isDebuggingEnabled ?? false;
    } catch (error) {
      console.warn("Failed to initialize debug mode:", error);
    }
  }

  private debug(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      console.log(`[EastylesStorage] ${message}`, ...args);
    }
  }

  private debugError(message: string, error: unknown): void {
    if (this.debugEnabled) {
      console.error(`[EastylesStorage] ${message}`, error);
    }
  }

  // Settings management
  async getSettings(): Promise<SettingsStorage> {
    try {
      const settings = await settingsStorage.getValue();
      this.debug("Retrieved settings:", settings);

      // Validate settings and provide fallback if invalid
      const validation = validateSettings(settings);
      if (!validation.isValid) {
        this.debugError(
          "Invalid settings detected, using defaults:",
          validation.errors,
        );
        return DEFAULT_SETTINGS;
      }

      return settings;
    } catch (error) {
      this.debugError("Failed to get settings:", error);
      return DEFAULT_SETTINGS;
    }
  }

  async updateSettings(settings: Partial<SettingsStorage>): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings = mergeSettings({
        ...currentSettings,
        ...settings,
      });

      this.debug("Updating settings:", updatedSettings);
      await settingsStorage.setValue(updatedSettings);

      // Update debug mode if it changed
      if (settings.isDebuggingEnabled !== undefined) {
        this.debugEnabled = settings.isDebuggingEnabled;
      }
    } catch (error) {
      this.debugError("Failed to update settings:", error);
      throw new Error(`Failed to update settings: ${error}`);
    }
  }

  async resetSettings(): Promise<void> {
    try {
      this.debug("Resetting settings to defaults");
      await settingsStorage.setValue(DEFAULT_SETTINGS);
      this.debugEnabled = DEFAULT_SETTINGS.isDebuggingEnabled ?? false;
    } catch (error) {
      this.debugError("Failed to reset settings:", error);
      throw new Error(`Failed to reset settings: ${error}`);
    }
  }

  // Theme management
  async getThemeMode(): Promise<"light" | "dark" | "system"> {
    try {
      const settings = await this.getSettings();
      return settings.themeMode ?? "system";
    } catch (error) {
      this.debugError("Failed to get theme mode:", error);
      return "system";
    }
  }

  async setThemeMode(mode: "light" | "dark" | "system"): Promise<void> {
    try {
      this.debug("Setting theme mode:", mode);
      await this.updateSettings({ themeMode: mode });
    } catch (error) {
      this.debugError("Failed to set theme mode:", error);
      throw new Error(`Failed to set theme mode: ${error}`);
    }
  }

  // Debug mode management
  async getDebugMode(): Promise<boolean> {
    try {
      const settings = await this.getSettings();
      return settings.isDebuggingEnabled ?? false;
    } catch (error) {
      this.debugError("Failed to get debug mode:", error);
      return false;
    }
  }

  async setDebugMode(enabled: boolean): Promise<void> {
    try {
      this.debug("Setting debug mode:", enabled);
      await this.updateSettings({ isDebuggingEnabled: enabled });
    } catch (error) {
      this.debugError("Failed to set debug mode:", error);
      throw new Error(`Failed to set debug mode: ${error}`);
    }
  }

  // User styles management
  async getStyles(): Promise<UserStyle[]> {
    try {
      const styles = await stylesStorage.getValue();
      this.debug("Retrieved styles:", styles.length, "items");

      // Validate each style
      const validStyles = styles.filter((style) => {
        const validation = validateUserStyle(style);
        if (!validation.isValid) {
          this.debugError(
            `Invalid style detected (${style.id}):`,
            validation.errors,
          );
          return false;
        }
        return true;
      });

      if (validStyles.length !== styles.length) {
        // Save cleaned styles back
        await stylesStorage.setValue(validStyles);
      }

      return validStyles;
    } catch (error) {
      this.debugError("Failed to get styles:", error);
      return [];
    }
  }

  async getStyle(id: string): Promise<UserStyle | null> {
    try {
      const styles = await this.getStyles();
      const style = styles.find((s) => s.id === id);
      this.debug("Retrieved style:", id, style ? "found" : "not found");
      return style || null;
    } catch (error) {
      this.debugError("Failed to get style:", error);
      return null;
    }
  }

  async addStyle(
    styleData: Partial<UserStyle> & Pick<UserStyle, "name" | "code">,
  ): Promise<UserStyle> {
    try {
      const newStyle = createUserStyle(styleData);
      const validation = validateUserStyle(newStyle);

      if (!validation.isValid) {
        throw new Error(`Invalid style data: ${validation.errors.join(", ")}`);
      }

      const styles = await this.getStyles();

      styles.push(newStyle);
      await stylesStorage.setValue(styles);

      this.debug("Added style:", newStyle.id);
      return newStyle;
    } catch (error) {
      this.debugError("Failed to add style:", error);
      throw new Error(`Failed to add style: ${error}`);
    }
  }

  async updateStyle(
    id: string,
    updates: Partial<UserStyle>,
  ): Promise<UserStyle> {
    try {
      const styles = await this.getStyles();
      const styleIndex = styles.findIndex((s) => s.id === id);

      if (styleIndex === -1) {
        throw new Error(`Style with ID "${id}" not found`);
      }

      const updatedStyle = {
        ...styles[styleIndex],
        ...updates,
        updatedAt: Date.now(),
      };

      const validation = validateUserStyle(updatedStyle);
      if (!validation.isValid) {
        throw new Error(`Invalid style data: ${validation.errors.join(", ")}`);
      }

      styles[styleIndex] = updatedStyle;
      await stylesStorage.setValue(styles);

      this.debug("Updated style:", id);
      return updatedStyle;
    } catch (error) {
      this.debugError("Failed to update style:", error);
      throw new Error(`Failed to update style: ${error}`);
    }
  }

  async removeStyle(id: string): Promise<void> {
    try {
      const styles = await this.getStyles();
      const filteredStyles = styles.filter((s) => s.id !== id);

      if (filteredStyles.length === styles.length) {
        throw new Error(`Style with ID "${id}" not found`);
      }

      await stylesStorage.setValue(filteredStyles);
      this.debug("Removed style:", id);
    } catch (error) {
      this.debugError("Failed to remove style:", error);
      throw new Error(`Failed to remove style: ${error}`);
    }
  }

  async enableStyle(id: string, enabled: boolean): Promise<void> {
    try {
      await this.updateStyle(id, { enabled });
      this.debug("Style enabled state changed:", id, enabled);
    } catch (error) {
      this.debugError("Failed to change style enabled state:", error);
      throw error;
    }
  }

  // Batch operations
  async getMultipleStyles(ids: string[]): Promise<UserStyle[]> {
    try {
      const styles = await this.getStyles();
      return styles.filter((style) => ids.includes(style.id));
    } catch (error) {
      this.debugError("Failed to get multiple styles:", error);
      return [];
    }
  }

  async updateMultipleStyles(
    updates: Array<{ id: string; updates: Partial<UserStyle> }>,
  ): Promise<void> {
    try {
      const styles = await this.getStyles();
      const now = Date.now();

      for (const { id, updates: styleUpdates } of updates) {
        const styleIndex = styles.findIndex((s) => s.id === id);
        if (styleIndex !== -1) {
          styles[styleIndex] = {
            ...styles[styleIndex],
            ...styleUpdates,
            updatedAt: now,
          };
        }
      }

      await stylesStorage.setValue(styles);
      this.debug("Updated multiple styles:", updates.length, "items");
    } catch (error) {
      this.debugError("Failed to update multiple styles:", error);
      throw new Error(`Failed to update multiple styles: ${error}`);
    }
  }

  // Import/Export functionality
  async exportAll(): Promise<ExportData> {
    try {
      const [settings, styles, userCSSStyles] = await Promise.all([
        this.getSettings(),
        this.getStyles(),
        this.getUserCSSStyles(),
      ]);

      const exportData: ExportData = {
        settings,
        styles,
        userCSSStyles,
        timestamp: Date.now(),
        version: settings.version,
        exportVersion: "1.0.0",
      };

      this.debug("Exported data:", exportData.styles.length, "legacy styles,", exportData.userCSSStyles.length, "UserCSS styles");
      return exportData;
    } catch (error) {
      this.debugError("Failed to export data:", error);
      throw new Error(`Failed to export data: ${error}`);
    }
  }

  async importAll(
    data: ExportData,
    options: { overwrite?: boolean } = {},
  ): Promise<void> {
    try {
      const validation = validateExportData(data);
      if (!validation.isValid) {
        throw new Error(`Invalid export data: ${validation.errors.join(", ")}`);
      }

      const { overwrite = true } = options;

      if (overwrite) {
        // Overwrite mode: replace all data
        await Promise.all([
          settingsStorage.setValue(data.settings),
          stylesStorage.setValue(data.styles),
          userCSSStylesStorage.setValue(data.userCSSStyles),
        ]);
        this.debug("Imported data (overwrite):", data.styles.length, "legacy styles,", data.userCSSStyles.length, "UserCSS styles");
      } else {
        // Merge mode: combine with existing data
        const [existingStyles, existingUserCSSStyles] = await Promise.all([
          this.getStyles(),
          this.getUserCSSStyles(),
        ]);

        const mergedStyles = [...existingStyles];
        const mergedUserCSSStyles = [...existingUserCSSStyles];

        // Add or update legacy styles from import
        for (const importedStyle of data.styles) {
          const existingIndex = mergedStyles.findIndex(
            (s) => s.id === importedStyle.id,
          );
          if (existingIndex !== -1) {
            mergedStyles[existingIndex] = importedStyle;
          } else {
            mergedStyles.push(importedStyle);
          }
        }

        // Add or update UserCSS styles from import
        for (const importedStyle of data.userCSSStyles) {
          const existingIndex = mergedUserCSSStyles.findIndex(
            (s) => s.id === importedStyle.id,
          );
          if (existingIndex !== -1) {
            mergedUserCSSStyles[existingIndex] = importedStyle;
          } else {
            mergedUserCSSStyles.push(importedStyle);
          }
        }

        await Promise.all([
          this.updateSettings(data.settings),
          stylesStorage.setValue(mergedStyles),
          userCSSStylesStorage.setValue(mergedUserCSSStyles),
        ]);
        this.debug("Imported data (merge):", data.styles.length, "legacy styles,", data.userCSSStyles.length, "UserCSS styles");
      }

      // Update debug mode if it changed
      this.debugEnabled = data.settings.isDebuggingEnabled ?? false;
    } catch (error) {
      this.debugError("Failed to import data:", error);
      throw new Error(`Failed to import data: ${error}`);
    }
  }

  async resetAll(): Promise<void> {
    try {
      await Promise.all([
        settingsStorage.setValue(DEFAULT_SETTINGS),
        stylesStorage.setValue([]),
        userCSSStylesStorage.setValue([]),
      ]);
      this.debugEnabled = DEFAULT_SETTINGS.isDebuggingEnabled ?? false;
      this.debug("Reset all data");
    } catch (error) {
      this.debugError("Failed to reset all data:", error);
      throw new Error(`Failed to reset all data: ${error}`);
    }
  }

  // Storage watchers
  watchSettings(
    callback: (
      newSettings: SettingsStorage,
      oldSettings?: SettingsStorage,
    ) => void,
  ): () => void {
    try {
      this.debug("Setting up settings watcher");
      return settingsStorage.watch((newValue, oldValue) => {
        this.debug("Settings watcher callback triggered", newValue, oldValue);
        callback(newValue, oldValue);
      });
    } catch (error) {
      this.debugError("Failed to setup settings watcher:", error);
      return () => {}; // Return no-op function
    }
  }

  watchStyles(
    callback: (newStyles: UserStyle[], oldStyles?: UserStyle[]) => void,
  ): () => void {
    try {
      this.debug("Setting up styles watcher");
      return stylesStorage.watch((newValue, oldValue) => {
        this.debug("Styles watcher callback triggered", newValue, oldValue);
        callback(newValue, oldValue);
      });
    } catch (error) {
      this.debugError("Failed to setup styles watcher:", error);
      return () => {}; // Return no-op function
    }
  }

  watchUserCSSStyles(
    callback: (newStyles: UserCSSStyle[], oldStyles?: UserCSSStyle[]) => void,
  ): () => void {
    try {
      this.debug("Setting up UserCSS styles watcher");
      return userCSSStylesStorage.watch((newValue, oldValue) => {
        this.debug("UserCSS styles watcher callback triggered", newValue, oldValue);
        callback(newValue, oldValue);
      });
    } catch (error) {
      this.debugError("Failed to setup UserCSS styles watcher:", error);
      return () => {}; // Return no-op function
    }
  }

  // UserCSS styles management
  async getUserCSSStyles(): Promise<UserCSSStyle[]> {
    try {
      const styles = await userCSSStylesStorage.getValue();
      this.debug("Retrieved UserCSS styles:", styles.length, "items");

      // Validate each style
      const validStyles = styles.filter((style) => {
        const validation = validateUserCSSStyle(style);
        if (!validation.isValid) {
          this.debugError(
            `Invalid UserCSS style detected (${style.id}):`,
            validation.errors,
          );
          return false;
        }
        return true;
      });

      if (validStyles.length !== styles.length) {
        // Save cleaned styles back
        await userCSSStylesStorage.setValue(validStyles);
      }

      return validStyles;
    } catch (error) {
      this.debugError("Failed to get UserCSS styles:", error);
      return [];
    }
  }

  async getUserCSSStyle(id: string): Promise<UserCSSStyle | null> {
    try {
      const styles = await this.getUserCSSStyles();
      const style = styles.find((s) => s.id === id);
      this.debug("Retrieved UserCSS style:", id, style ? "found" : "not found");
      return style || null;
    } catch (error) {
      this.debugError("Failed to get UserCSS style:", error);
      return null;
    }
  }

  async addUserCSSStyle(
    styleData: Partial<UserCSSStyle> & Pick<UserCSSStyle, "name" | "source">,
  ): Promise<UserCSSStyle> {
    try {
      const newStyle = createUserCSSStyle(styleData);
      const validation = validateUserCSSStyle(newStyle);

      if (!validation.isValid) {
        throw new Error(`Invalid UserCSS style data: ${validation.errors.join(", ")}`);
      }

      const styles = await this.getUserCSSStyles();

      styles.push(newStyle);
      await userCSSStylesStorage.setValue(styles);

      this.debug("Added UserCSS style:", newStyle.id);
      return newStyle;
    } catch (error) {
      this.debugError("Failed to add UserCSS style:", error);
      throw new Error(`Failed to add UserCSS style: ${error}`);
    }
  }

  async updateUserCSSStyle(
    id: string,
    updates: Partial<UserCSSStyle>,
  ): Promise<UserCSSStyle> {
    try {
      const styles = await this.getUserCSSStyles();
      const styleIndex = styles.findIndex((s) => s.id === id);

      if (styleIndex === -1) {
        throw new Error(`UserCSS style with ID "${id}" not found`);
      }

      const updatedStyle = {
        ...styles[styleIndex],
        ...updates,
      };

      const validation = validateUserCSSStyle(updatedStyle);
      if (!validation.isValid) {
        throw new Error(`Invalid UserCSS style data: ${validation.errors.join(", ")}`);
      }

      styles[styleIndex] = updatedStyle;
      await userCSSStylesStorage.setValue(styles);

      this.debug("Updated UserCSS style:", id);
      return updatedStyle;
    } catch (error) {
      this.debugError("Failed to update UserCSS style:", error);
      throw new Error(`Failed to update UserCSS style: ${error}`);
    }
  }

  async removeUserCSSStyle(id: string): Promise<void> {
    try {
      const styles = await this.getUserCSSStyles();
      const filteredStyles = styles.filter((s) => s.id !== id);

      if (filteredStyles.length === styles.length) {
        throw new Error(`UserCSS style with ID "${id}" not found`);
      }

      await userCSSStylesStorage.setValue(filteredStyles);
      this.debug("Removed UserCSS style:", id);
    } catch (error) {
      this.debugError("Failed to remove UserCSS style:", error);
      throw new Error(`Failed to remove UserCSS style: ${error}`);
    }
  }

  async enableUserCSSStyle(id: string, enabled: boolean): Promise<void> {
    try {
      await this.updateUserCSSStyle(id, { enabled });
      this.debug("UserCSS style enabled state changed:", id, enabled);
    } catch (error) {
      this.debugError("Failed to change UserCSS style enabled state:", error);
      throw error;
    }
  }

  async updateUserCSSStyleVariables(id: string, variables: Record<string, unknown>): Promise<UserCSSStyle> {
    try {
      const style = await this.getUserCSSStyle(id);
      if (!style) {
        throw new Error(`UserCSS style with ID "${id}" not found`);
      }

      const updatedVariables = { ...style.variables };

      // Update only the variables that are provided
      for (const [varName, varValue] of Object.entries(variables)) {
        if (updatedVariables[varName]) {
          updatedVariables[varName] = {
            ...updatedVariables[varName],
            value: String(varValue),
          };
        }
      }

      return await this.updateUserCSSStyle(id, { variables: updatedVariables });
    } catch (error) {
      this.debugError("Failed to update UserCSS style variables:", error);
      throw new Error(`Failed to update UserCSS style variables: ${error}`);
    }
  }
}

/**
 * Default storage client instance
 */
export const storageClient = new EastylesStorageClient();

/**
 * Convenience functions for direct access (backward compatibility)
 */
export const getSettings = () => storageClient.getSettings();
export const updateSettings = (settings: Partial<SettingsStorage>) =>
   storageClient.updateSettings(settings);
export const getThemeMode = () => storageClient.getThemeMode();
export const setThemeMode = (mode: "light" | "dark" | "system") =>
   storageClient.setThemeMode(mode);
export const getDebugMode = () => storageClient.getDebugMode();
export const setDebugMode = (enabled: boolean) =>
   storageClient.setDebugMode(enabled);

// UserCSS convenience functions
export const getUserCSSStyles = () => storageClient.getUserCSSStyles();
export const getUserCSSStyle = (id: string) => storageClient.getUserCSSStyle(id);
export const addUserCSSStyle = (style: Partial<UserCSSStyle> & Pick<UserCSSStyle, "name" | "source">) =>
   storageClient.addUserCSSStyle(style);
export const updateUserCSSStyle = (id: string, updates: Partial<UserCSSStyle>) =>
   storageClient.updateUserCSSStyle(id, updates);
export const removeUserCSSStyle = (id: string) => storageClient.removeUserCSSStyle(id);
export const enableUserCSSStyle = (id: string, enabled: boolean) =>
   storageClient.enableUserCSSStyle(id, enabled);
export const updateUserCSSStyleVariables = (id: string, variables: Record<string, unknown>) =>
   storageClient.updateUserCSSStyleVariables(id, variables);
export const watchUserCSSStyles = (callback: (newStyles: UserCSSStyle[], oldStyles?: UserCSSStyle[]) => void) =>
   storageClient.watchUserCSSStyles(callback);
