import { useCallback, useEffect, useState, useRef } from "react";
import {
  errorService,
  ExtensionError,
  ErrorSource,
} from "../services/errors/service";

interface ErrorState {
  error: ExtensionError | null;
  isLoading: boolean;
  retryCount: number;
}

interface UseErrorHandlingOptions {
  /** Maximum number of automatic retries */
  maxRetries?: number;
  /** Whether to automatically retry on non-fatal errors */
  autoRetry?: boolean;
  /** Custom error handler */
  onError?: (error: ExtensionError) => void;
  /** Custom recovery handler */
  onRecover?: () => void;
  /** Error source for reporting */
  source?: ErrorSource;
}

interface UseErrorHandlingReturn {
  /** Current error state */
  error: ExtensionError | null;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Number of retry attempts made */
  retryCount: number;
  /** Whether the error is recoverable */
  canRetry: boolean;
  /** Whether the error is fatal */
  isFatal: boolean;
  /** Handle an error */
  handleError: (
    error: Error | ExtensionError,
    context?: Record<string, unknown>,
  ) => void;
  /** Retry the failed operation */
  retry: () => void;
  /** Clear the current error */
  clearError: () => void;
  /** Execute an async operation with error handling */
  executeWithErrorHandling: <T>(
    operation: () => Promise<T>,
    context?: Record<string, unknown>,
  ) => Promise<T | null>;
  /** Execute a sync operation with error handling */
  executeSyncWithErrorHandling: <T>(
    operation: () => T,
    context?: Record<string, unknown>,
  ) => T | null;
}

/**
 * Hook for handling errors in React components with automatic recovery strategies.
 */
export function useErrorHandling(
  options: UseErrorHandlingOptions = {},
): UseErrorHandlingReturn {
  const {
    maxRetries = 3,
    autoRetry = false,
    onError,
    onRecover,
    source = ErrorSource.POPUP,
  } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isLoading: false,
    retryCount: 0,
  });

  const [retryCallback, setRetryCallback] = useState<
    (() => Promise<void>) | null
  >(null);

  const handleErrorRef =
    useRef<
      (error: Error | ExtensionError, context?: Record<string, unknown>) => void
    >();

  // Retry the failed operation
  const retry = useCallback(async () => {
    if (!retryCallback || errorState.retryCount >= maxRetries) {
      return;
    }

    setErrorState((prev) => ({
      error: null,
      isLoading: true,
      retryCount: prev.retryCount + 1,
    }));

    try {
      await retryCallback();
      setErrorState((prev) => ({
        ...prev,
        isLoading: false,
      }));
      onRecover?.();
    } catch (error) {
      handleErrorRef.current?.(
        error instanceof Error ? error : new Error(String(error)),
        {
          isRetry: true,
          retryAttempt: errorState.retryCount + 1,
        },
      );
    }
  }, [retryCallback, errorState.retryCount, maxRetries, onRecover]);

  // Handle error with proper ExtensionError creation and preservation
  const handleError = useCallback(
    (error: Error | ExtensionError, context?: Record<string, unknown>) => {
      // For ExtensionError instances, preserve the original error
      // For regular Error instances, let errorService handle conversion
      const handledError = errorService.handleError(error, {
        source,
        ...context,
      });

      setErrorState((prev) => ({
        ...prev,
        error: handledError,
        isLoading: false,
      }));

      // Call custom error handler with the handled error
      onError?.(handledError);

      // Auto-retry for non-fatal errors
      if (
        autoRetry &&
        !handledError.isFatal() &&
        errorState.retryCount < maxRetries &&
        retryCallback
      ) {
        const retryDelay = Math.min(
          1000 * Math.pow(2, errorState.retryCount),
          5000,
        );
        setTimeout(() => handleErrorRef.current?.(error), retryDelay);
      }
    },
    [
      source,
      onError,
      autoRetry,
      maxRetries,
      errorState.retryCount,
      // retryCallback, // Removed from dependency array
      // retry, // Removed from dependency array
    ],
  );

  // Update the ref whenever handleError changes
  useEffect(() => {
    handleErrorRef.current = handleError;
  }, [handleError]);

  // Clear the current error
  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isLoading: false,
      retryCount: 0,
    });
    setRetryCallback(null);
  }, []);

  // Execute async operation with error handling
  const executeWithErrorHandling = useCallback(
    async <T>(
      operation: () => Promise<T>,
      context?: Record<string, unknown>,
    ): Promise<T | null> => {
      setErrorState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      // Store retry callback
      setRetryCallback(() => async () => {
        await operation();
      });

      try {
        const result = await operation();
        setErrorState((prev) => ({
          ...prev,
          isLoading: false,
        }));
        return result;
      } catch (error) {
        handleError(error instanceof Error ? error : new Error(String(error)), {
          source,
          ...context,
        });
        return null;
      }
    },
    [handleError, source],
  );

  // Execute sync operation with error handling
  const executeSyncWithErrorHandling = useCallback(
    <T>(operation: () => T, context?: Record<string, unknown>): T | null => {
      setErrorState((prev) => ({
        ...prev,
        error: null,
      }));

      // Store retry callback
      setRetryCallback(() => async () => {
        operation();
      });

      try {
        const result = operation();
        return result;
      } catch (error) {
        handleError(error instanceof Error ? error : new Error(String(error)), {
          source,
          ...context,
        });
        return null;
      }
    },
    [handleError, source],
  );

  // Computed properties
  const canRetry =
    errorState.retryCount < maxRetries && !errorState.error?.isFatal();

  const isFatal = errorState.error?.isFatal() || false;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setRetryCallback(null);
    };
  }, []);

  return {
    error: errorState.error,
    isLoading: errorState.isLoading,
    retryCount: errorState.retryCount,
    canRetry,
    isFatal,
    handleError,
    retry,
    clearError,
    executeWithErrorHandling,
    executeSyncWithErrorHandling,
  };
}

