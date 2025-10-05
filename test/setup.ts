/// <reference types="../.wxt/wxt.d.ts" />
// test/setup.ts - Enhanced version with proper WXT storage mocking
// This file sets up the testing environment for Vitest

import React from "react";
import { vi, beforeAll, afterEach, beforeEach } from "vitest";

// region: Type Definitions for Mocks
interface MockBrowserStorageArea {
  get: (
    keys?: string | string[] | object | null,
  ) => Promise<{ [key: string]: unknown }>;
  set: (items: { [key: string]: unknown }) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
}

interface MockBrowserStorage {
  local: MockBrowserStorageArea;
  sync: MockBrowserStorageArea;
}

interface MockBrowserRuntime {
  sendMessage: (message: unknown) => Promise<unknown>;
  onMessage: {
    addListener: (callback: (message: unknown) => void) => void;
  };
}

interface MockBrowserTabs {
  query: (queryInfo: object) => Promise<unknown[]>;
  create: (createProperties: object) => Promise<unknown>;
}

interface MockBrowser {
  storage: MockBrowserStorage;
  runtime: MockBrowserRuntime;
  tabs: MockBrowserTabs;
}

interface MockMediaQueryList {
  matches: boolean;
  media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null;
  addListener: (
    listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void,
  ) => void;
  removeListener: (
    listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void,
  ) => void;
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) => void;
  dispatchEvent: (event: Event) => boolean;
}
// endregion

// In-memory storage implementation
const storageData: { [key: string]: unknown } = {};

// Track watchers for each storage key - maps key to array of { callback, callImmediate }
const watchers: {
  [key: string]: Array<{
    callback: (newValue: unknown, oldValue: unknown) => void;
  }>;
} = {};

// Reset storage function for test isolation
export function resetStorage(): void {
  Object.keys(storageData).forEach((key) => {
    delete storageData[key];
  });

  // Clear all watchers
  Object.keys(watchers).forEach((key) => {
    delete watchers[key];
  });
}

