/**
 * Unit tests for message validation and serialization.
 * Tests the message type validation and error handling utilities.
 */

import type { ErrorDetails, ReceivedMessages } from "@services/messaging/types";
import {
  createInvalidMessageError,
  isValidReceivedMessage,
} from "@services/messaging/validation";
import { describe, expect, it } from "vitest";

describe("Message Validation", () => {
  describe("isValidReceivedMessage", () => {
    it("should validate GET_CURRENT_TAB message", () => {
      const message = {
        type: "GET_CURRENT_TAB",
      };

      expect(isValidReceivedMessage(message)).toBe(true); // Should be true for valid message
    });

    it("should validate TOGGLE_THEME message", () => {
      const message = {
        type: "TOGGLE_THEME",
      };

      expect(isValidReceivedMessage(message)).toBe(true); // Should be true for valid message
    });

    it("should validate REQUEST_EXPORT message with payload", () => {
      const message: ReceivedMessages = {
        type: "REQUEST_EXPORT",
        payload: {
          format: "json",
        },
      };

      expect(isValidReceivedMessage(message)).toBe(true);
    });

    it("should validate REQUEST_IMPORT message with payload", () => {
      const message: ReceivedMessages = {
        type: "REQUEST_IMPORT",
        payload: {
          data: '{"settings": {}, "styles": []}',
        },
      };

      expect(isValidReceivedMessage(message)).toBe(true);
    });

    it("should validate RESET_SETTINGS message", () => {
      const message = {
        type: "RESET_SETTINGS",
      };

      expect(isValidReceivedMessage(message)).toBe(true); // Should be true for valid message
    });

    it("should validate GET_ALL_STYLES message", () => {
      const message = {
        type: "GET_ALL_STYLES",
      };

      expect(isValidReceivedMessage(message)).toBe(true); // Should be true for valid message
    });

    it("should validate OPEN_MANAGER message with payload", () => {
      const message: ReceivedMessages = {
        type: "OPEN_MANAGER",
        payload: {
          url: "chrome-extension://test/manager.html",
        },
      };

      expect(isValidReceivedMessage(message)).toBe(true);
    });

    it("should reject null or undefined messages", () => {
      expect(isValidReceivedMessage(null)).toBe(false);
      expect(isValidReceivedMessage(undefined)).toBe(false);
    });

    it("should reject non-object messages", () => {
      expect(isValidReceivedMessage("string")).toBe(false);
      expect(isValidReceivedMessage(123)).toBe(false);
      expect(isValidReceivedMessage(true)).toBe(false);
    });

    it("should reject messages without type property", () => {
      const message = {
        payload: { data: "test" },
      };

      expect(isValidReceivedMessage(message)).toBe(false);
    });

    it("should reject messages with invalid type", () => {
      const message = {
        type: "INVALID_TYPE",
        payload: { data: "test" },
      };

      expect(isValidReceivedMessage(message)).toBe(false);
    });

    it("should reject REQUEST_EXPORT without format in payload", () => {
      const message = {
        type: "REQUEST_EXPORT",
        payload: {},
      };

      expect(isValidReceivedMessage(message)).toBe(false);
    });

    it("should reject REQUEST_EXPORT with invalid format", () => {
      const message = {
        type: "REQUEST_EXPORT",
        payload: {
          format: "xml", // Only "json" is valid
        },
      };

      expect(isValidReceivedMessage(message)).toBe(false);
    });

    it("should reject REQUEST_IMPORT without data in payload", () => {
      const message = {
        type: "REQUEST_IMPORT",
        payload: {},
      };

      expect(isValidReceivedMessage(message)).toBe(false);
    });

    it("should reject REQUEST_IMPORT with non-string data", () => {
      const message = {
        type: "REQUEST_IMPORT",
        payload: {
          data: { invalid: "object" },
        },
      };

      expect(isValidReceivedMessage(message)).toBe(false);
    });

    it("should reject OPEN_MANAGER without url in payload", () => {
      const message = {
        type: "OPEN_MANAGER",
        payload: {},
      };

      expect(isValidReceivedMessage(message)).toBe(false);
    });

    it("should reject OPEN_MANAGER with non-string url", () => {
      const message = {
        type: "OPEN_MANAGER",
        payload: {
          url: 123,
        },
      };

      expect(isValidReceivedMessage(message)).toBe(false);
    });
  });

  describe("createInvalidMessageError", () => {
    it("should create error for null message", () => {
      const error: ErrorDetails = createInvalidMessageError(null, "popup");

      expect(error.message).toBe("Invalid message received from popup");
      expect(error.source).toBe("popup");
      expect(error.severity).toBe("notify");
      expect(error.timestamp).toBeTypeOf("number");
      expect(error.timestamp).toBeGreaterThan(0);
    });

    it("should create error for undefined message", () => {
      const error: ErrorDetails = createInvalidMessageError(
        undefined,
        "manager",
      );

      expect(error.message).toBe("Invalid message received from manager");
      expect(error.source).toBe("manager");
      expect(error.severity).toBe("notify");
    });

    it("should create error for non-object message", () => {
      const error: ErrorDetails = createInvalidMessageError(
        "string",
        "background",
      );

      expect(error.message).toBe("Invalid message received from background");
      expect(error.source).toBe("background");
      expect(error.severity).toBe("notify");
    });

    it("should create error for message without type", () => {
      const message = { payload: { data: "test" } };
      const error: ErrorDetails = createInvalidMessageError(message, "content");

      expect(error.message).toBe("Invalid message received from content");
      expect(error.source).toBe("content");
      expect(error.severity).toBe("notify");
    });

    it("should create error for message with invalid type", () => {
      const message = { type: "INVALID_TYPE" };
      const error: ErrorDetails = createInvalidMessageError(message, "popup");

      expect(error.message).toBe("Invalid message received from popup");
      expect(error.source).toBe("popup");
      expect(error.severity).toBe("notify");
    });

    it("should create error for message with missing payload", () => {
      const message = { type: "REQUEST_EXPORT" };
      const error: ErrorDetails = createInvalidMessageError(message, "manager");

      expect(error.message).toBe("Invalid message received from manager");
      expect(error.source).toBe("manager");
      expect(error.severity).toBe("notify");
    });

    it("should create error for message with invalid payload structure", () => {
      const message = { type: "REQUEST_EXPORT", payload: { format: "xml" } };
      const error: ErrorDetails = createInvalidMessageError(
        message,
        "background",
      );

      expect(error.message).toBe("Invalid message received from background");
      expect(error.source).toBe("background");
      expect(error.severity).toBe("notify");
    });

    it("should include stack trace when available", () => {
      const error: ErrorDetails = createInvalidMessageError(null, "popup");

      expect(error.stack).toBeTypeOf("string");
      expect(error.stack).toBe("null");
    });
  });

  describe("Message Serialization", () => {
    it("should serialize and deserialize GET_CURRENT_TAB message", () => {
      const original = {
        type: "GET_CURRENT_TAB",
      };

      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized);

      expect(isValidReceivedMessage(deserialized)).toBe(true); // Should be true for valid message
      expect(deserialized).toEqual(original);
    });

    it("should serialize and deserialize REQUEST_EXPORT message", () => {
      const original: ReceivedMessages = {
        type: "REQUEST_EXPORT",
        payload: {
          format: "json",
        },
      };

      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized);

      expect(isValidReceivedMessage(deserialized)).toBe(true);
      expect(deserialized).toEqual(original);
    });

    it("should serialize and deserialize REQUEST_IMPORT message", () => {
      const original: ReceivedMessages = {
        type: "REQUEST_IMPORT",
        payload: {
          data: '{"settings": {"version": "1.0.0"}, "styles": []}',
        },
      };

      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized);

      expect(isValidReceivedMessage(deserialized)).toBe(true);
      expect(deserialized).toEqual(original);
    });

    it("should serialize and deserialize OPEN_MANAGER message", () => {
      const original: ReceivedMessages = {
        type: "OPEN_MANAGER",
        payload: {
          url: "chrome-extension://abc123/manager.html",
        },
      };

      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized);

      expect(isValidReceivedMessage(deserialized)).toBe(true);
      expect(deserialized).toEqual(original);
    });

    it("should handle corrupted JSON gracefully", () => {
      const corruptedJson = '{"type": "GET_CURRENT_TAB", invalid}';

      expect(() => {
        JSON.parse(corruptedJson);
      }).toThrow();
    });

    it("should detect payload corruption after deserialization", () => {
      // Simulate a message that gets corrupted during transmission
      const corrupted = {
        type: "REQUEST_EXPORT",
        payload: {
          format: "corrupted-format",
        },
      };

      expect(isValidReceivedMessage(corrupted)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty objects", () => {
      expect(isValidReceivedMessage({})).toBe(false);
    });

    it("should handle objects with extra properties", () => {
      const message = {
        type: "GET_CURRENT_TAB",
        extraProperty: "should be ignored",
      };

      expect(isValidReceivedMessage(message)).toBe(false); // Non-empty object with type
    });

    it("should handle nested objects in payload", () => {
      const message: ReceivedMessages = {
        type: "REQUEST_IMPORT",
        payload: {
          data: JSON.stringify({
            settings: { nested: { deeply: true } },
            styles: [{ nested: "data" }],
          }),
        },
      };

      expect(isValidReceivedMessage(message)).toBe(true);
    });

    it("should handle very long URLs in OPEN_MANAGER", () => {
      const longUrl =
        "chrome-extension://abc123/manager.html?" +
        "param=".repeat(1000) +
        "value";
      const message: ReceivedMessages = {
        type: "OPEN_MANAGER",
        payload: {
          url: longUrl,
        },
      };

      expect(isValidReceivedMessage(message)).toBe(true);
    });

    it("should handle unicode characters in data", () => {
      const message: ReceivedMessages = {
        type: "REQUEST_IMPORT",
        payload: {
          data: '{"settings": {"theme": "🌙"}, "styles": []}',
        },
      };

      const serialized = JSON.stringify(message);
      const deserialized = JSON.parse(serialized);

      expect(isValidReceivedMessage(deserialized)).toBe(true);
      expect(deserialized.payload.data).toContain("🌙");
    });
  });
});
