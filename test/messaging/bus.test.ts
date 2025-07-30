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
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;
  let mockSetTimeout: ReturnType<typeof vi.fn>;
  let mockClearTimeout: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock setTimeout and clearTimeout for timing control
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;
    mockSetTimeout = vi.fn();
    mockClearTimeout = vi.fn();
    global.setTimeout = mockSetTimeout as unknown as typeof setTimeout;
    global.clearTimeout = mockClearTimeout as unknown as typeof clearTimeout;

    // Get mocked modules
    const { browser } = await import("@wxt-dev/browser");
    const { storage } = await import("@wxt-dev/storage");

    // Setup default mock responses
    vi.mocked(storage.getItem).mockResolvedValue([]);
    vi.mocked(storage.setItem).mockResolvedValue(undefined);
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);
    vi.mocked(browser.tabs.sendMessage).mockResolvedValue(undefined);
    vi.mocked(browser.tabs.query).mockResolvedValue(undefined);

    // Create a fresh MessageBus instance
    messageBus = new MessageBus();
  });

  afterEach(() => {
    // Restore original timers
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

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
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);

      const result = await messageBus.send(message);

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
      const tabId = 456;

      const mockResponse = undefined;
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.tabs.sendMessage).mockResolvedValue(mockResponse);

      const result = await messageBus.send(message, tabId);

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
    it("should timeout after default timeout period", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock that the message never receives a response
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockImplementation(
        () => new Promise(() => {}),
      );

      const sendPromise = messageBus.send(message);

      // Verify timeout was set
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);

      // Simulate timeout
      const timeoutCallback = mockSetTimeout.mock.calls[0][0];
      expect(timeoutCallback).toBeDefined();
      timeoutCallback();

      await expect(sendPromise).rejects.toThrow(
        "Message timeout after 3 attempts: GET_CURRENT_TAB",
      );
    });

    it("should clear timeout on successful response", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      const mockResponse = { success: true };
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);

      // Mock the message listener to simulate receiving a response
      const messageListener = vi.mocked(browser.runtime.onMessage.addListener)
        .mock.calls[0]?.[0];
      if (messageListener) {
        // Simulate response after some delay
        setTimeout(() => {
          messageListener(
            { replyTo: "message-0", response: mockResponse },
            { tab: undefined },
            vi.fn(),
          );
        }, 100);
      }

      const result = await messageBus.send(message);

      expect(result).toEqual(mockResponse);
      expect(mockClearTimeout).toHaveBeenCalled();
    });
  });

  describe("Retry Logic", () => {
    it("should retry failed messages up to max retries", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock network error
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockRejectedValue(
        new Error("Network error"),
      );

      const sendPromise = messageBus.send(message);

      // Simulate first timeout (retry 1)
      let timeoutCallback = mockSetTimeout.mock.calls[0][0];
      timeoutCallback();

      // Should set up retry with exponential backoff
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 10000); // 2^1 * 5000

      // Simulate second timeout (retry 2)
      timeoutCallback = mockSetTimeout.mock.calls[1][0];
      timeoutCallback();

      // Should set up another retry
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 20000); // 2^2 * 5000

      // Simulate third timeout (max retries reached)
      timeoutCallback = mockSetTimeout.mock.calls[2][0];
      timeoutCallback();

      await expect(sendPromise).rejects.toThrow(
        "Message timeout after 3 attempts: GET_CURRENT_TAB",
      );
    });

    it("should stop retrying on successful response", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      const mockResponse = { success: true };

      // First call fails, second succeeds
      let callCount = 0;
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve(mockResponse);
      });

      void messageBus.send(message);

      // Simulate first timeout to trigger retry
      const timeoutCallback = mockSetTimeout.mock.calls[0][0];
      expect(timeoutCallback).toBeDefined();

      // Mock successful response on retry
      const messageListener = vi.mocked(browser.runtime.onMessage.addListener)
        .mock.calls[0]?.[0];
      if (messageListener) {
        setTimeout(() => {
          messageListener(
            { replyTo: "message-0", response: mockResponse },
            { tab: undefined },
            vi.fn(),
          );
        }, 50);
      }

      const result = await messageBus.send(message);

      expect(result).toEqual(mockResponse);
      expect(mockClearTimeout).toHaveBeenCalled();
    });
  });

  describe("Message Queue Processing", () => {
    it("should process messages sequentially", async () => {
      const processOrder: string[] = [];

      // Mock message handlers to track processing order
      const mockHandlerService = {
        handleMessage: vi
          .fn()
          .mockImplementation(async (message: ReceivedMessages) => {
            processOrder.push(message.type);
            await new Promise((resolve) => setTimeout(resolve, 10));
            return { success: true };
          }),
      };

      // Replace the handler service
      (
        messageBus as unknown as {
          messageHandlerService: typeof mockHandlerService;
        }
      ).messageHandlerService = mockHandlerService;

      // Add multiple messages to queue
      const messages: ReceivedMessages[] = [
        { type: "GET_CURRENT_TAB" },
        { type: "TOGGLE_THEME" },
        { type: "GET_ALL_STYLES" },
      ];

      // Simulate incoming messages
      const { browser } = await import("@wxt-dev/browser");
      const messageListener = vi.mocked(browser.runtime.onMessage.addListener)
        .mock.calls[0]?.[0];
      if (messageListener) {
        messages.forEach((message) => {
          messageListener(
            message,
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
        });
      }

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(processOrder).toEqual([
        "GET_CURRENT_TAB",
        "TOGGLE_THEME",
        "GET_ALL_STYLES",
      ]);
    });

    it("should handle errors in message processing", async () => {
      const mockHandlerService = {
        handleMessage: vi.fn().mockRejectedValue(new Error("Handler error")),
      };

      (
        messageBus as unknown as {
          messageHandlerService: typeof mockHandlerService;
        }
      ).messageHandlerService = mockHandlerService;

      const message: ReceivedMessages = { type: "GET_CURRENT_TAB" };

      // Simulate incoming message
      const { browser } = await import("@wxt-dev/browser");
      const messageListener = vi.mocked(browser.runtime.onMessage.addListener)
        .mock.calls[0]?.[0];
      if (messageListener) {
        const result = messageListener(
          message,
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
        expect(result).toBe(true); // Should return true to keep channel open
      }

      // Should attempt to send error response
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
          id: "msg-1",
          message: { type: "GET_CURRENT_TAB" } as ReceivedMessages,
          timestamp: Date.now(),
          retries: 0,
        },
      ];

      const { storage } = await import("@wxt-dev/storage");
      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(storage.getItem).mockResolvedValue(offlineMessages);
      vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);

      // Simulate coming back online
      (messageBus as unknown as { isOnline: boolean }).isOnline = false;
      (
        messageBus as unknown as { processOfflineMessages: () => void }
      ).processOfflineMessages();
      (messageBus as unknown as { isOnline: boolean }).isOnline = true;

      await (
        messageBus as unknown as { processOfflineMessages: () => Promise<void> }
      ).processOfflineMessages();

      // Mock successful processing
      vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);

      // Should have attempted to send the queued message
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "GET_CURRENT_TAB",
        }),
      );

      // Should have removed processed message from storage
      expect(storage.setItem).toHaveBeenCalledWith("local:offlineMessages", []);
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

    it("should handle browser API failures", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      const { browser } = await import("@wxt-dev/browser");
      vi.mocked(browser.runtime.sendMessage).mockRejectedValue(
        new Error("API Error"),
      );

      await expect(messageBus.send(message)).rejects.toThrow("API Error");
    });
  });
});