beforeAll(() => {
  // Mock browser.storage.local with actual implementation
  const mockStorageArea: MockBrowserStorageArea = {
    get: vi.fn(async (keys?: string | string[] | object | null) => {
      if (keys === null || keys === undefined) {
        // Return all data
        return { ...storageData };
      }

      if (typeof keys === "string") {
        // Return single key
        return { [keys]: storageData[keys] };
      }

      if (Array.isArray(keys)) {
        // Return multiple keys
        const result: { [key: string]: unknown } = {};
        for (const key of keys) {
          result[key] = storageData[key];
        }
        return result;
      }

      if (typeof keys === "object") {
        // Return default values for missing keys
        const result: { [key: string]: unknown } = {};
        for (const [key, defaultValue] of Object.entries(keys)) {
          result[key] =
            storageData[key] !== undefined ? storageData[key] : defaultValue;
        }
        return result;
      }

      return {};
    }),

    set: vi.fn(async (items: { [key: string]: unknown }) => {
      // Get current values before updating
      const oldValues = { ...storageData };

      // Update storage
      Object.assign(storageData, items);

      // Notify watchers for each changed key
      for (const [key, newValue] of Object.entries(items)) {
        if (watchers[key]) {
          const oldValue = oldValues[key];
          for (const { callback } of watchers[key]) {
            // Always call the callback when value changes
            // Using setTimeout to ensure the spy captures the call
            setTimeout(() => {
              callback(newValue, oldValue);
            }, 0);
          }
        }
      }
    }),

    remove: vi.fn(async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const oldValues: { [key: string]: unknown } = {};

      // Store old values before removal
      for (const key of keyList) {
        oldValues[key] = storageData[key];
      }

      // Remove keys
      keyList.forEach((key) => {
        delete storageData[key];
      });

      // Notify watchers
      for (const key of keyList) {
        if (watchers[key]) {
          for (const { callback } of watchers[key]) {
            // Using setTimeout to ensure the spy captures the call
            setTimeout(() => {
              callback(undefined, oldValues[key]);
            }, 0);
          }
        }
      }
    }),

    clear: vi.fn(async () => {
      const oldValues = { ...storageData };
      resetStorage();

      // Notify watchers for all keys
      for (const key of Object.keys(oldValues)) {
        if (watchers[key]) {
          for (const { callback } of watchers[key]) {
            // Using setTimeout to ensure the spy captures the call
            setTimeout(() => {
              callback(undefined, oldValues[key]);
            }, 0);
          }
        }
      }
    }),
  };

  // Mock browser API with proper types
  const mockBrowser: MockBrowser = {
    storage: {
      local: mockStorageArea,
      sync: { ...mockStorageArea }, // Copy the same implementation
    },
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
      },
    },
    tabs: {
      query: vi.fn(),
      create: vi.fn(),
    },
  };

  // Assign the mock to global.browser
  Object.defineProperty(global, "browser", {
    writable: true,
    value: {
      ...mockBrowser,
      runtime: {
        ...mockBrowser.runtime,
        getManifest: vi.fn().mockReturnValue({ version: "1.1.0" }),
        onInstalled: {
          addListener: vi.fn(),
        },
      },
      i18n: {
        getMessage: vi
          .fn()
          .mockImplementation(
            (key: string, substitutions?: string | string[]) => {
              // Return actual translations from en.json
              const translations: Record<string, string> = {
                manager_addUserCss: "Add UserCSS File",
                font_createFontStyle: "Create Font Style",
                font_editStyle: "Edit Font Style",
                applyButton: "Apply",
                appName: "Eastyles",
                appDescription: "Easy web styling for everyone",
                stylesFor: "Styles for",
                manageStyles: "Manage Styles",
                settings: "Settings",
                addNewStyle: "Add New Style",
                saveButton: "Save Style",
                cancelButton: "Cancel",
                closeButton: "Close",
                applying: "Applying...",
                applyToSiteButton: "Apply to Site",
                removeButton: "Remove Style",
                configureButton: "Configure",
                deleteButton: "Delete",
                loading: "Loading...",
                error: "Error",
                success: "Success",
                styleInstalled: "Style saved successfully",
                styleRemoved: "Style removed successfully",
                styleDeleted: "Style deleted successfully",
                noStylesFound: "No styles found",
                dragDropHint: "Drag and drop .user.css file here",
                orClickToBrowse: "or click to browse",
                styleName: "Style Name",
                styleDescription: "Description",
                author: "Author",
                version: "Version",
                domains: "Domains",
                variables: "Variables",
                enabled: "Enabled",
                disabled: "Disabled",
                lastUpdated: "Last Updated",
                installDate: "Install Date",
                font_apply: "Apply Font",
                font_tabs_builtin: "Built-in Fonts",
                font_tabs_custom: "Custom Font",
                font_builtin_description: "Choose from our collection of carefully selected fonts",
                font_custom_description: "Enter the name of a font installed on your system",
                font_custom_inputLabel: "Font Name",
                font_custom_placeholder: "e.g., Arial, Times New Roman, Comic Sans MS",
                font_custom_checkButton: "Check",
                font_custom_previewLabel: "Preview",
                font_custom_available: "Font is available and ready to use",
                font_custom_notAvailable: "Font not found on your system",
                font_categories_sans_serif: "Sans Serif",
                font_categories_serif: "Serif",
                font_categories_monospace: "Monospace",
                font_categories_display: "Display",
                font_categories_handwriting: "Handwriting",
                font_error_emptyName: "Please enter a font name",
                font_error_selectFont: "Please select a font",
                font_error_notAvailable: "Font '$1' is not available on your system",
                font_error_checkFailed: "Failed to check font availability",
                font_error_parseFailed: "Failed to process font style",
                font_error_installFailed: "Failed to install font style",
                font_error_applyFailed: "Failed to apply font",
                font_applied: "Font '$1' applied successfully",
                font_selectLabel: "Select Font",
                font_selectPlaceholder: "Choose a font...",
                font_applyButton: "Apply Font",
                colors_apply: "Apply Colors",
                ERR_STORAGE_QUOTA: "Storage capacity exceeded. Please remove some styles to free up space.",
                ERR_STORAGE_INVALID_DATA: "Invalid storage data: $1",
                ERR_MESSAGE_TIMEOUT: "Message timed out after $1 attempts: $2",
                ERR_MESSAGE_INVALID: "Invalid message: $1",
                ERR_FILE_FORMAT_INVALID: "Invalid file format: $2. Only $1 formats can be accepted",
                ERR_DATA_CORRUPTED: "Data corrupted: $1",
                ERR_BROWSER_API: "Browser API error in $1.$2: $3",
                ERR_PERMISSION_DENIED: "Permission denied: $1",
                ERR_PARSE_METADATA: "Failed to parse style metadata",
                ERR_PREPROCESSOR_COMPILE: "Failed to compile preprocessor code",
                ERR_INJECTION_CSP: "Content Security Policy blocked style injection",
                ERR_PERMISSION_REQUIRED: "Permission required: $1",
                ERR_FONT_LOAD: "Failed to load font: $1",
                noUserCssContentOrUrl: "No UserCSS content or URL provided",
                loadingUserCss: "Loading UserCSS...",
                failedToLoadUserCss: "Failed to load UserCSS",
                installSuccess: "Style '$1' installed successfully",
                saveUserCss: "Save UserCSS",
                previewAndInstall: "Preview and install UserCSS styles",
                styleInformation: "Style Information",
                targetDomains: "Target Domains",
                noSpecificDomains: "No specific domains detected",
                codePreview: "Code Preview",
                codePreviewDescription: "Shows the complete UserCSS content including metadata block with variables and CSS rules.",
                installationError: "Installation Error",
                addingToEastyles: "Add to Eastyles",
                installing: "Installing...",
              };

              // Handle substitutions
              if (substitutions) {
                let message = translations[key] || key;
                if (typeof substitutions === 'string') {
                  message = message.replace('$1', substitutions);
                } else if (Array.isArray(substitutions)) {
                  substitutions.forEach((sub, index) => {
                    message = message.replace(`$${index + 1}`, sub);
                  });
                }
                return message;
              }

              return translations[key] || key;
            },
          ),
        getUILanguage: vi.fn().mockReturnValue("en-US"),
      },
    },
  });

  // Mock matchMedia for theme testing
  const mockMatchMedia = vi.fn().mockImplementation((query: string) => {
    const result: MockMediaQueryList = {
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    return result;
  });

  // Assign the mock to global.matchMedia
  Object.defineProperty(global, "matchMedia", {
    writable: true,
    value: mockMatchMedia,
  });

  // Mock the @wxt-dev/storage module
  vi.mock("@wxt-dev/storage", () => {
    const storage = {
      defineItem: vi.fn((key: string, options?: { fallback?: unknown }) => {
        // Initialize watchers for this key if not already done
        if (!watchers[key]) {
          watchers[key] = [];
        }

        // Create a mock storage item
        return {
          getValue: vi.fn(async () => {
            const result = await browser.storage.local.get(key);
            return result[key] ?? options?.fallback;
          }),
          setValue: vi.fn(async (value: unknown) => {
            await browser.storage.local.set({ [key]: value });
          }),
          removeValue: vi.fn(async () => {
            await browser.storage.local.remove(key);
          }),
          clear: vi.fn(async () => {
            await browser.storage.local.clear();
          }),
          watch: vi.fn(
            (callback: (newValue: unknown, oldValue: unknown) => void) => {
              // Store the callback for this key
              watchers[key].push({ callback });

              // Initial call with current value
              void browser.storage.local
                .get(key)
                .then((result: { [key: string]: unknown }) => {
                  const value = result[key] ?? options?.fallback;
                  // Use immediate setTimeout to ensure the callback is processed
                  setTimeout(() => {
                    callback(value, undefined);
                  }, 0);
                })
                .catch((err: unknown) => {
                  console.error("Error in initial watch call:", err as Error);
                });

              // Return unsubscribe function
              return () => {
                const index = watchers[key].findIndex(
                  (w) => w.callback === callback,
                );
                if (index !== -1) {
                  watchers[key].splice(index, 1);
                }
              };
            },
          ),
        };
      }),
    };

    return { storage };
  });
});

