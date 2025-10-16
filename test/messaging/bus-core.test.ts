/**
 * Unit tests for MessageBus core functionality.
 * Tests basic message sending and broadcasting operations.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBus } from "../../services/messaging/bus";
import type {
  ReceivedMessages,
  SentMessages,
} from "../../services/messaging/types";

// Mock the browser API
vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
      },
      getPlatformInfo: vi.fn().mockResolvedValue({ os: "linux" }),
      id: "test-extension",
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
        get: vi.fn(),
        set: vi.fn(),
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

describe("MessageBus Core", () => {
  let messageBus: MessageBus;
  let originalSetTimeout: typeof window.setTimeout;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Store original timer functions
    originalSetTimeout = window.setTimeout;

    // Setup default mock responses for storage
    const { storage } = await import("wxt/utils/storage");
    vi.mocked(storage.getItem).mockResolvedValue([]);
    vi.mocked(storage.setItem).mockResolvedValue(undefined);

    // Setup default mock responses for browser APIs
    const { browser } = await import("wxt/browser");
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValue(undefined);
    vi.mocked(browser.tabs.query).mockResolvedValue([] as unknown as never);

    // Create a fresh MessageBus instance
    messageBus = new MessageBus();
  });

  afterEach(() => {
    // Restore original timers
    window.setTimeout = originalSetTimeout;

    // Cleanup the message bus
    messageBus.cleanup();
  });

  describe("Message Sending", () => {
    it("should send message successfully", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock successful response
      const mockResponse = { success: true };
      const { browser } = await import("wxt/browser");

      // Start sending the message
      const resultPromise = messageBus.send(message);

      // Wait for next tick to let the message be sent
      await new Promise((resolve) => originalSetTimeout(resolve, 0));

      // Get the sent message to extract messageId
      expect(browser.runtime.sendMessage).toHaveBeenCalled();
      const sentMessage = vi.mocked(browser.runtime.sendMessage).mock
        .calls[0][0] as unknown as { messageId: string };
      const messageId = sentMessage.messageId;

      // Simulate the incoming response by calling handleIncomingMessage directly
      (messageBus as MessageBus).handleIncomingMessage({
        replyTo: messageId,
        response: mockResponse,
      });

      const result = await resultPromise;
      expect(result).toEqual(mockResponse);
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "GET_CURRENT_TAB",
          messageId: expect.any(String),
        }),
      );
    });

    it("should send message to specific tab", async () => {
      const message: ReceivedMessages = {
        type: "TOGGLE_THEME",
      };
      // Mock successful response
      const tabId = 123;
      const mockResponse = { success: true };
      const { browser } = await import("wxt/browser");

      const resultPromise = messageBus.send(message, tabId);

      // Wait for next tick to let the message be sent
      await new Promise((resolve) => originalSetTimeout(resolve, 0));

      // Get the sent message to extract messageId
      expect(browser.tabs.sendMessage).toHaveBeenCalled();
      const sentMessage = vi.mocked(browser.tabs.sendMessage).mock
        .calls[0][1] as unknown as { messageId: string };
      const messageId = sentMessage.messageId;

      // Simulate the incoming response by calling handleIncomingMessage directly
      (messageBus as MessageBus).handleIncomingMessage({
        replyTo: messageId,
        response: mockResponse,
      });

      const result = await resultPromise;
      expect(result).toEqual(mockResponse);
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        expect.objectContaining({
          type: "TOGGLE_THEME",
          messageId: expect.any(String),
        }),
      );
    });
  });

  describe("Broadcasting", () => {
    it("should broadcast message to all listeners", async () => {
      const message: SentMessages = {
        type: "STORAGE_UPDATED",
        payload: {
          key: "errors",
          newValue: {
            message: "Test error",
            source: "background",
            timestamp: Date.now(),
            severity: "high",
          },
          oldValue: null,
        },
      };

      const { browser } = await import("wxt/browser");
      vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);

      await messageBus.broadcast(message);

      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(message);
    });

    it("should handle broadcast failures", async () => {
      const message: SentMessages = {
        type: "STORAGE_UPDATED",
        payload: {
          key: "errors",
          newValue: {
            message: "Test error",
            source: "background",
            timestamp: Date.now(),
            severity: "high",
          },
          oldValue: null,
        },
      };

      const { browser } = await import("wxt/browser");
      vi.mocked(browser.runtime.sendMessage).mockRejectedValue(
        new Error("Broadcast failed"),
      );

      await expect(messageBus.broadcast(message)).rejects.toThrow(
        "Broadcast failed",
      );
    });
  });
  describe("Utility Methods", () => {
    it("should track pending message count", () => {
      expect(messageBus.getPendingMessageCount()).toBe(0);

      // Start a message (won't complete without response)
      messageBus.send({ type: "GET_CURRENT_TAB" });

      expect(messageBus.getPendingMessageCount()).toBe(1);
    });

    it("should report online status", () => {
      expect(messageBus.getOnlineStatus()).toBe(true);

      // Access private property for testing
      (messageBus as unknown as { isOnline: boolean }).isOnline = false;
      expect(messageBus.getOnlineStatus()).toBe(false);
    });
  });
});
