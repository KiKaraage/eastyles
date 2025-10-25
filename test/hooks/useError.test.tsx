import { ErrorSource, errorService } from "@services/errors/service";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ErrorSeverity, PopupErrorType, useError } from "../../hooks/useError";

// Mock the error service
vi.mock("@services/errors/service", () => ({
  errorService: {
    handleError: vi.fn(),
  },
  ErrorSource: {
    BACKGROUND: "background",
    POPUP: "popup",
    MANAGER: "manager",
    CONTENT: "content",
    STORAGE: "storage",
    MESSAGING: "messaging",
    IMPORT_EXPORT: "import_export",
    RUNTIME: "runtime",
  },
}));

// Mock useErrorHandling
vi.mock("../../hooks/useErrorHandling", () => ({
  useErrorHandling: vi.fn(() => ({
    error: null,
    isLoading: false,
    retryCount: 0,
    canRetry: false,
    isFatal: false,
    handleError: vi.fn(),
    retry: vi.fn(),
    clearError: vi.fn(),
    executeWithErrorHandling: vi.fn().mockImplementation(async (operation) => {
      try {
        return await operation();
      } catch {
        return null;
      }
    }),
    executeSyncWithErrorHandling: vi.fn().mockImplementation((operation) => {
      try {
        return operation();
      } catch {
        return null;
      }
    }),
  })),
}));