// Mock the storage client
vi.mock("@services/storage/client", () => {
  const mockStorageClient = {
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    resetSettings: vi.fn().mockResolvedValue(undefined),
    resetAll: vi.fn().mockResolvedValue(undefined),
    watchSettings: vi.fn().mockImplementation(() => () => {}),
    watchStyles: vi.fn().mockImplementation(() => () => {}),
    getThemeMode: vi.fn().mockResolvedValue("system"),
    setThemeMode: vi.fn().mockResolvedValue(undefined),
    getDebugMode: vi.fn().mockResolvedValue(false),
    setDebugMode: vi.fn().mockResolvedValue(undefined),
    // UserCSS methods
    getUserCSSStyles: vi.fn().mockResolvedValue([]),
    getUserCSSStyle: vi.fn().mockResolvedValue(null),
    addUserCSSStyle: vi.fn().mockResolvedValue(undefined),
    updateUserCSSStyle: vi.fn().mockResolvedValue(undefined),
    removeUserCSSStyle: vi.fn().mockResolvedValue(undefined),
    enableUserCSSStyle: vi.fn().mockResolvedValue(undefined),
    updateUserCSSStyleVariables: vi.fn().mockResolvedValue(undefined),
    watchUserCSSStyles: vi.fn().mockImplementation(() => () => {}),
    // Legacy style methods
    getStyles: vi.fn().mockResolvedValue([]),
    getStyle: vi.fn().mockResolvedValue(null),
    addStyle: vi.fn().mockResolvedValue({
      id: "mock-id",
      name: "Mock Style",
      code: "body { color: red; }",
      enabled: true,
      domains: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    }),
    updateStyle: vi.fn().mockResolvedValue({
      id: "mock-id",
      name: "Updated Style",
      code: "body { color: blue; }",
      enabled: true,
      domains: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    }),
    removeStyle: vi.fn().mockResolvedValue(undefined),
    enableStyle: vi.fn().mockResolvedValue(undefined),
    getMultipleStyles: vi.fn().mockResolvedValue([]),
    updateMultipleStyles: vi.fn().mockResolvedValue(undefined),
    // Import/Export
    exportAll: vi.fn().mockResolvedValue({
      settings: {},
      styles: [],
      userCSSStyles: [],
      timestamp: Date.now(),
      version: "1.0.0",
      exportVersion: "1.0.0",
    }),
    importAll: vi.fn().mockResolvedValue(undefined),
  };

  // Mock EastylesStorageClient class
  const MockEastylesStorageClient = vi.fn().mockImplementation(() => {
    return mockStorageClient;
  });

  return {
    EastylesStorageClient: MockEastylesStorageClient,
    StorageClient: MockEastylesStorageClient, // Add interface for type compatibility
    storageClient: mockStorageClient,
    // Export convenience functions that delegate to the mock
    getSettings: vi
      .fn()
      .mockImplementation(() => mockStorageClient.getSettings()),
    updateSettings: vi
      .fn()
      .mockImplementation((settings) =>
        mockStorageClient.updateSettings(settings),
      ),
    getThemeMode: vi
      .fn()
      .mockImplementation(() => mockStorageClient.getThemeMode()),
    setThemeMode: vi
      .fn()
      .mockImplementation((mode) => mockStorageClient.setThemeMode(mode)),
    getDebugMode: vi
      .fn()
      .mockImplementation(() => mockStorageClient.getDebugMode()),
    setDebugMode: vi
      .fn()
      .mockImplementation((enabled) => mockStorageClient.setDebugMode(enabled)),
    getUserCSSStyles: vi
      .fn()
      .mockImplementation(() => mockStorageClient.getUserCSSStyles()),
    getUserCSSStyle: vi
      .fn()
      .mockImplementation((id) => mockStorageClient.getUserCSSStyle(id)),
    addUserCSSStyle: vi
      .fn()
      .mockImplementation((style) => mockStorageClient.addUserCSSStyle(style)),
    updateUserCSSStyle: vi
      .fn()
      .mockImplementation((id, updates) =>
        mockStorageClient.updateUserCSSStyle(id, updates),
      ),
    removeUserCSSStyle: vi
      .fn()
      .mockImplementation((id) => mockStorageClient.removeUserCSSStyle(id)),
    enableUserCSSStyle: vi
      .fn()
      .mockImplementation((id, enabled) =>
        mockStorageClient.enableUserCSSStyle(id, enabled),
      ),
  };
});

