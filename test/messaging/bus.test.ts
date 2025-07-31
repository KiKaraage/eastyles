/**
 * Unit tests for MessageBus timeout and retry logic.
 * Tests the message sending, queuing, and error handling mechanisms.
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
    },
    tabs: {
      sendMessage: vi.fn(),
      query: vi.fn(),
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

describe("MessageBus", () => {
  let messageBus: MessageBus;
  let originalSetTimeout: typeof window.setTimeout;
  let originalClearTimeout: typeof window.clearTimeout;
  let originalSetInterval: typeof window.setInterval;
  let originalClearInterval: typeof window.clearInterval;
  let mockSetTimeout: ReturnType<typeof vi.fn>;
  let mockClearTimeout: ReturnType<typeof vi.fn>;
  let mockSetInterval: ReturnType<typeof vi.fn>;
  let mockClearInterval: ReturnType<typeof vi.fn>;
  let timeoutCallbacks: Map<number, () => void>;
  let nextTimeoutId: number;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Store original timer functions
    originalSetTimeout = window.setTimeout;
    originalClearTimeout = window.clearTimeout;
    originalSetInterval = window.setInterval;
    originalClearInterval = window.clearInterval;

    // Initialize timeout tracking
    timeoutCallbacks = new Map();
    nextTimeoutId = 1;

    // Mock window timer functions for timing control
    mockSetTimeout = vi
      .fn()
      .mockImplementation((callback: () => void, delay: number) => {
        const id = nextTimeoutId++;
        timeoutCallbacks.set(id, callback);
        return id;
      });
    mockClearTimeout = vi.fn().mockImplementation((id: number) => {
      timeoutCallbacks.delete(id);
    });
    mockSetInterval = vi.fn().mockReturnValue(nextTimeoutId++);
    mockClearInterval = vi.fn();

    window.setTimeout = mockSetTimeout as unknown as typeof window.setTimeout;
    window.clearTimeout =
      mockClearTimeout as unknown as typeof window.clearTimeout;
    window.setInterval =
      mockSetInterval as unknown as typeof window.setInterval;
    window.clearInterval =
      mockClearInterval as unknown as typeof window.clearInterval;

    // Get mocked modules
    const { browser } = await import("@wxt-dev/browser");
    const { storage } = await import("@wxt-dev/storage");

    // Setup browser object structure
    if (!browser.runtime) {
      browser.runtime = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      } as unknown as typeof browser.runtime;
    } else {
      browser.runtime.sendMessage = vi.fn().mockResolvedValue(undefined);
    }

    if (!browser.tabs) {
      browser.tabs = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue([]),
      } as unknown as typeof browser.tabs;
    } else {
      browser.tabs.sendMessage = vi.fn().mockResolvedValue(undefined);
      browser.tabs.query = vi.fn().mockResolvedValue([]);
    }

    // Setup default mock responses
    vi.mocked(storage.getItem).mockResolvedValue([]);
    vi.mocked(storage.setItem).mockResolvedValue(undefined);

    // Create a fresh MessageBus instance
    messageBus = new MessageBus();
  });

  afterEach(() => {
    // Restore original timers
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
    window.setInterval = originalSetInterval;
    window.clearInterval = originalClearInterval;

    // Cleanup the message bus
    messageBus.cleanup();
  });

  // Helper function to trigger timeouts manually
  const triggerTimeout = (timeoutId: number) => {
    const callback = timeoutCallbacks.get(timeoutId);
    if (callback) {
      timeoutCallbacks.delete(timeoutId);
      callback();
    }
  };

  describe("Message Sending", () => {
    it("should send message successfully", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock successful response
      const mockResponse = { success: true };
      const { browser } = await import("@wxt-dev/browser");

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
      (messageBus as any).handleIncomingMessage({
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
      const { browser } = await import("@wxt-dev/browser");

      const resultPromise = messageBus.send(message, tabId);

      // Wait for next tick to let the message be sent
      await new Promise((resolve) => originalSetTimeout(resolve, 0));

      // Get the sent message to extract messageId
      expect(browser.tabs.sendMessage).toHaveBeenCalled();
      const sentMessage = vi.mocked(browser.tabs.sendMessage).mock
        .calls[0][1] as unknown as { messageId: string };
      const messageId = sentMessage.messageId;

      // Simulate the incoming response by calling handleIncomingMessage directly
      (messageBus as any).handleIncomingMessage({
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

  describe("Timeout Mechanism", () => {
    it.skip("should timeout after default timeout period", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Restore real setTimeout temporarily to test actual timeout behavior
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;

      // Mock browser sendMessage to never respond
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const start = Date.now();

      // This should timeout after 5 seconds (default timeout) * 3 retries
      await expect(messageBus.send(message)).rejects.toThrow(
        "Message timeout after 3 attempts: GET_CURRENT_TAB",
      );

      const elapsed = Date.now() - start;
      // Should take at least 5 seconds for the first timeout
      expect(elapsed).toBeGreaterThanOrEqual(4900);

      // Restore mocks
      window.setTimeout = mockSetTimeout as unknown as typeof window.setTimeout;
      window.clearTimeout =
        mockClearTimeout as unknown as typeof window.clearTimeout;
    }, 20000);

    it("should clear timeout on successful response", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      const mockResponse = { success: true };

      const resultPromise = messageBus.send(message);

      // Wait for next tick to let the message be sent
      await new Promise((resolve) => originalSetTimeout(resolve, 0));

      // Get the sent message to extract messageId
      const { browser } = await import("@wxt-dev/browser");
      expect(browser.runtime.sendMessage).toHaveBeenCalled();
      const sentMessage = vi.mocked(browser.runtime.sendMessage).mock
        .calls[0][0] as unknown as { messageId: string };
      const messageId = sentMessage.messageId;

      // Simulate the incoming response by calling handleIncomingMessage directly
      (messageBus as any).handleIncomingMessage({
        replyTo: messageId,
        response: mockResponse,
      });

      const result = await resultPromise;

      expect(result).toEqual(mockResponse);
      expect(mockClearTimeout).toHaveBeenCalled();
    });
  });

  describe("Retry Logic", () => {
    it.skip("should retry failed messages up to max retries", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Restore real setTimeout temporarily to test actual retry behavior
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;

      // Mock browser sendMessage to never respond
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockImplementation(
        () => new Promise(() => {}), // Never resolves
      );

      const start = Date.now();

      await expect(messageBus.send(message)).rejects.toThrow(
        "Message timeout after 3 attempts: GET_CURRENT_TAB",
      );

      const elapsed = Date.now() - start;
      // Should take at least 5 seconds for initial timeout
      expect(elapsed).toBeGreaterThanOrEqual(4900);

      // Restore mocks
      window.setTimeout = mockSetTimeout as unknown as typeof window.setTimeout;
      window.clearTimeout =
        mockClearTimeout as unknown as typeof window.clearTimeout;
    }, 20000);

    it("should stop retrying on successful response", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      const mockResponse = { success: true };

      const resultPromise = messageBus.send(message);

      // Wait for next tick to let the message be sent
      await new Promise((resolve) => originalSetTimeout(resolve, 0));

      // Get the sent message to extract messageId
      const { browser } = await import("@wxt-dev/browser");
      expect(browser.runtime.sendMessage).toHaveBeenCalled();
      const sentMessage = vi.mocked(browser.runtime.sendMessage).mock
        .calls[0][0] as unknown as { messageId: string };
      const messageId = sentMessage.messageId;

      // Trigger first timeout to simulate retry scenario
      const activeTimeoutIds = Array.from(timeoutCallbacks.keys());
      if (activeTimeoutIds.length > 0) {
        triggerTimeout(activeTimeoutIds[0]);
        await new Promise((resolve) => originalSetTimeout(resolve, 10));
      }

      // Now simulate successful response during retry
      (messageBus as any).handleIncomingMessage({
        replyTo: messageId,
        response: mockResponse,
      });

      const result = await resultPromise;
      expect(result).toEqual(mockResponse);
      expect(mockClearTimeout).toHaveBeenCalled();
    });
  });

  describe("Message Queue Processing", () => {
    it("should process messages sequentially", async () => {
      const processOrder: string[] = [];

      // Mock the messageHandlerService
      const originalHandlerService = (messageBus as any).getHandlerService();
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
      // Note: For GET_CURRENT_TAB and TOGGLE_THEME, validation expects empty objects
      const messages = [
        { type: "GET_CURRENT_TAB" },
        { type: "TOGGLE_THEME" },
        { type: "GET_ALL_STYLES" },
      ];

      // Simulate incoming messages directly
      messages.forEach((message) => {
        (messageBus as any).handleIncomingMessage(message, 1);
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
      const originalHandlerService = (messageBus as any).getHandlerService();
      const mockHandleMessage = vi
        .fn()
        .mockRejectedValue(new Error("Handler error"));

      // Replace handleMessage method
      originalHandlerService.handleMessage = mockHandleMessage;

      const message: ReceivedMessages = { type: "GET_CURRENT_TAB" };

      // Simulate incoming message directly
      (messageBus as any).handleIncomingMessage(message, 1);

      // Wait for processing to complete
      await new Promise((resolve) => originalSetTimeout(resolve, 50));

      // Should have attempted to handle the message
      expect(mockHandleMessage).toHaveBeenCalledWith(message, 1);

      // Should attempt to send error response (browser.tabs.query is called as part of sendError)
      const { browser } = await import("@wxt-dev/browser");
      expect(browser.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });
  });

  describe("Offline Message Queue", () => {
    it("should store messages when offline", async () => {
      // Set bus to offline state
      (messageBus as unknown as { isOnline: boolean }).isOnline = false;

      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      await expect(messageBus.sendWithOfflineSupport(message)).rejects.toThrow(
        "Extension is offline - message queued for later delivery",
      );

      // Should have stored the message
      const { storage } = await import("@wxt-dev/storage");
      expect(storage.setItem).toHaveBeenCalledWith(
        "local:offlineMessages",
        expect.arrayContaining([
          expect.objectContaining({
            message,
            timestamp: expect.any(Number),
            retries: 0,
          }),
        ]),
      );
    });

    it("should process offline messages when coming back online", async () => {
      const offlineMessages = [
        {
          id: "test-msg",
          message: { type: "GET_CURRENT_TAB" } as ReceivedMessages,
          tabId: undefined,
          timestamp: Date.now(),
          retries: 0,
        },
      ];

      const { storage } = await import("@wxt-dev/storage");
      const { browser } = await import("@wxt-dev/browser");

      // Mock offline messages in storage
      vi.mocked(storage.getItem).mockResolvedValue(offlineMessages);

      // Mock successful send response to avoid timeout
      const mockSendSpy = vi
        .spyOn(messageBus, "send")
        .mockResolvedValue({ success: true });

      // Set bus to online state
      (messageBus as unknown as { isOnline: boolean }).isOnline = true;

      await (
        messageBus as unknown as { processOfflineMessages: () => Promise<void> }
      ).processOfflineMessages();

      // Should have attempted to send the queued message
      expect(mockSendSpy).toHaveBeenCalledWith(
        offlineMessages[0].message,
        undefined,
      );

      // Should have removed processed message from storage
      expect(storage.setItem).toHaveBeenCalledWith("local:offlineMessages", []);

      mockSendSpy.mockRestore();
    });

    it("should cleanup old offline messages", async () => {
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const recentTimestamp = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago

      const offlineMessages = [
        {
          id: "old-msg",
          message: { type: "GET_CURRENT_TAB" } as ReceivedMessages,
          timestamp: oldTimestamp,
          retries: 0,
        },
        {
          id: "recent-msg",
          message: { type: "TOGGLE_THEME" } as ReceivedMessages,
          timestamp: recentTimestamp,
          retries: 0,
        },
      ];

      const { storage } = await import("@wxt-dev/storage");
      vi.mocked(storage.getItem).mockResolvedValue(offlineMessages);

      const result = await (
        messageBus as unknown as {
          getOfflineMessages: () => Promise<unknown[]>;
        }
      ).getOfflineMessages();

      // Should only return recent message (old one filtered out)
      expect(Array.isArray(result) ? result : []).toHaveLength(1);
      if (Array.isArray(result)) {
        expect((result[0] as { id: string }).id).toBe("recent-msg");
      }
    });
  });

  describe("Broadcasting", () => {
    it("should broadcast message to all listeners", async () => {
      const message = {
        type: "STORAGE_UPDATED" as const,
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

      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);

      await messageBus.broadcast(message);

      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(message);
    });

    it("should handle broadcast failures", async () => {
      const message = {
        type: "STORAGE_UPDATED" as const,
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

      const { browser } = await import("@wxt-dev/browser");
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

      (messageBus as unknown as { isOnline: boolean }).isOnline = false;
      expect(messageBus.getOnlineStatus()).toBe(false);
    });

    it("should get offline message count", async () => {
      const offlineMessages = [
        {
          id: "msg-1",
          message: { type: "GET_CURRENT_TAB" } as ReceivedMessages,
          timestamp: Date.now(),
          retries: 0,
        },
        {
          id: "msg-2",
          message: { type: "TOGGLE_THEME" } as ReceivedMessages,
          timestamp: Date.now(),
          retries: 0,
        },
      ];

      const { storage } = await import("@wxt-dev/storage");
      vi.mocked(storage.getItem).mockResolvedValue(offlineMessages);

      const count = await messageBus.getOfflineMessageCount();
      expect(count).toBe(2);
    });

    it("should clear offline messages", async () => {
      const { storage } = await import("@wxt-dev/storage");
      await messageBus.clearOfflineMessages();

      expect(storage.setItem).toHaveBeenCalledWith("local:offlineMessages", []);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid messages gracefully", async () => {
      const invalidMessage = { invalid: "message" };

      const { browser } = await import("@wxt-dev/browser");
      const messageListener = vi.mocked(browser.runtime.onMessage.addListener)
        .mock.calls[0]?.[0];
      if (messageListener) {
        const result = messageListener(
          invalidMessage,
          {
            tab: {
              id: 1,
              index: 0,
              pinned: false,
              highlighted: false,
              windowId: 1,
              active: true,
              url: "https://example.com",
              title: "Test Tab",
              favIconUrl: "",
              incognito: false,
              selected: false,
              discarded: false,
              autoDiscardable: true,
              groupId: -1,
              frozen: false,
            },
          },
          vi.fn(),
        );
        expect(result).toBe(true);
      }

      // Should attempt to send error response
      expect(browser.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });

    it.skip("should handle browser API failures", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Restore real setTimeout temporarily to test actual behavior
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;

      // Mock browser API to fail
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockRejectedValue(
        new Error("API Error"),
      );

      await expect(messageBus.send(message)).rejects.toThrow(
        "Message timeout after 3 attempts: GET_CURRENT_TAB",
      );

      // Restore mocks
      window.setTimeout = mockSetTimeout as unknown as typeof window.setTimeout;
      window.clearTimeout =
        mockClearTimeout as unknown as typeof window.clearTimeout;
    }, 20000);
  });
});
