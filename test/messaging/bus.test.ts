/**
 * Integration tests for MessageBus.
 * Tests complex scenarios that involve multiple components working together.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MessageBus } from "../../services/messaging/bus";
import type { ReceivedMessages } from "../../services/messaging/types";

// Mock the browser API
vi.mock("@wxt-dev/browser", () => ({
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
vi.mock("@wxt-dev/storage", () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

describe("MessageBus Integration", () => {
  let messageBus: MessageBus;
  let originalSetTimeout: typeof window.setTimeout;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Store original timer functions
    originalSetTimeout = window.setTimeout;

    // Setup default mock responses for storage
    const { storage } = await import("@wxt-dev/storage");
    vi.mocked(storage.getItem).mockResolvedValue([] as never[]);
    vi.mocked(storage.setItem).mockResolvedValue(undefined);

    // Setup default mock responses for browser APIs
    const { browser } = await import("@wxt-dev/browser");
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

  describe("Message Queue Processing", () => {
    it("should process messages sequentially", async () => {
      const processOrder: string[] = [];

      // Mock the messageHandlerService
      const originalHandlerService = (
        messageBus as { getHandlerService(): { handleMessage: unknown } }
      ).getHandlerService();
      const mockHandleMessage = vi
        .fn()
        .mockImplementation(async (message: ReceivedMessages) => {
          processOrder.push(message.type);
          await new Promise((resolve) => originalSetTimeout(resolve, 10));
          return { success: true };
        });

      // Replace handleMessage method
      originalHandlerService.handleMessage = mockHandleMessage;

      // Add multiple messages to queue by directly calling handleIncomingMessage
      const messages = [
        { type: "GET_CURRENT_TAB" },
        { type: "TOGGLE_THEME" },
        { type: "GET_ALL_STYLES" },
      ];

      // Simulate incoming messages directly
      messages.forEach((message) => {
        (messageBus as MessageBus).handleIncomingMessage(message, 1);
      });

      // Wait for processing to complete
      await new Promise((resolve) => originalSetTimeout(resolve, 100));

      expect(processOrder).toEqual([
        "GET_CURRENT_TAB",
        "TOGGLE_THEME",
        "GET_ALL_STYLES",
      ]);
      expect(mockHandleMessage).toHaveBeenCalledTimes(3);
    });

    it("should handle errors in message processing", async () => {
      // Mock the messageHandlerService to throw an error
      const originalHandlerService = (
        messageBus as MessageBus
      ).getHandlerService();
      const mockHandleMessage = vi
        .fn()
        .mockRejectedValue(new Error("Handler error"));

      // Replace handleMessage method
      originalHandlerService.handleMessage = mockHandleMessage;

      const message: ReceivedMessages = { type: "GET_CURRENT_TAB" };

      // Simulate incoming message directly
      (messageBus as MessageBus).handleIncomingMessage(message, 1);

      // Wait for processing to complete
      await new Promise((resolve) => originalSetTimeout(resolve, 50));

      // Should have attempted to handle the message
      expect(mockHandleMessage).toHaveBeenCalledWith(message, 1);

      // Should attempt to send error response
      const { browser } = await import("@wxt-dev/browser");
      expect(browser.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });
  });

  describe("End-to-End Scenarios", () => {
    it("should handle message sending to browser APIs", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock browser API to track calls
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockImplementation(() => {
        return Promise.resolve(undefined);
      });

      // Send message
      const promise = messageBus.send(message);

      // Verify that sendMessage was called with correct parameters
      expect(browser.runtime.sendMessage).toHaveBeenCalled();

      // Simulate a response to complete the message flow
      const sentMessage = vi.mocked(browser.runtime.sendMessage).mock
        .calls[0][0] as unknown as { messageId: string };
      const messageId = sentMessage.messageId;
      (messageBus as MessageBus).handleIncomingMessage({
        replyTo: messageId,
        response: { success: true },
      });

      // Should resolve successfully
      await expect(promise).resolves.toEqual({ success: true });
    });
  });

  describe("Error Recovery Integration", () => {
    it("should handle storage failures gracefully", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      const { storage } = await import("@wxt-dev/storage");

      // Mock storage to fail
      vi.mocked(storage.getItem).mockRejectedValue(new Error("Storage error"));
      vi.mocked(storage.setItem).mockRejectedValue(new Error("Storage error"));

      // Should not crash, even with storage failures
      expect(() => {
        messageBus.send(message);
      }).not.toThrow();

      // Should still attempt to send the message
      const { browser } = await import("@wxt-dev/browser");
      expect(browser.runtime.sendMessage).toHaveBeenCalled();
    });

    it("should handle browser API unavailability", async () => {
      const { browser } = await import("@wxt-dev/browser");

      // Temporarily make browser APIs unavailable
      const originalRuntime = browser.runtime;
      const originalTabs = browser.tabs;

      (browser as { runtime?: unknown; tabs?: unknown }).runtime = undefined;
      (browser as { runtime?: unknown; tabs?: unknown }).tabs = undefined;

      // Should handle gracefully without crashing
      expect(() => {
        messageBus.send({ type: "GET_CURRENT_TAB" });
      }).not.toThrow();

      // Restore browser APIs
      (browser as { runtime: unknown; tabs: unknown }).runtime =
        originalRuntime;
      (browser as { runtime: unknown; tabs: unknown }).tabs = originalTabs;
    });
  });

  describe("Cleanup and Validation", () => {
    it("should validate all registered handlers", () => {
      const result = messageBus.validateHandlers();

      expect(result).toEqual({
        isValid: expect.any(Boolean),
        missingHandlers: expect.any(Array),
      });
    });

    it("should cleanup resources properly", () => {
      // Should cleanup without errors
      expect(() => {
        messageBus.cleanup();
      }).not.toThrow();
    });

    it("should maintain basic functionality", () => {
      // Should still be functional
      expect(messageBus.getOnlineStatus()).toBe(true);
      expect(messageBus.getPendingMessageCount()).toBe(0);
    });
  });
});