// Clean up mocks and reset storage after each test
afterEach(() => {
  vi.clearAllMocks();
  resetStorage();

  // Clean up DOM completely
  if (typeof document !== "undefined" && document.body) {
    document.body.innerHTML = "";
    // Remove any event listeners or observers
    if (
      typeof document.body.hasChildNodes === "function" &&
      document.body.hasChildNodes()
    ) {
      Array.from(document.body.childNodes).forEach((child) => {
        document.body.removeChild(child);
      });
    }
  }
});

// Setup DOM container for React Testing Library
beforeEach(() => {
  // Ensure document.body exists and is clean
  if (typeof document !== "undefined" && document.body) {
    document.body.innerHTML = "";
  }
});

// Mock the logger module
vi.mock("@services/errors/logger", () => {
  const logger = {
    info: vi.fn().mockReturnValue(undefined),
    error: vi.fn().mockReturnValue(undefined),
    warn: vi.fn().mockReturnValue(undefined),
    debug: vi.fn().mockReturnValue(undefined),
    logError: vi.fn().mockReturnValue(undefined),
    setDebuggingEnabled: vi.fn().mockReturnValue(undefined),
    getLogStats: vi.fn().mockReturnValue({}),
  };
  return { logger };
});

// Mock the ErrorService module
vi.mock("@services/errors/service", async () => {
  const actual = await vi.importActual("@services/errors/service");
  const ErrorService = vi.fn().mockImplementation(() => ({
    handleError: vi.fn(),
    addErrorListener: vi.fn(),
    createRuntimeError: vi.fn(),
    setDebuggingEnabled: vi.fn(),
    getErrorAnalytics: vi.fn(),
  }));
  return {
    ...actual,
    ErrorService,
    errorService: new ErrorService(),
  };
});

