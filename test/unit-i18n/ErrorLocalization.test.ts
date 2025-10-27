import {
  BrowserAPIError,
  DataCorruptedError,
  ErrorSeverity,
  FontLoadError,
  InjectionCSPError,
  InvalidFileFormatError,
  MessageInvalidError,
  MessageTimeoutError,
  ParseMetadataError,
  PermissionDeniedError,
  PermissionRequiredError,
  PreprocessorCompileError,
  StorageInvalidDataError,
  StorageQuotaExceededError,
} from "@services/errors/service";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Create a mock function that can be hoisted
const mockI18nT = vi.hoisted(() => vi.fn());

// Mock the @wxt-dev/i18n module BEFORE importing I18nService
vi.mock("@wxt-dev/i18n", () => ({
  createI18n: vi.fn(() => ({
    t: mockI18nT,
  })),
}));

import { i18nService } from "@services/i18n/service";

beforeEach(() => {
  // Get the mocks from global.browser
  const mockGetMessage = vi.mocked(browser.i18n.getMessage);
  const mockGetUILanguage = vi.mocked(browser.i18n.getUILanguage);

  // Reset implementations for error localization tests
  mockGetUILanguage.mockReturnValue("en");
  mockGetMessage.mockImplementation(
    (key: string, substitutions?: string | string[]) => {
      const messages: Record<string, string> = {
        ERR_STORAGE_QUOTA:
          "Storage quota exceeded. Please remove some styles to free up space.",
        ERR_STORAGE_INVALID_DATA: "Invalid storage data: $1",
        ERR_MESSAGE_TIMEOUT:
          "Message timeout after $1 attempts for message type: $2",
        ERR_MESSAGE_INVALID: "Invalid message: $1",
        ERR_FILE_FORMAT_INVALID: "Invalid file format. Expected $1, got $2",
        ERR_DATA_CORRUPTED: "Data corrupted: $1",
        ERR_BROWSER_API: "Browser API error in $1.$2: $3",
        ERR_PERMISSION_DENIED: "Permission denied: $1",
        ERR_PERMISSION_REQUIRED: "Permission required: $1",
        ERR_PARSE_METADATA: "Failed to parse style metadata",
        ERR_PREPROCESSOR_COMPILE: "Failed to compile preprocessor code",
        ERR_INJECTION_CSP: "Content Security Policy blocked style injection",
        ERR_FONT_LOAD: "Failed to load font: $1",
      };

      let message = messages[key] || key;

      // Perform placeholder substitution like browser.i18n does
      if (substitutions) {
        const subsArray = Array.isArray(substitutions)
          ? substitutions
          : [substitutions];
        subsArray.forEach((sub, index) => {
          message = message.replace(
            new RegExp(`\\$${index + 1}`, "g"),
            sub || "",
          );
        });
      }

      return message;
    },
  );

  // Set up the i18n.t mock to return the same as browser.i18n.getMessage
  mockI18nT.mockImplementation(
    (
      key: string,
      substitutions?: string | string[] | number,
      _options?: Record<string, unknown>,
    ) => {
      return mockGetMessage(key, substitutions as string | string[]);
    },
  );

  // Clear all mocks to ensure test isolation
  vi.clearAllMocks();

  // Clear i18n cache to ensure test isolation
  i18nService.clearCache();
});

