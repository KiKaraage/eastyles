/**
 * Hook for error handling in Eastyles extension
 * Provides centralized error management with reporting and recovery options
 */

import { useCallback, useEffect, useState } from "react";
import { ErrorSource, errorService } from "../services/errors/service";
import { useErrorHandling } from "./useErrorHandling";

/**
 * Error types for popup operations
 */
export enum PopupErrorType {
  STORAGE_ERROR = "STORAGE_ERROR",
  MESSAGE_ERROR = "MESSAGE_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

/**
 * Popup error interface
 */
export interface PopupError {
  id: string;
  type: PopupErrorType;
  severity: ErrorSeverity;
  message: string;
  details?: string;
  timestamp: number;
  recoverable: boolean;
  action?: {
    label: string;
    callback: () => void;
  };
}

/**
 * Hook return interface
 */
export interface UseErrorReturn {
  /** Current errors */
  errors: PopupError[];
  /** Whether any error is currently active */
  hasError: boolean;
  /** Whether any critical error is active */
  hasCriticalError: boolean;
  /** Add a new error */
  addError: (error: Omit<PopupError, "id" | "timestamp">) => void;
  /** Remove an error by ID */
  removeError: (id: string) => void;
  /** Clear all errors */
  clearErrors: () => void;
  /** Execute operation with error handling */
  executeWithErrorHandling: <T>(
    operation: () => Promise<T>,
    options?: {
      errorMessage?: string;
      errorType?: PopupErrorType;
      severity?: ErrorSeverity;
      recoverable?: boolean;
      action?: PopupError["action"];
    },
  ) => Promise<T | null>;
  /** Execute sync operation with error handling */
  executeSyncWithErrorHandling: <T>(
    operation: () => T,
    options?: {
      errorMessage?: string;
      errorType?: PopupErrorType;
      severity?: ErrorSeverity;
      recoverable?: boolean;
      action?: PopupError["action"];
    },
  ) => T | null;
  /** Report error to error service */
  reportError: (error: Error, context?: Record<string, unknown>) => void;
  /** Get error statistics */
  getErrorStats: () => {
    total: number;
    byType: Record<PopupErrorType, number>;
    bySeverity: Record<ErrorSeverity, number>;
  };
}

/**
 * Hook for error handling in popup components
 */
export function useError(): UseErrorReturn {
  const [errors, setErrors] = useState<PopupError[]>([]);
  const { executeWithErrorHandling: executeWithErrorHandlingBase } =
    useErrorHandling({
      source: ErrorSource.POPUP,
      maxRetries: 3,
      autoRetry: true,
    });

  // Add error to state
  const addError = useCallback(
    (errorData: Omit<PopupError, "id" | "timestamp">) => {
      const newError: PopupError = {
        ...errorData,
        id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      };

      setErrors((prev) => [...prev, newError]);

      // Log to error service
      errorService.handleError(new Error(newError.message), {
        source: ErrorSource.POPUP,
        errorType: newError.type,
        severity: newError.severity,
        recoverable: newError.recoverable,
      });

      return newError.id;
    },
    [],
  );

  // Remove error by ID
  const removeError = useCallback((id: string) => {
    setErrors((prev) => prev.filter((error) => error.id !== id));
  }, []);

  // Clear all errors
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  // Execute async operation with error handling
  const executeWithErrorHandling = useCallback(
    async <T>(
      operation: () => Promise<T>,
      options: {
        errorMessage?: string;
        errorType?: PopupErrorType;
        severity?: ErrorSeverity;
        recoverable?: boolean;
        action?: PopupError["action"];
      } = {},
    ): Promise<T | null> => {
      const {
        errorMessage = "Operation failed",
        errorType = PopupErrorType.UNKNOWN_ERROR,
        severity = ErrorSeverity.MEDIUM,
        recoverable = true,
        action,
      } = options;

      try {
        const result = await executeWithErrorHandlingBase(operation, {
          context: {
            errorType,
            severity,
            recoverable,
          },
        });

        if (result !== null) {
          return result;
        }

        // If operation failed but no error was thrown, add a generic error
        addError({
          type: errorType,
          severity,
          message: errorMessage,
          recoverable,
          action,
        });

        return null;
      } catch (error) {
        // Convert error to PopupError format
        const errorObj =
          error instanceof Error ? error : new Error(String(error));

        addError({
          type: errorType,
          severity,
          message: errorMessage,
          details: errorObj.message,
          recoverable,
          action,
        });

        return null;
      }
    },
    [addError, executeWithErrorHandlingBase],
  );

  // Execute sync operation with error handling
  const executeSyncWithErrorHandling = useCallback(
    <T>(
      operation: () => T,
      options: {
        errorMessage?: string;
        errorType?: PopupErrorType;
        severity?: ErrorSeverity;
        recoverable?: boolean;
        action?: PopupError["action"];
      } = {},
    ): T | null => {
      const {
        errorMessage = "Operation failed",
        errorType = PopupErrorType.UNKNOWN_ERROR,
        severity = ErrorSeverity.MEDIUM,
        recoverable = true,
        action,
      } = options;

      try {
        const result = operation();
        return result;
      } catch (error) {
        const errorObj =
          error instanceof Error ? error : new Error(String(error));

        addError({
          type: errorType,
          severity,
          message: errorMessage,
          details: errorObj.message,
          recoverable,
          action,
        });

        return null;
      }
    },
    [addError],
  );

  // Report error to error service
  const reportError = useCallback(
    (error: Error, context?: Record<string, unknown>) => {
      errorService.handleError(error, {
        source: ErrorSource.POPUP,
        ...context,
      });
    },
    [],
  );

  // Get error statistics
  const getErrorStats = useCallback(() => {
    const stats = {
      total: errors.length,
      byType: Object.values(PopupErrorType).reduce(
        (acc, type) => {
          acc[type] = 0;
          return acc;
        },
        {} as Record<PopupErrorType, number>,
      ),
      bySeverity: Object.values(ErrorSeverity).reduce(
        (acc, severity) => {
          acc[severity] = 0;
          return acc;
        },
        {} as Record<ErrorSeverity, number>,
      ),
    };

    errors.forEach((error) => {
      stats.byType[error.type]++;
      stats.bySeverity[error.severity]++;
    });

    return stats;
  }, [errors]);

  // Auto-remove old errors (older than 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      setErrors((prev) =>
        prev.filter((error) => error.timestamp > fiveMinutesAgo),
      );
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Execute error actions automatically when added
  useEffect(() => {
    errors.forEach((error) => {
      if (error.action) {
        // Auto-execute action for certain error types
        if (
          error.type === PopupErrorType.STORAGE_ERROR ||
          error.type === PopupErrorType.MESSAGE_ERROR
        ) {
          setTimeout(() => {
            error.action?.callback();
          }, 1000); // Delay execution
        }
      }
    });
  }, [errors]);