describe("useError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Error Management", () => {
    test("should initialize with no errors", () => {
      const { result } = renderHook(() => useError());

      expect(result.current.errors).toHaveLength(0);
      expect(result.current.hasError).toBe(false);
      expect(result.current.hasCriticalError).toBe(false);
    });

    test("should add error correctly", () => {
      const { result } = renderHook(() => useError());

      act(() => {
        result.current.addError({
          type: PopupErrorType.UNKNOWN_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: "Test error",
          recoverable: true,
        });
      });

      expect(result.current.errors).toHaveLength(1);
      expect(result.current.hasError).toBe(true);
      expect(result.current.hasCriticalError).toBe(false);
      expect(result.current.errors[0].message).toBe("Test error");
      expect(errorService.handleError).toHaveBeenCalledTimes(1);
    });

    test("should add critical error correctly", () => {
      const { result } = renderHook(() => useError());

      act(() => {
        result.current.addError({
          type: PopupErrorType.UNKNOWN_ERROR,
          severity: ErrorSeverity.CRITICAL,
          message: "Critical error",
          recoverable: false,
        });
      });

      expect(result.current.hasCriticalError).toBe(true);
    });

    test("should remove error by ID", () => {
      const { result } = renderHook(() => useError());

      act(() => {
        result.current.addError({
          type: PopupErrorType.UNKNOWN_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: "Test error",
          recoverable: true,
        });
      });

      expect(result.current.errors).toHaveLength(1);
      const errorId = result.current.errors[0].id;

      act(() => {
        result.current.removeError(errorId);
      });

      expect(result.current.errors).toHaveLength(0);
      expect(result.current.hasError).toBe(false);
    });

    test("should clear all errors", () => {
      const { result } = renderHook(() => useError());

      act(() => {
        result.current.addError({
          type: PopupErrorType.UNKNOWN_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: "Error 1",
          recoverable: true,
        });
        result.current.addError({
          type: PopupErrorType.STORAGE_ERROR,
          severity: ErrorSeverity.HIGH,
          message: "Error 2",
          recoverable: true,
        });
      });

      expect(result.current.errors).toHaveLength(2);

      act(() => {
        result.current.clearErrors();
      });

      expect(result.current.errors).toHaveLength(0);
      expect(result.current.hasError).toBe(false);
    });
  });

  describe("Error Statistics", () => {
    test("should return correct error statistics", () => {
      const { result } = renderHook(() => useError());

      act(() => {
        result.current.addError({
          type: PopupErrorType.UNKNOWN_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: "Error 1",
          recoverable: true,
        });
        result.current.addError({
          type: PopupErrorType.STORAGE_ERROR,
          severity: ErrorSeverity.HIGH,
          message: "Error 2",
          recoverable: true,
        });
        result.current.addError({
          type: PopupErrorType.UNKNOWN_ERROR,
          severity: ErrorSeverity.HIGH,
          message: "Error 3",
          recoverable: true,
        });
      });

      const stats = result.current.getErrorStats();
      expect(stats.total).toBe(3);
      expect(stats.byType.UNKNOWN_ERROR).toBe(2);
      expect(stats.byType.STORAGE_ERROR).toBe(1);
      expect(stats.bySeverity.MEDIUM).toBe(1);
      expect(stats.bySeverity.HIGH).toBe(2);
    });
  });

  describe("Auto-remove Old Errors", () => {
    test("should auto-remove errors older than 5 minutes", () => {
      const { result } = renderHook(() => useError());

      // Add an error
      act(() => {
        result.current.addError({
          type: PopupErrorType.UNKNOWN_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: "Old error",
          recoverable: true,
        });
      });

      expect(result.current.errors).toHaveLength(1);

      // Fast-forward time by 6 minutes
      act(() => {
        vi.advanceTimersByTime(6 * 60 * 1000);
      });

      expect(result.current.errors).toHaveLength(0);
    });

    test("should keep recent errors", () => {
      const { result } = renderHook(() => useError());

      // Add an error
      act(() => {
        result.current.addError({
          type: PopupErrorType.UNKNOWN_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: "Recent error",
          recoverable: true,
        });
      });

      expect(result.current.errors).toHaveLength(1);

      // Fast-forward time by 2 minutes (less than 5 minutes)
      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000);
      });

      expect(result.current.errors).toHaveLength(1);
    });

    test("should check every 5 minutes instead of every minute", () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      // Render the hook to trigger the useEffect
      renderHook(() => useError());

      // Check that setInterval was called with 5 minutes (300000 ms)
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        5 * 60000,
      );

      setIntervalSpy.mockRestore();
    });
  });

  describe("Error Reporting", () => {
    test("should report error to error service", () => {
      const { result } = renderHook(() => useError());
      const testError = new Error("Reported error");

      act(() => {
        result.current.reportError(testError, { context: "test" });
      });

      expect(errorService.handleError).toHaveBeenCalledWith(testError, {
        source: ErrorSource.POPUP,
        context: "test",
      });
    });
  });

  describe("Execute with Error Handling", () => {
    test("should execute successful async operation", async () => {
      const { result } = renderHook(() => useError());
      const operation = vi.fn().mockResolvedValue("success");

      let operationResult: unknown;
      await act(async () => {
        operationResult =
          await result.current.executeWithErrorHandling(operation);
      });

      expect(operationResult).toBe("success");
      expect(result.current.errors).toHaveLength(0);
    });

    test("should handle failed async operation", async () => {
      const { result } = renderHook(() => useError());
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("Operation failed"));

      let operationResult: unknown;
      await act(async () => {
        operationResult =
          await result.current.executeWithErrorHandling(operation);
      });

      expect(operationResult).toBeNull();
      expect(result.current.errors).toHaveLength(1);
      expect(result.current.errors[0].message).toBe("Operation failed");
    });

    test("should execute successful sync operation", () => {
      const { result } = renderHook(() => useError());
      const operation = vi.fn().mockReturnValue("sync success");

      let operationResult: unknown;
      act(() => {
        operationResult =
          result.current.executeSyncWithErrorHandling(operation);
      });

      expect(operationResult).toBe("sync success");
      expect(result.current.errors).toHaveLength(0);
    });

    test("should handle failed sync operation", () => {
      const { result } = renderHook(() => useError());
      const operation = vi.fn().mockImplementation(() => {
        throw new Error("Sync operation failed");
      });

      let operationResult: unknown;
      act(() => {
        operationResult =
          result.current.executeSyncWithErrorHandling(operation);
      });

      expect(operationResult).toBeNull();
      expect(result.current.errors).toHaveLength(1);
      expect(result.current.errors[0].message).toBe("Operation failed");
      expect(result.current.errors[0].details).toBe("Sync operation failed");
    });
  });
});
