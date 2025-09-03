/**
 * Internationalization service for Eastyles
 * Uses browser.i18n API for localization
 */

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
      console.warn("Failed to get UI language, using fallback:", error);
      return this.fallbackLocale;
    }
  }

  /**
   * Get a localized message by key
   */
  t(key: string, substitutions?: string | string[]): string {
    // Check cache first
    const cacheKey = `${this.getCurrentLocale()}:${key}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Use browser.i18n API
      const message = browser.i18n.getMessage(key, substitutions);

      // If message is empty, try fallback
      if (!message) {
        const fallbackMessage = browser.i18n.getMessage(key, substitutions);
        if (fallbackMessage) {
          this.cache.set(cacheKey, fallbackMessage);
          return fallbackMessage;
        }
        // Return key as fallback if no translation found
        console.warn(`Missing translation for key: ${key}`);
        return key;
      }

      this.cache.set(cacheKey, message);
      return message;
    } catch (error) {
      console.warn(`Error getting translation for key "${key}":`, error);
      return key;
    }
  }

  /**
   * Check if a message exists for the given key
   */
  hasMessage(key: string): boolean {
    try {
      const message = browser.i18n.getMessage(key);
      return Boolean(message);
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
