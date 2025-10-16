import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Unmock the service to test the actual implementation
vi.unmock("@services/errors/service");

import {
  BrowserAPIError,
  DataCorruptedError,
  ErrorService,
  ErrorSeverity,
  ErrorSource,
  errorService,
  ImportExportError,
  InvalidFileFormatError,
  MessageError,
  MessageInvalidError,
  MessageTimeoutError,
  PermissionDeniedError,
  RuntimeError,
  StorageError,
  StorageInvalidDataError,
  StorageQuotaExceededError,
  withErrorHandling,
  withSyncErrorHandling,
} from "@services/errors/service";

// Mock the reporter to avoid circular dependencies
vi.mock("../../../services/errors/reporter", () => ({
  reporter: {
    reportError: vi.fn(),
    setDebuggingEnabled: vi.fn(),
    getAnalytics: vi.fn(() => ({
      totalErrors: 0,
      errorsBySource: {},
      errorsBySeverity: {},
      errorsByType: {},
      mostFrequentErrors: [],
      recentErrors: [],
      errorTrends: { hourly: [], daily: [] },
    })),
    getErrorReports: vi.fn(() => []),
    getHealthScore: vi.fn(() => 100),
    exportReports: vi.fn(() => "{}"),
    clearReports: vi.fn(),
  },
}));

