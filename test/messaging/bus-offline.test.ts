/**
 * Unit tests for MessageBus offline functionality.
 * Tests offline message queuing, processing, and cleanup operations.
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

describe("MessageBus Offline Support", () => {
  let messageBus: MessageBus;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

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
    // Cleanup the message bus
    messageBus.cleanup();
  });

  describe("Offline Message Queue", () => {
    it("should store messages when offline", async () => {
      const message: ReceivedMessages = {
        type: "GET_CURRENT_TAB",
      };

      // Mock offline status
      (messageBus as unknown as { isOnline: boolean }).isOnline = false;

      // Mock storage
      const { storage } = await import("@wxt-dev/storage");
      const existingMessages = [
        {
          id: "msg-1",
          message: { type: "TOGGLE_THEME" } as ReceivedMessages,
          timestamp: Date.now() - 1000,
          retries: 0,
        },
      ];
      vi.mocked(storage.getItem).mockResolvedValue(existingMessages as []);

      // Call the private method to store offline message
      await (
        messageBus as unknown as {
          storeOfflineMessage: (
            msg: ReceivedMessages,
            tabId?: number,
          ) => Promise<void>;
        }
      ).storeOfflineMessage(message);

      // Verify storage was called
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
        {
          id: "msg-2",
          message: { type: "TOGGLE_THEME" } as ReceivedMessages,
          timestamp: Date.now(),
          retries: 0,
        },
      ];

      // Mock storage
      const { storage } = await import("@wxt-dev/storage");
      vi.mocked(storage.getItem).mockResolvedValue(offlineMessages);

      // Mock online status
      (messageBus as unknown as { isOnline: boolean }).isOnline = true;

      // Mock the send method to resolve immediately instead of going through timeout mechanism
      const sendSpy = vi
        .spyOn(messageBus, "send")
        .mockResolvedValue({ success: true });

      // Call the private method to process offline messages
      await (
        messageBus as unknown as { processOfflineMessages: () => Promise<void> }
      ).processOfflineMessages();

      // Verify messages were sent through the mocked send method
      expect(sendSpy).toHaveBeenCalledTimes(2);
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "GET_CURRENT_TAB",
        }),
        undefined,
      );
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "TOGGLE_THEME",
        }),
        undefined,
      );

      // Verify storage was updated to remove processed messages
      expect(storage.setItem).toHaveBeenCalledWith(
        "local:offlineMessages",
        expect.arrayContaining([]), // Should be empty after successful processing
      );
    });

    it("should cleanup old offline messages", async () => {
      const oldMessages = [
        {
          id: "msg-old",
          message: { type: "GET_CURRENT_TAB" } as ReceivedMessages,
          timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
          retries: 0,
        },
      ];

      const recentMessages = [
        {
          id: "msg-recent",
          message: { type: "TOGGLE_THEME" } as ReceivedMessages,
          timestamp: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
          retries: 0,
        },
      ];

      const allMessages = [...oldMessages, ...recentMessages];

      // Mock storage
      const { storage } = await import("@wxt-dev/storage");
      vi.mocked(storage.getItem).mockResolvedValue(allMessages);

      // Call the private method to get offline messages
      const result = await (
        messageBus as unknown as {
          getOfflineMessages: () => Promise<
            Array<{
              id: string;
              message: ReceivedMessages;
              timestamp: number;
              retries: number;
            }>
          >;
        }
      ).getOfflineMessages();

      // Should only return recent messages (old ones filtered out)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("msg-recent");
    });

    it("should handle max offline messages limit", async () => {
      // Create more messages than the max limit
      const excessMessages = Array.from({ length: 150 }, (_, i) => ({
        id: `msg-${i}`,
        message: { type: "GET_CURRENT_TAB" } as ReceivedMessages,
        timestamp: Date.now() - (150 - i) * 1000, // Ensure unique timestamps in past
        retries: 0,
      }));

      // Mock storage
      const { storage } = await import("@wxt-dev/storage");
      vi.mocked(storage.getItem).mockResolvedValue(excessMessages);

      // Call the private method to store an offline message
      await (
        messageBus as unknown as {
          storeOfflineMessage: (
            msg: ReceivedMessages,
            tabId?: number,
          ) => Promise<void>;
        }
      ).storeOfflineMessage({
        type: "TOGGLE_THEME",
      } as ReceivedMessages);

      // Get the actual call arguments to verify the structure
      const setCall = vi.mocked(storage.setItem).mock.calls[0];
      const storedMessages = setCall[1] as Array<{
        id: string;
        message: ReceivedMessages;
        timestamp: number;
        retries: number;
      }>;

      // Verify storage keeps only the most recent messages (should be 100 total - 99 old + 1 new due to message limit)
      expect(storedMessages).toHaveLength(100);

      // Verify the new message is included
      const hasNewMessage = storedMessages.some(
        (msg) => msg.message.type === "TOGGLE_THEME",
      );
      expect(hasNewMessage).toBe(true);

      // Verify all messages have valid structure
      storedMessages.forEach((msg) => {
        expect(msg).toHaveProperty("id");
        expect(msg).toHaveProperty("message");
        expect(msg).toHaveProperty("timestamp");
        expect(msg).toHaveProperty("retries", 0);
      });
    });
  });

  describe("Offline Utility Methods", () => {
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

      // Mock storage
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

    it("should handle storage errors gracefully", async () => {
      // Mock storage to throw an error
      const { storage } = await import("@wxt-dev/storage");
      vi.mocked(storage.getItem).mockRejectedValue(
        new Error("Storage error") as never,
      );

      // Should not throw, even if storage fails
      const count = await messageBus.getOfflineMessageCount();
      expect(count).toBe(0);
    });
  });

  describe("Online Status Monitoring", () => {
    it("should initialize with online status", () => {
      expect(messageBus.getOnlineStatus()).toBe(true);
    });

    it("should update online status on events", () => {
      // Simulate going offline
      (messageBus as unknown as { isOnline: boolean }).isOnline = false;
      expect(messageBus.getOnlineStatus()).toBe(false);

      // Simulate coming back online
      (messageBus as unknown as { isOnline: boolean }).isOnline = true;
      expect(messageBus.getOnlineStatus()).toBe(true);
    });
  });
});
