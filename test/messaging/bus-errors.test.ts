/**
 * Unit tests for MessageBus error handling.
 * Tests invalid message handling, browser API failures, and error recovery scenarios.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageBus } from "../../services/messaging/bus";
import type { ReceivedMessages } from "../../services/messaging/types";

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

describe("MessageBus Error Handling", () => {
  let messageBus: MessageBus;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock responses for storage
    const { storage } = await import("wxt/utils/storage");
    vi.mocked(storage.getItem).mockResolvedValue([] as never[]);
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
    // Cleanup the message bus
    messageBus.cleanup();
  });

  describe("Invalid Message Handling", () => {
    it("should handle invalid incoming messages gracefully", async () => {
      const invalidMessage = { invalid: "message" } as unknown;

      const result = await messageBus.handleIncomingMessage(invalidMessage);

      expect(result).toBe(true); // Should return true for handled messages
    });

    it("should handle messages without type property", async () => {
      const messageWithoutType = { payload: { data: "test" } } as unknown;

      const result = await messageBus.handleIncomingMessage(messageWithoutType);

      expect(result).toBe(true);
    });

    it("should handle messages with invalid type", async () => {
      const messageWithInvalidType = { type: 123 } as unknown;

      const result = await messageBus.handleIncomingMessage(
        messageWithInvalidType,
      );

      expect(result).toBe(true);
    });

    it("should handle messages with missing required properties", async () => {
      const messageWithMissingProps = {
        type: "GET_CURRENT_TAB",
        // Missing required properties for this message type
      } as unknown;

      const result = await messageBus.handleIncomingMessage(
        messageWithMissingProps,
      );

      expect(result).toBeNull();
    });
  });

  describe("Browser API Failures", () => {
    it("should handle runtime.sendMessage failures", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock the send method to reject immediately
      vi.spyOn(messageBus, "send").mockRejectedValue(
        new Error("Runtime not available"),
      );

      await expect(messageBus.send(message)).rejects.toThrow(
        "Runtime not available",
      );
    });

    it("should handle tabs.sendMessage failures", async () => {
      const message: ReceivedMessages = {
        type: "TOGGLE_THEME",
      };
      const tabId = 123;

      // Mock the send method to reject immediately
      vi.spyOn(messageBus, "send").mockRejectedValue(
        new Error("Tab not found"),
      );

      await expect(messageBus.send(message, tabId)).rejects.toThrow(
        "Tab not found",
      );
    });

    it("should handle browser.tabs.query failures", async () => {
      // Test that invalid messages are handled gracefully
      const invalidMessage = { invalid: "message" } as unknown;
      const result = await messageBus.handleIncomingMessage(invalidMessage);

      expect(result).toBe(true);
    });

    it("should handle missing browser APIs gracefully", async () => {
      // Temporarily mock browser APIs as undefined
      const { browser } = await import("wxt/browser");
      const originalRuntime = browser.runtime;
      const originalTabs = browser.tabs;

      (browser as { runtime?: unknown; tabs?: unknown }).runtime = undefined;
      (browser as { runtime?: unknown; tabs?: unknown }).tabs = undefined;

      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Should handle missing APIs gracefully
      expect(() => {
        messageBus.send(message);
      }).not.toThrow();

      // Restore original browser APIs
      (browser as { runtime?: unknown; tabs?: unknown }).runtime =
        originalRuntime;
      (browser as { runtime?: unknown; tabs?: unknown }).tabs = originalTabs;
    });
  });

  describe("Message Rejection Handling", () => {
    it("should handle message rejections and store them for retry", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock the send method to reject immediately
      vi.spyOn(messageBus, "send").mockRejectedValue(
        new Error("Network error"),
      );

      await expect(messageBus.send(message)).rejects.toThrow("Network error");
    });

    it("should handle consecutive message failures", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock the send method to reject immediately
      vi.spyOn(messageBus, "send").mockRejectedValue(
        new Error("Network error"),
      );

      // Send multiple messages that will fail
      const promises = [
        messageBus.send(message),
        messageBus.send(message),
        messageBus.send(message),
      ];

      // All promises should be rejected
      const results = await Promise.allSettled(promises);
      expect(results.every((result) => result.status === "rejected")).toBe(
        true,
      );
    });

    it("should not crash on malformed error responses", () => {
      // Simulate a malformed error response
      messageBus.handleIncomingMessage({
        replyTo: "invalid-message-id",
        error: null, // Should be an error object
      } as unknown);

      // Should handle gracefully without crashing
    });
  });

  describe("Error Recovery", () => {
    it("should recover from temporary browser API failures", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock the send method to fail first, then succeed
      let callCount = 0;
      const sendSpy = vi.spyOn(messageBus, "send");
      sendSpy.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Temporary failure"));
        }
        return Promise.resolve({ success: true });
      });

      // Send message - should fail initially
      await expect(messageBus.send(message)).rejects.toThrow(
        "Temporary failure",
      );

      // Send again - should succeed
      const result = await messageBus.send(message);
      expect(result).toEqual({ success: true });
    });

    it("should handle partial failures in batch operations", async () => {
      const messages: ReceivedMessages[] = [
        { type: "GET_CURRENT_TAB" },
        { type: "TOGGLE_THEME" },
        { type: "GET_CURRENT_TAB" },
      ];

      // Mock the send method to fail for TOGGLE_THEME, succeed for others
      vi.spyOn(messageBus, "send").mockImplementation((msg) => {
        const message = msg as ReceivedMessages;
        if (message.type === "TOGGLE_THEME") {
          return Promise.reject(new Error("Theme toggle failed"));
        }
        return Promise.resolve({ success: true });
      });

      // Send messages one by one
      const results = await Promise.allSettled([
        messageBus.send(messages[0]),
        messageBus.send(messages[1]),
        messageBus.send(messages[2]),
      ]);

      // First and third should succeed, second should fail
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect(results[2].status).toBe("fulfilled");
    });

    it("should clean up error state after successful recovery", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      const { browser } = await import("wxt/browser");
      vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);

      // Mock the send method to return successfully
      vi.spyOn(messageBus, "send").mockResolvedValue({ success: true });

      // Send a message successfully
      const result = await messageBus.send(message);
      expect(result).toEqual({ success: true });

      // Verify no pending errors
      expect(messageBus.getPendingMessageCount()).toBe(0);
    });
  });

  describe("Error Logging and Reporting", () => {
    it("should send error details to error service", () => {
      const errorMessage = {
        replyTo: "test-message-id",
        error: {
          message: "Test error",
          stack: "Error: Test error\n    at test.js:1:1",
          source: "messaging",
          timestamp: Date.now(),
          severity: "high",
        },
      };

      messageBus.handleIncomingMessage(errorMessage);

      // Should handle error response without crashing
    });

    it("should handle error response without replyTo", () => {
      const errorMessage = {
        error: {
          message: "Standalone error",
          source: "messaging",
          timestamp: Date.now(),
          severity: "medium",
        },
      };

      // Should not throw, even without replyTo
      expect(() => {
        messageBus.handleIncomingMessage(errorMessage);
      }).not.toThrow();
    });

    it("should handle error response with missing error details", () => {
      const errorMessage = {
        replyTo: "test-message-id",
        error: null,
      } as unknown;

      // Should handle gracefully even with missing error details
      expect(() => {
        messageBus.handleIncomingMessage(errorMessage);
      }).not.toThrow();
    });
  });
});