// Mock the i18n service
vi.mock("@services/i18n/service", () => {
  const mockI18nService = {
    t: vi.fn().mockImplementation((key: string, substitutions?: string | string[]) => {
      // Return actual translations from en.json
      const translations: Record<string, string> = {
        manager_addUserCss: "Add UserCSS File",
        font_createFontStyle: "Create Font Style",
        font_editStyle: "Edit Font Style",
        applyButton: "Apply",
        appName: "Eastyles",
        appDescription: "Easy web styling for everyone",
        stylesFor: "Styles for",
        manageStyles: "Manage Styles",
        settings: "Settings",
        addNewStyle: "Add New Style",
        saveButton: "Save Style",
        cancelButton: "Cancel",
        closeButton: "Close",
        applying: "Applying...",
        applyToSiteButton: "Apply to Site",
        removeButton: "Remove Style",
        configureButton: "Configure",
        deleteButton: "Delete",
        loading: "Loading...",
        error: "Error",
        success: "Success",
        styleInstalled: "Style saved successfully",
        styleRemoved: "Style removed successfully",
        styleDeleted: "Style deleted successfully",
        noStylesFound: "No styles found",
        dragDropHint: "Drag and drop .user.css file here",
        orClickToBrowse: "or click to browse",
        styleName: "Style Name",
        styleDescription: "Description",
        author: "Author",
        version: "Version",
        domains: "Domains",
        variables: "Variables",
        enabled: "Enabled",
        disabled: "Disabled",
        lastUpdated: "Last Updated",
        installDate: "Install Date",
        font_apply: "Apply Font",
        font_tabs_builtin: "Built-in Fonts",
        font_tabs_custom: "Custom Font",
        font_builtin_description: "Choose from our collection of carefully selected fonts",
        font_custom_description: "Enter the name of a font installed on your system",
        font_custom_inputLabel: "Font Name",
        font_custom_placeholder: "e.g., Arial, Times New Roman, Comic Sans MS",
        font_custom_checkButton: "Check",
        font_custom_previewLabel: "Preview",
        font_custom_available: "Font is available and ready to use",
        font_custom_notAvailable: "Font not found on your system",
        font_categories_sans_serif: "Sans Serif",
        font_categories_serif: "Serif",
        font_categories_monospace: "Monospace",
        font_categories_display: "Display",
        font_categories_handwriting: "Handwriting",
        font_error_emptyName: "Please enter a font name",
        font_error_selectFont: "Please select a font",
        font_error_notAvailable: "Font '$1' is not available on your system",
        font_error_checkFailed: "Failed to check font availability",
        font_error_parseFailed: "Failed to process font style",
        font_error_installFailed: "Failed to install font style",
        font_error_applyFailed: "Failed to apply font",
        font_applied: "Font '$1' applied successfully",
        font_selectLabel: "Select Font",
        font_selectPlaceholder: "Choose a font...",
        font_applyButton: "Apply Font",
        colors_apply: "Apply Colors",
        ERR_STORAGE_QUOTA: "Storage capacity exceeded. Please remove some styles to free up space.",
        ERR_STORAGE_INVALID_DATA: "Invalid storage data: $1",
        ERR_MESSAGE_TIMEOUT: "Message timed out after $1 attempts: $2",
        ERR_MESSAGE_INVALID: "Invalid message: $1",
        ERR_FILE_FORMAT_INVALID: "Invalid file format: $2. Only $1 formats can be accepted",
        ERR_DATA_CORRUPTED: "Data corrupted: $1",
        ERR_BROWSER_API: "Browser API error in $1.$2: $3",
        ERR_PERMISSION_DENIED: "Permission denied: $1",
        ERR_PARSE_METADATA: "Failed to parse style metadata",
        ERR_PREPROCESSOR_COMPILE: "Failed to compile preprocessor code",
        ERR_INJECTION_CSP: "Content Security Policy blocked style injection",
        ERR_PERMISSION_REQUIRED: "Permission required: $1",
        ERR_FONT_LOAD: "Failed to load font: $1",
        noUserCssContentOrUrl: "No UserCSS content or URL provided",
        loadingUserCss: "Loading UserCSS...",
        failedToLoadUserCss: "Failed to load UserCSS",
        installSuccess: "Style '$1' installed successfully",
        saveUserCss: "Save UserCSS",
        previewAndInstall: "Preview and install UserCSS styles",
        styleInformation: "Style Information",
        targetDomains: "Target Domains",
        noSpecificDomains: "No specific domains detected",
        codePreview: "Code Preview",
        codePreviewDescription: "Shows the complete UserCSS content including metadata block with variables and CSS rules.",
        installationError: "Installation Error",
        addingToEastyles: "Add to Eastyles",
        installing: "Installing...",
      };

      // Handle substitutions
      if (substitutions) {
        let message = translations[key] || key;
        if (typeof substitutions === 'string') {
          message = message.replace('$1', substitutions);
        } else if (Array.isArray(substitutions)) {
          substitutions.forEach((sub, index) => {
            message = message.replace(`$${index + 1}`, sub);
          });
        }
        return message;
      }

      return translations[key] || key;
    }),
    hasMessage: vi.fn().mockReturnValue(true),
    clearCache: vi.fn(),
    getCurrentLocale: vi.fn().mockReturnValue("en"),
    getAvailableLocales: vi.fn().mockReturnValue(["en", "id"]),
  };

  const I18nService = vi.fn().mockImplementation(() => mockI18nService);

  return {
    I18nService,
    i18nService: mockI18nService,
  };
});

