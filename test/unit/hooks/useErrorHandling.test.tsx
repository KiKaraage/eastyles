import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  useErrorAnalytics,
  useErrorBoundary,
  useErrorHandling,
} from "../../../hooks/useErrorHandling";
import {
  ErrorSeverity,
  ErrorSource,
  errorService,
  RuntimeError,
} from "../../../services/errors/service";

// Mock the error service
vi.mock("../../../services/errors/service", () => {
  class MockExtensionError extends Error {
    public severity: ErrorSeverity;
    public source: ErrorSource;
    public timestamp: number;
    public context?: Record<string, unknown>;

    constructor(
      message: string,
      severity: ErrorSeverity,
      source: ErrorSource,
      context?: Record<string, unknown>,
    ) {
      super(message);
      this.name = this.constructor.name;
      this.severity = severity;
      this.source = source;
      this.timestamp = Date.now();
      this.context = context;
    }

    shouldNotifyUser() {
      return this.severity !== ErrorSeverity.SILENT;
    }

    isFatal() {
      return this.severity === ErrorSeverity.FATAL;
    }
  }

  class MockRuntimeError extends MockExtensionError {
    constructor(
      message: string,
      severity: ErrorSeverity,
      context?: Record<string, unknown>,
    ) {
      super(message, severity, ErrorSource.RUNTIME, context);
    }
  }

  return {
    errorService: {
      handleError: vi.fn(
        (
          error: Error | MockExtensionError,
          context?: Record<string, unknown>,
        ) => {
          // If it's already an ExtensionError, return it as-is
          if (error instanceof MockExtensionError) {
            return error;
          }

          // For regular Error instances, create a RuntimeError with proper properties
          return new MockRuntimeError(
            error.message || "Unknown error",
            ErrorSeverity.NOTIFY,
            {
              originalError: error.message,
              stack: error.stack,
              ...context,
            },
          );
        },
      ),
      addErrorListener: vi.fn(() => vi.fn()), // Return unsubscribe function
      getErrorAnalytics: vi.fn(() => ({
        totalErrors: 5,
        errorsBySource: { [ErrorSource.POPUP]: 3, [ErrorSource.STORAGE]: 2 },
        errorsBySeverity: {
          [ErrorSeverity.NOTIFY]: 4,
          [ErrorSeverity.FATAL]: 1,
        },
        errorsByType: { RuntimeError: 3, StorageError: 2 },
        mostFrequentErrors: [],
        recentErrors: [],
        errorTrends: { hourly: [], daily: [] },
      })),
      getHealthScore: vi.fn(() => 85),
      exportErrorData: vi.fn(() => JSON.stringify({ test: "data" })),
      clearErrorData: vi.fn(),
      getErrorReports: vi.fn(() => []),
    },
    ExtensionError: MockExtensionError,
    RuntimeError: MockRuntimeError,
    ErrorSeverity: {
      SILENT: "silent" as const,
      NOTIFY: "notify" as const,
      FATAL: "fatal" as const,
    },
    ErrorSource: {
      BACKGROUND: "background" as const,
      POPUP: "popup" as const,
      MANAGER: "manager" as const,
      CONTENT: "content" as const,
      STORAGE: "storage" as const,
      MESSAGING: "messaging" as const,
      IMPORT_EXPORT: "import_export" as const,
      RUNTIME: "runtime" as const,
    },
  };
});

