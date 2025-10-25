/**
 * Unit tests for message handler error propagation.
 * Tests the error handling and propagation mechanisms in message handlers.
 */

import {
  handleGetCurrentTab,
  handleOpenManager,
  handleRequestImport,
  MessageHandlerService,
  withErrorHandling,
} from "@services/messaging/handlers";
import type { ErrorDetails, ReceivedMessages } from "@services/messaging/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the browser API

let handlerService: MessageHandlerService;

beforeEach(async () => {
  vi.clearAllMocks();
  handlerService = new MessageHandlerService();

  // Setup default successful responses
  const { browser } = await import("wxt/browser");
  vi.mocked(browser.tabs.create).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withErrorHandling wrapper", () => {
  it("should catch and convert handler errors to ErrorDetails", async () => {
    const failingHandler = vi
      .fn()
      .mockRejectedValue(new Error("Handler failed"));
    const wrappedHandler = withErrorHandling(failingHandler);

    const message: ReceivedMessages = { type: "GET_CURRENT_TAB" };

    await expect(wrappedHandler(message)).rejects.toMatchObject({
      message: "Handler failed",
      source: "background",
      severity: "notify",
      timestamp: expect.any(Number),
    });
  });

  it("should preserve stack trace in error details", async () => {
    const error = new Error("Test error");
    error.stack = "Test stack trace";

    const failingHandler = vi.fn().mockRejectedValue(error);
    const wrappedHandler = withErrorHandling(failingHandler);

    const message: ReceivedMessages = { type: "TOGGLE_THEME" };

    try {
      await wrappedHandler(message);
    } catch (errorDetails: unknown) {
      const details = errorDetails as ErrorDetails;
      expect(details.stack).toBe("Test stack trace");
    }
  });

  it("should handle non-Error objects thrown by handlers", async () => {
    const failingHandler = vi.fn().mockRejectedValue("String error");
    const wrappedHandler = withErrorHandling(failingHandler);

    const message: ReceivedMessages = { type: "GET_ALL_STYLES" };

    await expect(wrappedHandler(message)).rejects.toMatchObject({
      message: "Unknown error",
      source: "background",
      severity: "notify",
      stack: "",
    });
  });

  it("should handle null/undefined errors", async () => {
    const failingHandler = vi.fn().mockRejectedValue(null);
    const wrappedHandler = withErrorHandling(failingHandler);

    const message: ReceivedMessages = { type: "RESET_SETTINGS" };

    await expect(wrappedHandler(message)).rejects.toMatchObject({
      message: "Unknown error",
      source: "background",
      severity: "notify",
    });
  });

  it("should log errors with proper context", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // Send no-op
    });
    const failingHandler = vi.fn().mockRejectedValue(new Error("Test error"));
    const wrappedHandler = withErrorHandling(failingHandler);

    const message: ReceivedMessages = {
      type: "REQUEST_EXPORT",
      payload: { format: "json" },
    };
    const tabId = 123;

    try {
      await wrappedHandler(message, tabId);
    } catch {
      // Expected to throw
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      "[ea-Handlers] Message handler error:",
      {
        messageType: "REQUEST_EXPORT",
        error: expect.objectContaining({
          message: "Test error",
          source: "background",
          severity: "notify",
        }),
        tabId: 123,
      },
    );

    consoleSpy.mockRestore();
  });
});