// Mock iconoir-react icons
vi.mock("iconoir-react", () => ({
  SunLight: () => React.createElement("div", { "data-testid": "sun-icon" }),
  HalfMoon: () => React.createElement("div", { "data-testid": "moon-icon" }),
  Computer: () =>
    React.createElement("div", { "data-testid": "computer-icon" }),
  Trash: () => React.createElement("div", { "data-testid": "trash-icon" }),
  Edit: () => React.createElement("div", { "data-testid": "edit-icon" }),
  Settings: () =>
    React.createElement("div", { "data-testid": "settings-icon" }),
  Upload: () => React.createElement("div", { "data-testid": "upload-icon" }),
  Download: () =>
    React.createElement("div", { "data-testid": "download-icon" }),
  TransitionRight: () =>
    React.createElement("div", { "data-testid": "transition-right-icon" }),
  TextSize: () =>
    React.createElement("div", { "data-testid": "text-size-icon" }),
  ArrowLeft: () =>
    React.createElement("div", { "data-testid": "arrow-left-icon" }),
  Check: () => React.createElement("div", { "data-testid": "check-icon" }),
  Palette: () => React.createElement("div", { "data-testid": "palette-icon" }),
  ViewGrid: () => React.createElement("div", { "data-testid": "view-grid-icon" }),
}));