describe("Error Localization", () => {
  describe("Storage Errors", () => {
    it("should localize storage quota exceeded error", () => {
      const error = new StorageQuotaExceededError();
      expect(error.message).toBe(
        "Storage quota exceeded. Please remove some styles to free up space.",
      );
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should localize storage invalid data error with substitution", () => {
      const error = new StorageInvalidDataError("Invalid JSON format");
      expect(error.message).toBe("Invalid storage data: Invalid JSON format");
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });
  });

  describe("Message Errors", () => {
    it("should localize message timeout error with substitutions", () => {
      const error = new MessageTimeoutError("PARSE_USERCSS", 3);
      expect(error.message).toBe(
        "Message timeout after 3 attempts for message type: PARSE_USERCSS",
      );
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should localize message invalid error with substitution", () => {
      const error = new MessageInvalidError("Missing required field: type");
      expect(error.message).toBe(
        "Invalid message: Missing required field: type",
      );
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });
  });

  describe("Import/Export Errors", () => {
    it("should localize invalid file format error with both formats", () => {
      const error = new InvalidFileFormatError("user.css", "text/plain");
      expect(error.message).toBe(
        "Invalid file format. Expected user.css, got text/plain",
      );
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should localize invalid file format error with only expected format", () => {
      const error = new InvalidFileFormatError("user.css");
      expect(error.message).toBe(
        "Invalid file format. Expected user.css, got ",
      );
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should localize data corrupted error with substitution", () => {
      const error = new DataCorruptedError("CRC mismatch in header");
      expect(error.message).toBe("Data corrupted: CRC mismatch in header");
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });
  });

  describe("Runtime Errors", () => {
    it("should localize browser API error with substitutions", () => {
      const originalError = new Error("Network request failed");
      const error = new BrowserAPIError("storage", "get", originalError);
      expect(error.message).toBe(
        "Browser API error in storage.get: Network request failed",
      );
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should localize browser API error with unknown error", () => {
      // Create a fresh error to avoid any state issues
      const error = new BrowserAPIError("tabs", "query");
      expect(error.message).toBe(
        "Browser API error in tabs.query: Unknown error",
      );
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should handle undefined original error", () => {
      // Create a fresh error to avoid any state issues
      const error = new BrowserAPIError("tabs", "query", undefined);
      expect(error.message).toBe(
        "Browser API error in tabs.query: Unknown error",
      );
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should localize permission denied error with substitution", () => {
      const error = new PermissionDeniedError("storage");
      expect(error.message).toBe("Permission denied: storage");
      expect(error.severity).toBe(ErrorSeverity.FATAL);
    });

    it("should localize permission required error with substitution", () => {
      const error = new PermissionRequiredError("activeTab");
      expect(error.message).toBe("Permission required: activeTab");
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });
  });

  describe("Processing Errors", () => {
    it("should localize parse metadata error", () => {
      const error = new ParseMetadataError();
      expect(error.message).toBe("Failed to parse style metadata");
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should localize preprocessor compile error", () => {
      const error = new PreprocessorCompileError();
      expect(error.message).toBe("Failed to compile preprocessor code");
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should localize injection CSP error", () => {
      const error = new InjectionCSPError();
      expect(error.message).toBe(
        "Content Security Policy blocked style injection",
      );
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });

    it("should localize font load error with substitution", () => {
      const error = new FontLoadError("Roboto-Regular.woff2");
      expect(error.message).toBe("Failed to load font: Roboto-Regular.woff2");
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
    });
  });

  describe("Error Context and Properties", () => {
    it("should preserve error context", () => {
      const context = { userId: "123", sessionId: "abc" };
      const error = new StorageQuotaExceededError(context);
      expect(error.context).toEqual(context);
    });

    it("should set correct error source", () => {
      const error = new StorageQuotaExceededError();
      expect(error.source).toBe("storage");
    });

    it("should set correct error name", () => {
      const error = new StorageQuotaExceededError();
      expect(error.name).toBe("StorageQuotaExceededError");
    });

    it("should have timestamp", () => {
      const before = Date.now();
      const error = new StorageQuotaExceededError();
      const after = Date.now();
      expect(error.timestamp).toBeGreaterThanOrEqual(before);
      expect(error.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("Error Serialization", () => {
    it("should serialize to JSON correctly", () => {
      const error = new StorageQuotaExceededError();
      const json = error.toJSON();

      expect(json).toHaveProperty("name", "StorageQuotaExceededError");
      expect(json).toHaveProperty("message");
      expect(json).toHaveProperty("severity", "notify");
      expect(json).toHaveProperty("source", "storage");
      expect(json).toHaveProperty("timestamp");
      expect(json).toHaveProperty("context");
    });
  });
});