describe("Individual Handler Error Cases", () => {
  describe("handleGetCurrentTab", () => {
    it("should handle browser.tabs.query failure", async () => {
      const { browser } = await import("wxt/browser");
      vi.mocked(browser.tabs.query).mockRejectedValue(
        new Error("Query failed"),
      );

      const message: ReceivedMessages = { type: "GET_CURRENT_TAB" };

      await expect(handleGetCurrentTab(message)).rejects.toThrow(
        "Failed to get current tab: Query failed",
      );
    });

    it("should return null when no active tab found", async () => {
      const { browser } = await import("wxt/browser");
      vi.mocked(browser.tabs.query).mockResolvedValue(undefined);

      const message: ReceivedMessages = { type: "GET_CURRENT_TAB" };

      const result = await handleGetCurrentTab(message);
      expect(result).toEqual(null);
    });
  });

  describe("handleOpenManager", () => {
    it("should handle browser.tabs.create failure", async () => {
      const { browser } = await import("wxt/browser");
      vi.mocked(browser.tabs.create).mockRejectedValue(
        new Error("Create failed"),
      );

      const message: ReceivedMessages = {
        type: "OPEN_MANAGER",
        payload: { url: "test-url" },
      };

      await expect(handleOpenManager(message)).rejects.toThrow(
        "Failed to open manager page: Create failed",
      );
    });

    it("should handle generic tab creation errors", async () => {
      const { browser } = await import("wxt/browser");
      vi.mocked(browser.tabs.create).mockRejectedValue("Generic error");

      const message: ReceivedMessages = {
        type: "OPEN_MANAGER",
        payload: { url: "test-url" },
      };

      await expect(handleOpenManager(message)).rejects.toThrow(
        "Failed to open manager page: Unknown error",
      );
    });
  });

  describe("handleRequestImport", () => {
    it("should validate import data structure", async () => {
      const message: ReceivedMessages = {
        type: "REQUEST_IMPORT",
        payload: { data: "invalid-json" },
      };

      await expect(handleRequestImport(message)).rejects.toThrow(
        "Invalid import data: malformed JSON",
      );
    });

    it("should validate required fields in import data", async () => {
      const message: ReceivedMessages = {
        type: "REQUEST_IMPORT",
        payload: { data: JSON.stringify({ incomplete: "data" }) },
      };

      await expect(handleRequestImport(message)).rejects.toThrow(
        "Invalid import data: missing required fields (settings, styles, version)",
      );
    });

    it("should handle malformed JSON data", async () => {
      const message: ReceivedMessages = {
        type: "REQUEST_IMPORT",
        payload: { data: "{invalid json}" },
      };

      await expect(handleRequestImport(message)).rejects.toThrow(
        "Invalid import data: malformed JSON",
      );
    });
  });
});

describe("MessageHandlerService Error Propagation", () => {
  it("should propagate handler errors through handleMessage", async () => {
    const mockHandler = vi.fn().mockRejectedValue(new Error("Handler error"));
    handlerService.registerHandler("GET_CURRENT_TAB", mockHandler);

    const message: ReceivedMessages = { type: "GET_CURRENT_TAB" };

    await expect(handlerService.handleMessage(message)).rejects.toMatchObject({
      message: "Handler error",
      source: "background",
      severity: "notify",
    });
  });

  it("should throw error for unregistered message types", async () => {
    handlerService.unregisterAllHandlers();

    const message: ReceivedMessages = { type: "GET_CURRENT_TAB" };

    await expect(handlerService.handleMessage(message)).rejects.toThrow(
      "No handler registered for message type: GET_CURRENT_TAB",
    );
  });

  it("should validate handlers and report missing ones", () => {
    handlerService.unregisterAllHandlers();
    handlerService.registerHandler("GET_CURRENT_TAB", vi.fn());

    const validation = handlerService.validateHandlers();

    expect(validation.isValid).toBe(false);
    expect(validation.missingHandlers).toContain("TOGGLE_THEME");
    expect(validation.missingHandlers).toContain("REQUEST_EXPORT");
    expect(validation.missingHandlers).not.toContain("GET_CURRENT_TAB");
  });

  it("should report valid state when all handlers registered", () => {
    const validation = handlerService.validateHandlers();

    expect(validation.isValid).toBe(true);
    expect(validation.missingHandlers).toHaveLength(0);
  });
});