describe("useErrorHandling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial State", () => {
    test("should initialize with no error", () => {
      const { result } = renderHook(() => useErrorHandling());

      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.retryCount).toBe(0);
      expect(result.current.canRetry).toBe(true);
      expect(result.current.isFatal).toBe(false);
    });

    test("should accept custom options", () => {
      const onError = vi.fn();
      const onRecover = vi.fn();

      const { result } = renderHook(() =>
        useErrorHandling({
          maxRetries: 5,
          autoRetry: true,
          onError,
          onRecover,
          source: ErrorSource.STORAGE,
        }),
      );

      expect(result.current.error).toBeNull();
      expect(result.current.canRetry).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("should handle error and update state", () => {
      const { result } = renderHook(() => useErrorHandling());
      const testError = new Error("Test error");

      act(() => {
        result.current.handleError(testError, { context: "test" });
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.isLoading).toBe(false);
      expect(errorService.handleError).toHaveBeenCalledWith(testError, {
        source: ErrorSource.POPUP,
        context: "test",
      });
    });

    test("should call custom error handler", () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useErrorHandling({ onError }));
      const testError = new Error("Test error");

      act(() => {
        result.current.handleError(testError);
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Test error",
        }),
      );
    });

    test("should handle ExtensionError directly", () => {
      const { result } = renderHook(() => useErrorHandling());
      const extensionError = new RuntimeError(
        "Extension error",
        ErrorSeverity.FATAL,
      );

      act(() => {
        result.current.handleError(extensionError);
      });

      expect(result.current.error).toBe(extensionError);
      expect(result.current.isFatal).toBe(true);
    });
  });

  describe("Retry Mechanism", () => {
    test("should retry operation", async () => {
      const onRecover = vi.fn();
      const { result } = renderHook(() => useErrorHandling({ onRecover }));

      let shouldFail = true;
      const operation = vi.fn().mockImplementation(async () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("First attempt fails");
        }
        return "success";
      });

      // Execute operation that fails first
      await act(async () => {
        await result.current.executeWithErrorHandling(operation);
      });

      expect(result.current.error).toBeTruthy();
      expect(operation).toHaveBeenCalledTimes(1);

      // Retry the operation
      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.error).toBeNull();
      expect(onRecover).toHaveBeenCalledTimes(1);
    });

    test("should track retry count", async () => {
      const { result } = renderHook(() => useErrorHandling({ maxRetries: 2 }));

      const failingOperation = vi
        .fn()
        .mockRejectedValue(new Error("Always fails"));

      // First execution
      await act(async () => {
        await result.current.executeWithErrorHandling(failingOperation);
      });

      expect(result.current.retryCount).toBe(0);

      // First retry
      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.retryCount).toBe(1);

      // Second retry
      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.retryCount).toBe(2);
      expect(result.current.canRetry).toBe(false);
    });

    test("should not retry fatal errors", () => {
      const { result } = renderHook(() => useErrorHandling());
      const fatalError = new RuntimeError("Fatal error", ErrorSeverity.FATAL);

      // Mock the handleError to return the fatal error
      (
        errorService.handleError as ReturnType<typeof vi.fn>
      ).mockReturnValueOnce(fatalError);

      act(() => {
        result.current.handleError(new Error("Fatal error"));
      });

      expect(result.current.canRetry).toBe(false);
      expect(result.current.isFatal).toBe(true);
    });

    test("should not retry after max attempts", async () => {
      const { result } = renderHook(() => useErrorHandling({ maxRetries: 1 }));

      const failingOperation = vi
        .fn()
        .mockRejectedValue(new Error("Always fails"));

      // Execute and retry until max attempts
      await act(async () => {
        await result.current.executeWithErrorHandling(failingOperation);
      });

      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.retryCount).toBe(1);
      expect(result.current.canRetry).toBe(false);

      // Attempt to retry again should not work
      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.retryCount).toBe(1); // Should stay the same
    });
  });

  describe("Clear Error", () => {
    test("should clear error state", () => {
      const { result } = renderHook(() => useErrorHandling());

      // Set an error first
      act(() => {
        result.current.handleError(new Error("Test error"));
      });

      expect(result.current.error).toBeTruthy();

      // Clear the error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.retryCount).toBe(0);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("Execute Operations", () => {
    test("should execute async operation successfully", async () => {
      const { result } = renderHook(() => useErrorHandling());
      const operation = vi.fn().mockResolvedValue("success");

      let operationResult: unknown;
      await act(async () => {
        operationResult =
          await result.current.executeWithErrorHandling(operation);
      });

      expect(operationResult).toBe("success");
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    test("should handle async operation failure", async () => {
      const { result } = renderHook(() => useErrorHandling());
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("Operation failed"));

      let operationResult: unknown;
      await act(async () => {
        operationResult =
          await result.current.executeWithErrorHandling(operation);
      });

      expect(operationResult).toBeNull();
      expect(result.current.error).toBeTruthy();
      expect(result.current.isLoading).toBe(false);
    });

    test("should execute sync operation successfully", () => {
      const { result } = renderHook(() => useErrorHandling());
      const operation = vi.fn().mockReturnValue("sync success");

      let operationResult: unknown;
      act(() => {
        operationResult =
          result.current.executeSyncWithErrorHandling(operation);
      });

      expect(operationResult).toBe("sync success");
      expect(result.current.error).toBeNull();
    });

    test("should handle sync operation failure", () => {
      const { result } = renderHook(() => useErrorHandling());
      const operation = vi.fn().mockImplementation(() => {
        throw new Error("Sync operation failed");
      });

      let operationResult: unknown;
      act(() => {
        operationResult =
          result.current.executeSyncWithErrorHandling(operation);
      });

      expect(operationResult).toBeNull();
      expect(result.current.error).toBeTruthy();
    });

    test("should set loading state during async operations", async () => {
      const { result } = renderHook(() => useErrorHandling());
      let resolveOperation: (value: string) => void;
      const operation = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveOperation = resolve;
          }),
      );

      // Start the operation
      act(() => {
        result.current.executeWithErrorHandling(operation);
      });

      expect(result.current.isLoading).toBe(true);

      // Resolve the operation
      await act(async () => {
        resolveOperation("completed");
        await new Promise((resolve) => setTimeout(resolve, 0)); // Wait for promise to resolve
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});

describe("useErrorAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should return analytics data", () => {
    const { result } = renderHook(() => useErrorAnalytics());

    expect(result.current.analytics).toMatchObject({
      totalErrors: 5,
      errorsBySource: expect.any(Object),
      errorsBySeverity: expect.any(Object),
      errorsByType: expect.any(Object),
    });
    expect(result.current.healthScore).toBe(85);
  });

  test("should refresh analytics", () => {
    const { result } = renderHook(() => useErrorAnalytics());

    act(() => {
      result.current.refreshAnalytics();
    });

    expect(errorService.getErrorAnalytics).toHaveBeenCalledTimes(2); // Once on init, once on refresh
    expect(errorService.getHealthScore).toHaveBeenCalledTimes(2);
  });

  test("should export error data", () => {
    const { result } = renderHook(() => useErrorAnalytics());

    const exportedData = result.current.exportErrorData();

    expect(exportedData).toBe('{"test":"data"}');
    expect(errorService.exportErrorData).toHaveBeenCalledTimes(1);
  });

  test("should clear error data", () => {
    const { result } = renderHook(() => useErrorAnalytics());

    act(() => {
      result.current.clearErrorData();
    });

    expect(errorService.clearErrorData).toHaveBeenCalledTimes(1);
    expect(errorService.getErrorAnalytics).toHaveBeenCalledTimes(2); // Once on init, once after clear
  });

  test("should get error reports with filter", () => {
    const { result } = renderHook(() => useErrorAnalytics());
    const filter = { source: ErrorSource.STORAGE };

    result.current.getErrorReports(filter);

    expect(errorService.getErrorReports).toHaveBeenCalledWith(filter);
  });

  test("should subscribe to error updates", () => {
    const mockUnsubscribe = vi.fn();
    (errorService.addErrorListener as ReturnType<typeof vi.fn>).mockReturnValue(
      mockUnsubscribe,
    );

    const { unmount } = renderHook(() => useErrorAnalytics());

    expect(errorService.addErrorListener).toHaveBeenCalledTimes(1);

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("useErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should report error to service", () => {
    const { result } = renderHook(() => useErrorBoundary());
    const testError = new Error("Boundary test error");
    const errorInfo = { componentStack: "test stack" } as React.ErrorInfo;

    act(() => {
      result.current.reportError(testError, errorInfo);
    });

    expect(errorService.handleError).toHaveBeenCalledWith(testError, {
      source: ErrorSource.POPUP,
      errorInfo,
    });
  });

  test("should reset error state", () => {
    const { result } = renderHook(() => useErrorBoundary());

    // This should not throw since no error is set
    act(() => {
      result.current.resetError();
    });

    expect(() => result.current.resetError()).not.toThrow();
  });

  test("should throw error to trigger error boundary", () => {
    const { result } = renderHook(() => useErrorBoundary());
    const testError = new Error("Boundary trigger error");

    // Report an error first
    act(() => {
      result.current.reportError(testError);
    });

    // Now the error should be in state
    expect(result.current.error).toBe(testError);

    // Test that calling throwError throws the error
    expect(() => {
      result.current.throwError();
    }).toThrow("Boundary trigger error");
  });
});