/**
 * Hook for getting error analytics and reports.
 */
export function useErrorAnalytics() {
  const [analytics, setAnalytics] = useState(() =>
    errorService.getErrorAnalytics(),
  );
  const [healthScore, setHealthScore] = useState(() =>
    errorService.getHealthScore(),
  );

  const refreshAnalytics = useCallback(() => {
    setAnalytics(errorService.getErrorAnalytics());
    setHealthScore(errorService.getHealthScore());
  }, []);

  const exportErrorData = useCallback(() => {
    return errorService.exportErrorData();
  }, []);

  const clearErrorData = useCallback(() => {
    errorService.clearErrorData();
    refreshAnalytics();
  }, [refreshAnalytics]);

  const getErrorReports = useCallback(
    (filter?: Parameters<typeof errorService.getErrorReports>[0]) => {
      return errorService.getErrorReports(filter);
    },
    [],
  );

  useEffect(() => {
    // Add error listener to refresh analytics on new errors
    const unsubscribe = errorService.addErrorListener(() => {
      refreshAnalytics();
    });

    return unsubscribe;
  }, [refreshAnalytics]);

  return {
    analytics,
    healthScore,
    refreshAnalytics,
    exportErrorData,
    clearErrorData,
    getErrorReports,
  };
}

/**
 * Hook for error boundary integration.
 */
export function useErrorBoundary() {
  const [error, setError] = useState<Error | null>(null);
  const [errorInfo, setErrorInfo] = useState<React.ErrorInfo | null>(null);

  const reportError = useCallback(
    (error: Error, errorInfo?: React.ErrorInfo) => {
      // Report to error service
      errorService.handleError(error, {
        source: ErrorSource.POPUP,
        errorInfo,
      });

      // Set the error state
      setError(error);
      if (errorInfo) {
        setErrorInfo(errorInfo);
      }
    },
    [],
  );

  const resetError = useCallback(() => {
    setError(null);
    setErrorInfo(null);
  }, []);

  // Return the error state so tests can access it
  // The actual throwing should be handled by the component using this hook
  return {
    reportError,
    resetError,
    error,
    errorInfo,
    // Include a method to trigger throwing for testing
    throwError: () => {
      if (error) {
        throw error;
      }
    },
  };
}
