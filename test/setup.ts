/// <reference types="../.wxt/wxt.d.ts" />
// test/setup.ts - Enhanced version with proper WXT storage mocking
// This file sets up the testing environment for Vitest

import { vi, beforeAll, afterEach } from "vitest";

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
vi.mock("@services/storage/client", async () => {
  const actual = await vi.importActual("@services/storage/client");
  return {
    ...actual,
    storageClient: {
      getSettings: vi.fn().mockResolvedValue({}),
      updateSettings: vi.fn().mockResolvedValue(undefined),
      resetSettings: vi.fn().mockResolvedValue(undefined),
      watchSettings: vi.fn(),
    },
  };
});

// Clean up mocks and reset storage after each test
afterEach(() => {
  vi.clearAllMocks();
  resetStorage();
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