  return {
    errors,
    hasError: errors.length > 0,
    hasCriticalError: errors.some(
      (error) => error.severity === ErrorSeverity.CRITICAL,
    ),
    addError,
    removeError,
    clearErrors,
    executeWithErrorHandling,
    executeSyncWithErrorHandling,
    reportError,
    getErrorStats,
  };
}

/**
 * Hook for error recovery actions
 */
export function useErrorRecovery() {
  const { clearErrors } = useError();

  const retryLastOperation = useCallback(() => {
    // Implementation would depend on the specific operation
    console.log("[ea] Retrying last operation...");
  }, []);

  const dismissError = useCallback(
    (_id: string) => {
      clearErrors();
    },
    [clearErrors],
  );

  const showErrorDetails = useCallback((id: string) => {
    // Implementation for showing error details in a modal or toast
    console.log("[ea] Showing error details for:", id);
  }, []);

  return {
    retryLastOperation,
    dismissError,
    showErrorDetails,
  };
}

/**
 * Hook for error notifications
 */
export function useErrorNotifications() {
  const { errors, removeError } = useError();

  useEffect(() => {
    // Show notifications for new errors
    const newErrors = errors.filter(
      (error) => error.timestamp > Date.now() - 5000,
    );

    newErrors.forEach((error) => {
      // In a real implementation, this would show a toast notification
      console.log(`[ea-ErrorNotification] ${error.severity}: ${error.message}`);

      // Auto-dismiss after certain time based on severity
      const dismissTime =
        error.severity === ErrorSeverity.CRITICAL
          ? 10000
          : error.severity === ErrorSeverity.HIGH
            ? 5000
            : 3000;

      setTimeout(() => {
        removeError(error.id);
      }, dismissTime);
    });
  }, [errors, removeError]);
}
