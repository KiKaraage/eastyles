/**
 * Internationalization service for Eastyles
 * Uses @wxt-dev/i18n module with browser.i18n API for localization
 */

import { createI18n } from "@wxt-dev/i18n";

export const i18n = createI18n();

export interface I18nMessage {
  message: string;
  description?: string;
}

export class I18nService {
  private cache: Map<string, string> = new Map();
  private fallbackLocale = "en";

  /**
   * Get the user's preferred language
   */
  getCurrentLocale(): string {
    try {
      return browser.i18n.getUILanguage() || this.fallbackLocale;
    } catch (error) {
      console.warn(
        "[ea-i18n] Failed to get UI language, using fallback:",
        error,
      );
      return this.fallbackLocale;
    }
  }

  /**
   * Get a localized message by key using @wxt-dev/i18n
   */
  t(key: string, substitutions?: string | string[]): string {
    // Check cache first
    const cacheKey = `${this.getCurrentLocale()}:${key}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Use the new @wxt-dev/i18n module
      // The second argument can be a count or array of substitutions
      let message: string;

      if (Array.isArray(substitutions)) {
        // Handle array substitutions based on length to match expected tuple types
        if (substitutions.length === 1) {
          message = i18n.t(key, [substitutions[0]]);
        } else if (substitutions.length === 2) {
          message = i18n.t(key, [substitutions[0], substitutions[1]]);
        } else if (substitutions.length === 3) {
          message = i18n.t(key, [
            substitutions[0],
            substitutions[1],
            substitutions[2],
          ]);
        } else if (substitutions.length === 9) {
          message = i18n.t(key, [
            substitutions[0],
            substitutions[1],
            substitutions[2],
            substitutions[3],
            substitutions[4],
            substitutions[5],
            substitutions[6],
            substitutions[7],
            substitutions[8],
          ]);
        } else {
          // For other lengths, pass the first substitution separately
          message = i18n.t(key, [substitutions[0]]);
        }
      } else if (typeof substitutions === "number") {
        message = i18n.t(key, substitutions);
      } else if (substitutions) {
        message = i18n.t(key, [substitutions]);
      } else {
        message = i18n.t(key);
      }

      // If message equals the key, translation might be missing
      if (message === key) {
        console.warn(`[ea-i18n] Missing translation for key: ${key}`);
        return key;
      }

      this.cache.set(cacheKey, message);
      return message;
    } catch (error) {
      console.warn(
        `[ea-i18n] Error getting translation for key "${key}":`,
        error,
      );
      return key;
    }
  }

  /**
   * Check if a message exists for the given key using @wxt-dev/i18n
   */
  hasMessage(key: string): boolean {
    try {
      const message = i18n.t(key);
      // If the translation equals the key, it's likely missing
      return message !== key || key === "";
    } catch {
      return false;
    }
  }

  /**
   * Clear the translation cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get all available locales
   */
  getAvailableLocales(): string[] {
    // This is a simplified approach - in a real implementation,
    // you might want to detect available locales from the _locales directory
    return ["en", "id"]; // Add more locales as you create them
  }
}

// Export singleton instance
export const i18nService = new I18nService();
