/**
 * Browser compatibility utility for Eastyles extension
 * Focuses on the key differences between Firefox and Chrome, and Manifest V2 vs V3
 */

import { browser } from "wxt/browser";

// Simple enum for browser types
export type BrowserType = "firefox" | "chrome" | "unknown";

// Simple enum for manifest versions
export type ManifestVersion = 2 | 3;

/**
 * Basic browser information focusing on what actually matters
 */
export interface BrowserInfo {
  type: BrowserType;
  manifestVersion: ManifestVersion;
  isFirefox: boolean;
  isChrome: boolean;
  isChromeBased: boolean;
}

/**
 * Get the current browser type using WXT environment variables
 */
export function getBrowserType(): BrowserType {
  // Use WXT's built-in environment variables
  return import.meta.env.BROWSER as BrowserType;
}

/**
 * Get the current manifest version using WXT environment variables
 */
export function getManifestVersion(): ManifestVersion {
  return import.meta.env.MANIFEST_VERSION as ManifestVersion;
}

/**
 * Get comprehensive browser information
 */
export function getBrowserInfo(): BrowserInfo {
  const type = getBrowserType();
  const manifestVersion = getManifestVersion();

  return {
    type,
    manifestVersion,
    isFirefox: type === "firefox",
    isChrome: type === "chrome",
    isChromeBased: type === "chrome",
  };
}

/**
 * Check if we're running in Firefox using WXT environment variables
 */
export function isFirefox(): boolean {
  return import.meta.env.FIREFOX;
}

/**
 * Check if we're running in Chrome or Chromium-based browser using WXT environment variables
 */
export function isChrome(): boolean {
  return import.meta.env.CHROME;
}

/**
 * Check if browser supports Manifest V3 using WXT environment variables
 */
export function isManifestV3(): boolean {
  return import.meta.env.MANIFEST_VERSION === 3;
}

/**
 * Browser-specific configurations for key differences
 */
export const browserConfig = {
  /**
   * Context menu API configurations
   */
  contextMenu: {
    // Firefox uses optional_permissions for context menus
    firefox: {
      permissions: ["contextMenus"],
      api: () => (typeof browser !== "undefined" ? browser.contextMenus : null),
    },
    // Chrome/Chromium has different behavior and stricter MV3 requirements
    chrome: {
      permissions: ["contextMenus"],
      api: () => (typeof browser !== "undefined" ? browser.contextMenus : null),
    },
  },

  /**
   * Storage API configurations
   */
  storage: {
    // Firefox generally has more generous storage quotas
    firefox: {
      quota: "unlimited",
      api: () => (typeof browser !== "undefined" ? browser.storage : null),
    },
    // Chrome has specific quota limits, especially in MV3
    chrome: {
      quota: "limited",
      api: () => (typeof browser !== "undefined" ? browser.storage : null),
    },
  },

  /**
   * Background script behavior
   */
  background: {
    // Firefox: Event pages work well in MV2
    firefox: {
      type: "event_page",
      api: () => (typeof browser !== "undefined" ? browser.runtime : null),
    },
    // Chrome: MV3 requires service workers
    chrome: {
      type: isManifestV3() ? "service_worker" : "event_page",
      api: () => (typeof browser !== "undefined" ? browser.runtime : null),
    },
  },
};

/**
 * Get browser-specific API access with fallbacks
 */
export function getBrowserApi<T extends keyof typeof browserConfig>(
  category: T,
): (typeof browserConfig)[T]["firefox"] | (typeof browserConfig)[T]["chrome"] {
  const browserInfo = getBrowserInfo();

  if (browserInfo.isFirefox && browserConfig[category].firefox) {
    return browserConfig[category].firefox;
  }

  // Default to chrome behavior
  return browserConfig[category].chrome;
}

/**
 * Safe API wrapper with browser compatibility
 */
export function safeApiCall<T>(apiCall: () => T, fallback: T): T {
  try {
    return apiCall();
  } catch (error: unknown) {
    console.warn("[ea] Browser API call failed:", error);
    return fallback;
  }
}

/**
 * Safe boolean API wrapper with browser compatibility
 */
export function safeBooleanApi(
  apiCall: () => unknown,
  fallback: boolean = false,
): boolean {
  try {
    const result = apiCall();
    return !!result;
  } catch (error: unknown) {
    console.warn("[ea] Browser API call failed:", error);
    return fallback;
  }
}

/**
 * Runtime feature detection for common APIs
 */
export const runtimeFeatures = {
  /**
   * Check if storage API is available
   */
  hasStorage: (): boolean => {
    return safeBooleanApi(
      () => !!browser && (browser?.storage?.local || browser?.storage?.sync),
    );
  },

  /**
   * Check if context menus are available
   */
  hasContextMenus: (): boolean => {
    return safeBooleanApi(() => !!browser && !!browser?.contextMenus);
  },

  /**
   * Check if messaging is available
   */
  hasMessaging: (): boolean => {
    return safeBooleanApi(
      () =>
        !!browser &&
        typeof browser.runtime?.sendMessage === "function" &&
        typeof browser.runtime?.onMessage === "object",
    );
  },

  /**
   * Check if tabs API is available
   */
  hasTabs: (): boolean => {
    return safeBooleanApi(() => !!browser && !!browser?.tabs);
  },
};

// Export current browser info for easy access
export const currentBrowser = getBrowserInfo();

/**
 * Manifest V2/V3 compatibility layer
 *
 * Key differences:
 * - MV2: Uses event pages, sync storage, flexible permissions
 * - MV3: Requires service workers, local storage only, stricter permissions
 */
export const manifestCompatibility = {
  /**
   * Get appropriate storage area based on manifest version
   */
  getStorageArea: (): "local" | "sync" => {
    return isManifestV3() ? "local" : "sync";
  },

  /**
   * Get appropriate background script type
   * MV3: service_worker, MV2: event_page
   */
  getBackgroundType: (): "service_worker" | "event_page" => {
    return isManifestV3() ? "service_worker" : "event_page";
  },

  /**
   * Check if an API is available in current manifest version
   */
  isApiAvailable: (api: string): boolean => {
    const mv3Apis = [
      "storage.local",
      "runtime.getBackgroundPage",
      "runtime.openOptionsPage",
    ];

    if (isManifestV3()) {
      // MV3 has more restrictions
      return !mv3Apis.includes(api);
    }

    // MV2 has more APIs available
    return true;
  },

  /**
   * Get appropriate permissions for manifest version
   */
  getPermissions: (): string[] => {
    const basePermissions = ["storage", "contextMenus"];

    if (isManifestV3()) {
      // MV3 requires host permissions for certain features
      return [...basePermissions, "scripting"];
    }

    return basePermissions;
  },
};

/**
 * Helper for browser-specific conditional rendering in React components
 * with simplified MV2/MV3 compatibility
 */
export const useBrowser = () => {
  const browserInfo = getBrowserInfo();

  return {
    browserInfo,
    isFirefox: browserInfo.isFirefox,
    isChrome: browserInfo.isChrome,
    isChromeBased: browserInfo.isChromeBased,
    isManifestV3: isManifestV3(),
    // Simplified compatibility helpers
    supportsMV3Features: isManifestV3(),
    usesLocalStorage: manifestCompatibility.getStorageArea() === "local",
  };
};