describe("ErrorService", () => {
  let service: ErrorService;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    service = new ErrorService();
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
      /* no-op */
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleSpy.mockRestore();
  });

  describe("Error Handling", () => {
    test("should handle regular Error and convert to ExtensionError", () => {
      const regularError = new Error("Test error");
      const result = service.handleError(regularError);

      expect(result).toBeInstanceOf(RuntimeError);
      expect(result.message).toBe("Test error");
      expect(result.source).toBe(ErrorSource.RUNTIME);
      expect(result.severity).toBe(ErrorSeverity.NOTIFY);
    });

    test("should handle ExtensionError directly", () => {
      const extensionError = new StorageError("Storage failed");
      const result = service.handleError(extensionError);

      expect(result).toBe(extensionError);
      expect(result.source).toBe(ErrorSource.STORAGE);
    });

    test("should include context in error handling", () => {
      const error = new Error("Test error");
      const context = { userId: "123", action: "save" };

      const result = service.handleError(error, context);

      expect(result.context).toMatchObject(context);
    });

    test("should track error counts", () => {
      const error1 = new StorageError("Storage error");
      const error2 = new StorageError("Storage error");
      const error3 = new MessageError("Message error");

      service.handleError(error1);
      service.handleError(error2);
      service.handleError(error3);

      const stats = service.getErrorStats();
      expect(stats["storage:StorageError"]).toBe(2);
      expect(stats["messaging:MessageError"]).toBe(1);
    });
  });

  describe("Error Listeners", () => {
    test("should add and remove error listeners", () => {
      const listener = vi.fn();
      const unsubscribe = service.addErrorListener(listener);

      const error = new Error("Test error");
      service.handleError(error);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.any(RuntimeError));

      unsubscribe();
      service.handleError(error);

      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    test("should handle listener errors gracefully", () => {
      const badListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const goodListener = vi.fn();

      service.addErrorListener(badListener);
      service.addErrorListener(goodListener);

      const error = new Error("Test error");
      service.handleError(error);

      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error in error listener:",
        expect.any(Error),
      );
    });
  });

  describe("Debugging Mode", () => {
    test("should enable debugging and log errors", () => {
      service.setDebuggingEnabled(true);

      const error = new Error("Debug test error");
      service.handleError(error);

      expect(consoleSpy).toHaveBeenCalledWith(
        "ErrorService handling error:",
        expect.objectContaining({
          error: expect.any(Object),
          count: 1,
          reported: true,
        }),
      );
    });

    test("should not log errors when debugging is disabled", () => {
      service.setDebuggingEnabled(false);

      const error = new Error("Silent test error");
      service.handleError(error);

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("Error Creation Methods", () => {
    test("should create storage errors", () => {
      const error = service.createStorageError("Storage failed", {
        key: "test",
      });

      expect(error).toBeInstanceOf(StorageError);
      expect(error.message).toBe("Storage failed");
      expect(error.context).toMatchObject({ key: "test" });
    });

    test("should create message errors", () => {
      const error = service.createMessageError("Message failed", {
        type: "test",
      });

      expect(error).toBeInstanceOf(MessageError);
      expect(error.message).toBe("Message failed");
      expect(error.context).toMatchObject({ type: "test" });
    });

    test("should create import/export errors", () => {
      const error = service.createImportExportError("Import failed", {
        file: "test.json",
      });

      expect(error).toBeInstanceOf(ImportExportError);
      expect(error.message).toBe("Import failed");
      expect(error.context).toMatchObject({ file: "test.json" });
    });

    test("should create runtime errors", () => {
      const error = service.createRuntimeError("Runtime failed", {
        component: "test",
      });

      expect(error).toBeInstanceOf(RuntimeError);
      expect(error.message).toBe("Runtime failed");
      expect(error.context).toMatchObject({ component: "test" });
    });
  });

  describe("Error Statistics", () => {
    test("should get total error count", () => {
      expect(service.getTotalErrorCount()).toBe(0);

      service.handleError(new Error("Error 1"));
      service.handleError(new Error("Error 2"));

      expect(service.getTotalErrorCount()).toBe(2);
    });

    test("should check error threshold", () => {
      const error = new StorageError("Storage error");

      // Below threshold
      expect(
        service.hasErrorExceededThreshold(
          ErrorSource.STORAGE,
          "StorageError",
          3,
        ),
      ).toBe(false);

      // Add errors to reach threshold
      service.handleError(error);
      service.handleError(error);
      service.handleError(error);

      expect(
        service.hasErrorExceededThreshold(
          ErrorSource.STORAGE,
          "StorageError",
          3,
        ),
      ).toBe(true);
    });

    test("should clear error statistics", () => {
      service.handleError(new Error("Test error"));
      expect(service.getTotalErrorCount()).toBe(1);

      service.clearErrorStats();
      expect(service.getTotalErrorCount()).toBe(0);
    });
  });

  describe("Auto Reporting", () => {
    test("should enable/disable auto reporting", () => {
      expect(service.isAutoReportingEnabled()).toBe(true);

      service.setAutoReportingEnabled(false);
      expect(service.isAutoReportingEnabled()).toBe(false);

      service.setAutoReportingEnabled(true);
      expect(service.isAutoReportingEnabled()).toBe(true);
    });
  });
});

describe("ExtensionError Classes", () => {
  describe("ExtensionError Base Class", () => {
    test("should create error with all properties", () => {
      const error = new StorageError("Test message", ErrorSeverity.FATAL, {
        key: "value",
      });

      expect(error.message).toBe("Test message");
      expect(error.severity).toBe(ErrorSeverity.FATAL);
      expect(error.source).toBe(ErrorSource.STORAGE);
      expect(error.context).toMatchObject({ key: "value" });
      expect(error.timestamp).toBeTypeOf("number");
      expect(error.name).toBe("StorageError");
    });

    test("should serialize to JSON properly", () => {
      const error = new StorageError("Test message", ErrorSeverity.NOTIFY, {
        key: "value",
      });
      const json = error.toJSON();

      expect(json).toMatchObject({
        name: "StorageError",
        message: "Test message",
        severity: ErrorSeverity.NOTIFY,
        source: ErrorSource.STORAGE,
        context: { key: "value" },
        timestamp: expect.any(Number),
      });
    });

    test("should correctly identify user notification requirement", () => {
      const silentError = new StorageError("Silent", ErrorSeverity.SILENT);
      const notifyError = new StorageError("Notify", ErrorSeverity.NOTIFY);
      const fatalError = new StorageError("Fatal", ErrorSeverity.FATAL);

      expect(silentError.shouldNotifyUser()).toBe(false);
      expect(notifyError.shouldNotifyUser()).toBe(true);
      expect(fatalError.shouldNotifyUser()).toBe(true);
    });

    test("should correctly identify fatal errors", () => {
      const notifyError = new StorageError("Notify", ErrorSeverity.NOTIFY);
      const fatalError = new StorageError("Fatal", ErrorSeverity.FATAL);

      expect(notifyError.isFatal()).toBe(false);
      expect(fatalError.isFatal()).toBe(true);
    });
  });

  describe("Storage Errors", () => {
    test("should create StorageQuotaExceededError", () => {
      const error = new StorageQuotaExceededError({ used: 100, limit: 100 });

      expect(error).toBeInstanceOf(StorageError);
      expect(error.message).toBe("ERR_STORAGE_QUOTA");
      expect(error.severity).toBe(ErrorSeverity.NOTIFY);
      expect(error.context).toMatchObject({ used: 100, limit: 100 });
    });

    test("should create StorageInvalidDataError", () => {
      const error = new StorageInvalidDataError("Invalid JSON", {
        data: "bad",
      });

      expect(error).toBeInstanceOf(StorageError);
      expect(error.message).toBe("ERR_STORAGE_INVALID_DATA");
      expect(error.context).toMatchObject({ data: "bad" });
    });
  });

  describe("Message Errors", () => {
    test("should create MessageTimeoutError", () => {
      const error = new MessageTimeoutError("TEST_MESSAGE", 3, {
        timeout: 5000,
      });

      expect(error).toBeInstanceOf(MessageError);
      expect(error.message).toBe("ERR_MESSAGE_TIMEOUT");
      expect(error.context).toMatchObject({
        messageType: "TEST_MESSAGE",
        attempts: 3,
        timeout: 5000,
      });
    });

    test("should create MessageInvalidError", () => {
      const error = new MessageInvalidError("Missing required field", {
        field: "type",
      });

      expect(error).toBeInstanceOf(MessageError);
      expect(error.message).toBe("ERR_MESSAGE_INVALID");
      expect(error.context).toMatchObject({ field: "type" });
    });
  });

  describe("Import/Export Errors", () => {
    test("should create InvalidFileFormatError with both formats", () => {
      const error = new InvalidFileFormatError("json", "xml", {
        filename: "test.json",
      });

      expect(error).toBeInstanceOf(ImportExportError);
      expect(error.message).toBe("ERR_FILE_FORMAT_INVALID");
      expect(error.context).toMatchObject({
        expectedFormat: "json",
        actualFormat: "xml",
        filename: "test.json",
      });
    });

    test("should create InvalidFileFormatError with expected format only", () => {
      const error = new InvalidFileFormatError("json");

      expect(error.message).toBe("ERR_FILE_FORMAT_INVALID");
      expect(error.context).toMatchObject({
        expectedFormat: "json",
        actualFormat: undefined,
      });
    });

    test("should create DataCorruptedError", () => {
      const error = new DataCorruptedError("Missing checksum", {
        checksum: null,
      });

      expect(error).toBeInstanceOf(ImportExportError);
      expect(error.message).toBe("ERR_DATA_CORRUPTED");
      expect(error.context).toMatchObject({ checksum: null });
    });
  });

  describe("Runtime Errors", () => {
    test("should create BrowserAPIError", () => {
      const originalError = new Error("Permission denied");
      const error = new BrowserAPIError("tabs", "query", originalError, {
        permission: "tabs",
      });

      expect(error).toBeInstanceOf(RuntimeError);
      expect(error.message).toBe("ERR_BROWSER_API");
      expect(error.context).toMatchObject({
        api: "tabs",
        operation: "query",
        originalError: "Permission denied",
        permission: "tabs",
      });
    });

    test("should create BrowserAPIError without original error", () => {
      const error = new BrowserAPIError("storage", "set", undefined, {
        key: "test",
      });

      expect(error.message).toBe("ERR_BROWSER_API");
      expect(error.context).toMatchObject({
        api: "storage",
        operation: "set",
        originalError: undefined,
        key: "test",
      });
    });

    test("should create PermissionDeniedError", () => {
      const error = new PermissionDeniedError("activeTab", { requested: true });

      expect(error).toBeInstanceOf(RuntimeError);
      expect(error.message).toBe("ERR_PERMISSION_DENIED");
      expect(error.severity).toBe(ErrorSeverity.FATAL);
      expect(error.context).toMatchObject({
        permission: "activeTab",
        requested: true,
      });
    });
  });
});

describe("Error Handling Utilities", () => {
  describe("withErrorHandling", () => {
    test("should handle async function success", async () => {
      const asyncFn = vi.fn().mockResolvedValue("success");
      const wrappedFn = withErrorHandling(asyncFn, { operation: "test" });

      const result = await wrappedFn("arg1", "arg2");

      expect(result).toBe("success");
      expect(asyncFn).toHaveBeenCalledWith("arg1", "arg2");
    });

    test("should handle async function error", async () => {
      const asyncFn = vi.fn().mockRejectedValue(new Error("Async error"));
      const wrappedFn = withErrorHandling(asyncFn, { operation: "test" });

      await expect(wrappedFn("arg1")).rejects.toThrow(RuntimeError);
    });

    test("should handle non-Error rejection", async () => {
      const asyncFn = vi.fn().mockRejectedValue("String error");
      const wrappedFn = withErrorHandling(asyncFn);

      await expect(wrappedFn()).rejects.toThrow(RuntimeError);
    });
  });

  describe("withSyncErrorHandling", () => {
    test("should handle sync function success", () => {
      const syncFn = vi.fn().mockReturnValue("success");
      const wrappedFn = withSyncErrorHandling(syncFn, { operation: "test" });

      const result = wrappedFn("arg1", "arg2");

      expect(result).toBe("success");
      expect(syncFn).toHaveBeenCalledWith("arg1", "arg2");
    });

    test("should handle sync function error", () => {
      const syncFn = vi.fn().mockImplementation(() => {
        throw new Error("Sync error");
      });
      const wrappedFn = withSyncErrorHandling(syncFn, { operation: "test" });

      expect(() => wrappedFn("arg1")).toThrow(RuntimeError);
    });

    test("should handle non-Error throw", () => {
      const syncFn = vi.fn().mockImplementation(() => {
        throw "String error";
      });
      const wrappedFn = withSyncErrorHandling(syncFn);

      expect(() => wrappedFn()).toThrow(RuntimeError);
    });
  });
});

describe("Global Error Service Instance", () => {
  test("should export singleton errorService", () => {
    expect(errorService).toBeInstanceOf(ErrorService);
  });

  test("should maintain state across imports", () => {
    // Clear any existing errors first
    errorService.clearErrorStats();

    const error = new Error("Test error");
    errorService.handleError(error);

    expect(errorService.getTotalErrorCount()).toBe(1);
  });
});