describe("Error Context Preservation", () => {
  it("should preserve error context through handler chain", async () => {
    const originalError = new Error("Original error");
    originalError.stack = "Original stack trace";

    const mockHandler = vi.fn().mockImplementation(async () => {
      throw originalError;
    });

    const wrappedHandler = withErrorHandling(mockHandler);
    const message: ReceivedMessages = { type: "GET_CURRENT_TAB" };
    const tabId = 456;

    try {
      await wrappedHandler(message, tabId);
    } catch (errorDetails: unknown) {
      const details = errorDetails as ErrorDetails;
      expect(details.message).toBe("Original error");
      expect(details.stack).toBe("Original stack trace");
      expect(details.source).toBe("background");
      expect(details.severity).toBe("notify");
      expect(details.timestamp).toBeTypeOf("number");
    }
  });

  it("should handle errors from async operations", async () => {
    const mockHandler = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("Async error");
    });

    const wrappedHandler = withErrorHandling(mockHandler);
    const message: ReceivedMessages = { type: "TOGGLE_THEME" };

    await expect(wrappedHandler(message)).rejects.toMatchObject({
      message: "Async error",
      source: "background",
      severity: "notify",
    });
  });
});

describe("Handler Registration Error Cases", () => {
  it("should handle duplicate handler registration", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    handlerService.registerHandler("GET_CURRENT_TAB", handler1);
    handlerService.registerHandler("GET_CURRENT_TAB", handler2);

    expect(handlerService.hasHandler("GET_CURRENT_TAB")).toBe(true);
    // Second registration should replace the first
  });

  it("should handle unregistering non-existent handler", () => {
    const initialCount = handlerService.getHandlerCount();

    handlerService.unregisterHandler("GET_CURRENT_TAB");
    handlerService.unregisterHandler("GET_CURRENT_TAB"); // Unregister again

    // Should not cause errors and should reduce count by at most 1
    expect(handlerService.getHandlerCount()).toBeLessThanOrEqual(initialCount);
  });

  it("should handle service initialization errors gracefully", () => {
    // Create a service that might fail during initialization
    const service = new MessageHandlerService();

    // Should still be able to register handlers after construction
    expect(() => {
      service.registerHandler("GET_CURRENT_TAB", vi.fn());
    }).not.toThrow();
  });
});

describe("Edge Case Error Handling", () => {
  it("should handle handler throwing synchronous errors", async () => {
    const synchronousHandler = vi.fn().mockImplementation(() => {
      throw new Error("Synchronous error");
    });

    const wrappedHandler = withErrorHandling(synchronousHandler);
    const message: ReceivedMessages = { type: "RESET_SETTINGS" };

    await expect(wrappedHandler(message)).rejects.toMatchObject({
      message: "Synchronous error",
      source: "background",
      severity: "notify",
    });
  });

  it("should handle handler returning rejected promise", async () => {
    const rejectingHandler = vi
      .fn()
      .mockReturnValue(Promise.reject(new Error("Promise rejection")));

    const wrappedHandler = withErrorHandling(rejectingHandler);
    const message: ReceivedMessages = { type: "GET_ALL_STYLES" };

    await expect(wrappedHandler(message)).rejects.toMatchObject({
      message: "Promise rejection",
      source: "background",
      severity: "notify",
    });
  });

  it("should handle handler that throws after successful start", async () => {
    let shouldThrow = false;

    const conditionalHandler = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (shouldThrow) {
        throw new Error("Delayed error");
      }
      return { success: true };
    });

    const wrappedHandler = withErrorHandling(conditionalHandler);
    const message: ReceivedMessages = { type: "TOGGLE_THEME" };

    // First call succeeds
    const result1 = await wrappedHandler(message);
    expect(result1).toEqual({ success: true });

    // Second call fails
    shouldThrow = true;
    await expect(wrappedHandler(message)).rejects.toMatchObject({
      message: "Delayed error",
      source: "background",
      severity: "notify",
    });
  });
});
