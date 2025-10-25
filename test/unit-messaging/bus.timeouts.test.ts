/**
 * Smoke tests for MessageBus basic functionality.
 * Tests basic method availability without complex scenarios.
 */

import { MessageBus } from "@services/messaging/bus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the browser API
vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
      },
      getPlatformInfo: vi.fn().mockResolvedValue({ os: "linux" }),
    },
    tabs: {
      sendMessage: vi.fn(),
      query: vi.fn().mockResolvedValue([]),
      onRemoved: {
        addListener: vi.fn(),
      },
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

// Mock the storage API
vi.mock("wxt/utils/storage", () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

describe("MessageBus Smoke Tests", () => {
  let messageBus: MessageBus;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get mocked modules
    const { storage } = await import("wxt/utils/storage");

    // Setup default mock responses
    vi.mocked(storage.getItem).mockResolvedValue([]);
    vi.mocked(storage.setItem).mockResolvedValue(undefined);

    // Create a fresh MessageBus instance
    messageBus = new MessageBus();
  });

  afterEach(() => {
    // Cleanup the message bus
    messageBus.cleanup();
  });

  describe("Basic Method Availability", () => {
    it("should have basic methods available", () => {
      expect(typeof messageBus.send).toBe("function");
      expect(typeof messageBus.broadcast).toBe("function");
      expect(typeof messageBus.handleIncomingMessage).toBe("function");
    });

    it("should have utility methods available", () => {
      expect(typeof messageBus.getPendingMessageCount).toBe("function");
      expect(typeof messageBus.getOnlineStatus).toBe("function");
      expect(typeof messageBus.getOfflineMessageCount).toBe("function");
      expect(typeof messageBus.clearOfflineMessages).toBe("function");
      expect(typeof messageBus.cleanup).toBe("function");
      expect(typeof messageBus.validateHandlers).toBe("function");
    });

    it("should have offline support methods", () => {
      expect(
        typeof (messageBus as MessageBus & { sendWithOfflineSupport: unknown })
          .sendWithOfflineSupport,
      ).toBe("function");
    });

    it("should initialize with default state", () => {
      expect(messageBus.getPendingMessageCount()).toBe(0);
      expect(messageBus.getOnlineStatus()).toBe(true);
      expect(typeof messageBus.validateHandlers()).toBe("object");
    });

    it("should cleanup without errors", () => {
      expect(() => messageBus.cleanup()).not.toThrow();
    });
  });
});