// Mock the @wxt-dev/browser module
vi.mock("@wxt-dev/browser", () => {
  const mockStorageArea: MockBrowserStorageArea = {
    get: vi.fn(async (keys?: string | string[] | object | null) => {
      if (keys === null || keys === undefined) {
        return { ...storageData };
      }
      if (typeof keys === "string") {
        return { [keys]: storageData[keys] };
      }
      if (Array.isArray(keys)) {
        const result: { [key: string]: unknown } = {};
        for (const key of keys) {
          result[key] = storageData[key];
        }
        return result;
      }
      if (typeof keys === "object") {
        const result: { [key: string]: unknown } = {};
        for (const [key, defaultValue] of Object.entries(keys)) {
          result[key] =
            storageData[key] !== undefined ? storageData[key] : defaultValue;
        }
        return result;
      }
      return {};
    }),
    set: vi.fn(async (items: { [key: string]: unknown }) => {
      Object.assign(storageData, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((key) => {
        delete storageData[key];
      });
    }),
    clear: vi.fn(async () => {
      Object.keys(storageData).forEach((key) => {
        delete storageData[key];
      });
    }),
  };

  return {
    browser: {
      runtime: {
        id: "test-extension-id",
        sendMessage: vi.fn().mockResolvedValue({}),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onConnect: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        getManifest: vi.fn().mockReturnValue({ version: "1.1.0" }),
        onInstalled: {
          addListener: vi.fn(),
        },
      },
      storage: {
        local: mockStorageArea,
        sync: { ...mockStorageArea },
      },
      tabs: {
        query: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
        onRemoved: {
          addListener: vi.fn(),
        },
      },
      i18n: {
        getMessage: vi
          .fn()
          .mockImplementation(
            (key: string, substitutions?: string | string[]) => {
              // Return actual translations from en.json
              const translations: Record<string, string> = {
                manager_addUserCss: "Add UserCSS File",
                font_createFontStyle: "Create Font Style",
                font_editStyle: "Edit Font Style",
                applyButton: "Apply",
                appName: "Eastyles",
                appDescription: "Easy web styling for everyone",
                stylesFor: "Styles for",
                manageStyles: "Manage Styles",
                settings: "Settings",
                addNewStyle: "Add New Style",
                saveButton: "Save Style",
                cancelButton: "Cancel",
                closeButton: "Close",
                applying: "Applying...",
                applyToSiteButton: "Apply to Site",
                removeButton: "Remove Style",
                configureButton: "Configure",
                deleteButton: "Delete",
                loading: "Loading...",
                error: "Error",
                success: "Success",
                styleInstalled: "Style saved successfully",
                styleRemoved: "Style removed successfully",
                styleDeleted: "Style deleted successfully",
                noStylesFound: "No styles found",
                dragDropHint: "Drag and drop .user.css file here",
                orClickToBrowse: "or click to browse",
                styleName: "Style Name",
                styleDescription: "Description",
                author: "Author",
                version: "Version",
                domains: "Domains",
                variables: "Variables",
                enabled: "Enabled",
                disabled: "Disabled",
                lastUpdated: "Last Updated",
                installDate: "Install Date",
                font_apply: "Apply Font",
                font_tabs_builtin: "Built-in Fonts",
                font_tabs_custom: "Custom Font",
                font_builtin_description: "Choose from our collection of carefully selected fonts",
                font_custom_description: "Enter the name of a font installed on your system",
                font_custom_inputLabel: "Font Name",
                font_custom_placeholder: "e.g., Arial, Times New Roman, Comic Sans MS",
                font_custom_checkButton: "Check",
                font_custom_previewLabel: "Preview",
                font_custom_available: "Font is available and ready to use",
                font_custom_notAvailable: "Font not found on your system",
                font_categories_sans_serif: "Sans Serif",
                font_categories_serif: "Serif",
                font_categories_monospace: "Monospace",
                font_categories_display: "Display",
                font_categories_handwriting: "Handwriting",
                font_error_emptyName: "Please enter a font name",
                font_error_selectFont: "Please select a font",
                font_error_notAvailable: "Font '$1' is not available on your system",
                font_error_checkFailed: "Failed to check font availability",
                font_error_parseFailed: "Failed to process font style",
                font_error_installFailed: "Failed to install font style",
                font_error_applyFailed: "Failed to apply font",
                font_applied: "Font '$1' applied successfully",
                font_selectLabel: "Select Font",
                font_selectPlaceholder: "Choose a font...",
                font_applyButton: "Apply Font",
                colors_apply: "Apply Colors",
                ERR_STORAGE_QUOTA: "Storage capacity exceeded. Please remove some styles to free up space.",
                ERR_STORAGE_INVALID_DATA: "Invalid storage data: $1",
                ERR_MESSAGE_TIMEOUT: "Message timed out after $1 attempts: $2",
                ERR_MESSAGE_INVALID: "Invalid message: $1",
                ERR_FILE_FORMAT_INVALID: "Invalid file format: $2. Only $1 formats can be accepted",
                ERR_DATA_CORRUPTED: "Data corrupted: $1",
                ERR_BROWSER_API: "Browser API error in $1.$2: $3",
                ERR_PERMISSION_DENIED: "Permission denied: $1",
                ERR_PARSE_METADATA: "Failed to parse style metadata",
                ERR_PREPROCESSOR_COMPILE: "Failed to compile preprocessor code",
                ERR_INJECTION_CSP: "Content Security Policy blocked style injection",
                ERR_PERMISSION_REQUIRED: "Permission required: $1",
                ERR_FONT_LOAD: "Failed to load font: $1",
                noUserCssContentOrUrl: "No UserCSS content or URL provided",
                loadingUserCss: "Loading UserCSS...",
                failedToLoadUserCss: "Failed to load UserCSS",
                installSuccess: "Style '$1' installed successfully",
                saveUserCss: "Save UserCSS",
                previewAndInstall: "Preview and install UserCSS styles",
                styleInformation: "Style Information",
                targetDomains: "Target Domains",
                noSpecificDomains: "No specific domains detected",
                codePreview: "Code Preview",
                codePreviewDescription: "Shows the complete UserCSS content including metadata block with variables and CSS rules.",
                installationError: "Installation Error",
                addingToEastyles: "Add to Eastyles",
                installing: "Installing...",
              };

              // Handle substitutions
              if (substitutions) {
                let message = translations[key] || key;
                if (typeof substitutions === 'string') {
                  message = message.replace('$1', substitutions);
                } else if (Array.isArray(substitutions)) {
                  substitutions.forEach((sub, index) => {
                    message = message.replace(`$${index + 1}`, sub);
                  });
                }
                return message;
              }

              return translations[key] || key;
            },
          ),
        getUILanguage: vi.fn().mockReturnValue("en-US"),
      },
    },
  };
});
