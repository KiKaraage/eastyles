// test/setup.ts
// This file sets up the testing environment for Vitest

// Mock browser APIs that are commonly used in the extension
// but not available in the test environment
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

beforeAll(() => {
  // Mock browser API with proper types
  const mockBrowser: MockBrowser = {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      },
      sync: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      },
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
    value: mockBrowser,
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
});

// Clean up mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
