/**
 * Error handling service for the Eastyles extension.
 * Provides centralized error management with classification, logging, and reporting.
 */

import { i18nService } from "../i18n/service";

/**
 * Error severity levels for classification and handling.
 */
export enum ErrorSeverity {
  /** Silent errors - logged but not shown to user */
  SILENT = "silent",
  /** Notify errors - shown to user with recovery options */
  NOTIFY = "notify",
  /** Fatal errors - require extension restart or significant intervention */
  FATAL = "fatal",
}

/**
 * Error sources within the extension.
 */
export enum ErrorSource {
  BACKGROUND = "background",
  POPUP = "popup",
  MANAGER = "manager",
  CONTENT = "content",
  STORAGE = "storage",
  MESSAGING = "messaging",
  IMPORT_EXPORT = "import_export",
  RUNTIME = "runtime",
}

/**
 * Base error class for all extension errors.
 */
export abstract class ExtensionError extends Error {
  public readonly severity: ErrorSeverity;
  public readonly source: ErrorSource;
  public readonly timestamp: number;
  public readonly context?: Record<string, unknown>;

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

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to a plain object for serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      severity: this.severity,
      source: this.source,
      timestamp: this.timestamp,
      context: this.context,
    };
  }

  /**
   * Check if this error should be shown to the user.
   */
  shouldNotifyUser(): boolean {
    return (
      this.severity === ErrorSeverity.NOTIFY ||
      this.severity === ErrorSeverity.FATAL
    );
  }

  /**
   * Check if this error is fatal and requires significant intervention.
   */
  isFatal(): boolean {
    return this.severity === ErrorSeverity.FATAL;
  }
}

/**
 * Storage-related errors.
 */
export class StorageError extends ExtensionError {
  constructor(
    message: string,
    severity: ErrorSeverity = ErrorSeverity.NOTIFY,
    context?: Record<string, unknown>,
  ) {
    super(message, severity, ErrorSource.STORAGE, context);
  }
}

/**
 * Storage quota exceeded error.
 */
export class StorageQuotaExceededError extends StorageError {
  constructor(context?: Record<string, unknown>) {
    super(i18nService.t("ERR_STORAGE_QUOTA"), ErrorSeverity.NOTIFY, context);
  }
}

/**
 * Invalid storage data error.
 */
export class StorageInvalidDataError extends StorageError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(
      i18nService.t("ERR_STORAGE_INVALID_DATA", [message]),
      ErrorSeverity.NOTIFY,
      context,
    );
  }
}

/**
 * Message passing related errors.
 */
export class MessageError extends ExtensionError {
  constructor(
    message: string,
    severity: ErrorSeverity = ErrorSeverity.NOTIFY,
    context?: Record<string, unknown>,
  ) {
    super(message, severity, ErrorSource.MESSAGING, context);
  }
}

/**
 * Message timeout error.
 */
export class MessageTimeoutError extends MessageError {
  constructor(
    messageType: string,
    attempts: number,
    context?: Record<string, unknown>,
  ) {
    super(
      i18nService.t("ERR_MESSAGE_TIMEOUT", [attempts.toString(), messageType]),
      ErrorSeverity.NOTIFY,
      { messageType, attempts, ...context },
    );
  }
}

/**
 * Invalid message error.
 */
export class MessageInvalidError extends MessageError {
  constructor(reason: string, context?: Record<string, unknown>) {
    super(
      i18nService.t("ERR_MESSAGE_INVALID", [reason]),
      ErrorSeverity.NOTIFY,
      context,
    );
  }
}

/**
 * Import/Export related errors.
 */
export class ImportExportError extends ExtensionError {
  constructor(
    message: string,
    severity: ErrorSeverity = ErrorSeverity.NOTIFY,
    context?: Record<string, unknown>,
  ) {
    super(message, severity, ErrorSource.IMPORT_EXPORT, context);
  }
}

/**
 * Invalid file format error.
 */
export class InvalidFileFormatError extends ImportExportError {
  constructor(
    expectedFormat: string,
    actualFormat?: string,
    context?: Record<string, unknown>,
  ) {
    const message = actualFormat
      ? i18nService.t("ERR_FILE_FORMAT_INVALID", [expectedFormat, actualFormat])
      : i18nService.t("ERR_FILE_FORMAT_INVALID", [expectedFormat, ""]);

    super(message, ErrorSeverity.NOTIFY, {
      expectedFormat,
      actualFormat,
      ...context,
    });
  }
}

/**
 * Data corruption error.
 */
export class DataCorruptedError extends ImportExportError {
  constructor(details: string, context?: Record<string, unknown>) {
    super(
      i18nService.t("ERR_DATA_CORRUPTED", [details]),
      ErrorSeverity.NOTIFY,
      context,
    );
  }
}

/**
 * Runtime errors for general application failures.
 */
export class RuntimeError extends ExtensionError {
  constructor(
    message: string,
    severity: ErrorSeverity = ErrorSeverity.NOTIFY,
    context?: Record<string, unknown>,
  ) {
    super(message, severity, ErrorSource.RUNTIME, context);
  }
}

/**
 * Browser API errors.
 */
export class BrowserAPIError extends RuntimeError {
  constructor(
    api: string,
    operation: string,
    originalError?: Error,
    context?: Record<string, unknown>,
  ) {
    const errorMessage = originalError?.message || "Unknown error";
    const message = i18nService.t("ERR_BROWSER_API", [
      api,
      operation,
      errorMessage,
    ]);
    super(message, ErrorSeverity.NOTIFY, {
      api,
      operation,
      originalError: originalError?.message,
      ...context,
    });
  }
}

/**
 * Permission denied error.
 */
export class PermissionDeniedError extends RuntimeError {
  constructor(permission: string, context?: Record<string, unknown>) {
    super(
      i18nService.t("ERR_PERMISSION_DENIED", [permission]),
      ErrorSeverity.FATAL,
      {
        permission,
        ...context,
      },
    );
  }
}

/**
 * Permission required error.
 */
export class PermissionRequiredError extends RuntimeError {
  constructor(permission: string, context?: Record<string, unknown>) {
    super(
      i18nService.t("ERR_PERMISSION_REQUIRED", [permission]),
      ErrorSeverity.NOTIFY,
      {
        permission,
        ...context,
      },
    );
  }
}

/**
 * Metadata parsing error.
 */
export class ParseMetadataError extends RuntimeError {
  constructor(context?: Record<string, unknown>) {
    super(i18nService.t("ERR_PARSE_METADATA"), ErrorSeverity.NOTIFY, context);
  }
}

/**
 * Preprocessor compilation error.
 */
export class PreprocessorCompileError extends RuntimeError {
  constructor(context?: Record<string, unknown>) {
    super(
      i18nService.t("ERR_PREPROCESSOR_COMPILE"),
      ErrorSeverity.NOTIFY,
      context,
    );
  }
}

/**
 * CSS injection CSP error.
 */
export class InjectionCSPError extends RuntimeError {
  constructor(context?: Record<string, unknown>) {
    super(i18nService.t("ERR_INJECTION_CSP"), ErrorSeverity.NOTIFY, context);
  }
}

/**
 * Font loading error.
 */
export class FontLoadError extends RuntimeError {
  constructor(fontName: string, context?: Record<string, unknown>) {
    super(i18nService.t("ERR_FONT_LOAD", [fontName]), ErrorSeverity.NOTIFY, {
      fontName,
      ...context,
    });
  }
}

/**
 * Error classification and handling service.
 */
export class ErrorService {
  private errorListeners: Array<(error: ExtensionError) => void> = [];
  private errorCounts: Map<string, number> = new Map();
  private isDebuggingEnabled = false;
  private autoReportingEnabled = true;

  /**
   * Set debugging mode for verbose error logging.
   */
  setDebuggingEnabled(enabled: boolean): void {
    this.isDebuggingEnabled = enabled;
    reporter.setDebuggingEnabled(enabled);
  }

  /**
   * Enable or disable automatic error reporting.
   */
  setAutoReportingEnabled(enabled: boolean): void {
    this.autoReportingEnabled = enabled;
  }

  /**
   * Check if automatic reporting is enabled.
   */
  isAutoReportingEnabled(): boolean {
    return this.autoReportingEnabled;
  }

  /**
   * Add error listener for custom error handling.
   */
  addErrorListener(listener: (error: ExtensionError) => void): () => void {
    this.errorListeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index !== -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  /**
   * Handle an error through the error service.
   */
  handleError(
    error: Error | ExtensionError,
    context?: Record<string, unknown>,
  ): ExtensionError {
    let extensionError: ExtensionError;

    // Convert regular errors to ExtensionError
    if (error instanceof ExtensionError) {
      extensionError = error;
    } else {
      extensionError = new RuntimeError(
        error.message || "Unknown error",
        ErrorSeverity.NOTIFY,
        { originalError: error.message, stack: error.stack, ...context },
      );
    }

    // Track error counts
    const errorKey = `${extensionError.source}:${extensionError.name}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    // Automatic error reporting
    if (this.autoReportingEnabled) {
      try {
        reporter.reportError(extensionError);
      } catch (reportingError) {
        // Prevent infinite loops by not reporting reporting errors
        if (this.isDebuggingEnabled) {
          console.error("Failed to report error:", reportingError);
        }
      }
    }

    // Debug logging
    if (this.isDebuggingEnabled) {
      console.error("ErrorService handling error:", {
        error: extensionError.toJSON(),
        count: currentCount + 1,
        reported: this.autoReportingEnabled,
      });
    }

    // Notify listeners
    this.errorListeners.forEach((listener) => {
      try {
        listener(extensionError);
      } catch (listenerError) {
        console.error("Error in error listener:", listenerError);
      }
    });

    return extensionError;
  }

  /**
   * Create and handle a storage error.
   */
  createStorageError(
    message: string,
    context?: Record<string, unknown>,
  ): StorageError {
    const error = new StorageError(message, ErrorSeverity.NOTIFY, context);
    this.handleError(error);
    return error;
  }

  /**
   * Create and handle a message error.
   */
  createMessageError(
    message: string,
    context?: Record<string, unknown>,
  ): MessageError {
    const error = new MessageError(message, ErrorSeverity.NOTIFY, context);
    this.handleError(error);
    return error;
  }

  /**
   * Create and handle an import/export error.
   */
  createImportExportError(
    message: string,
    context?: Record<string, unknown>,
  ): ImportExportError {
    const error = new ImportExportError(message, ErrorSeverity.NOTIFY, context);
    this.handleError(error);
    return error;
  }

  /**
   * Create and handle a runtime error.
   */
  createRuntimeError(
    message: string,
    context?: Record<string, unknown>,
  ): RuntimeError {
    const error = new RuntimeError(message, ErrorSeverity.NOTIFY, context);
    this.handleError(error);
    return error;
  }

  /**
   * Get error statistics.
   */
  getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.errorCounts.forEach((count, key) => {
      stats[key] = count;
    });
    return stats;
  }

  /**
   * Clear error statistics.
   */
  clearErrorStats(): void {
    this.errorCounts.clear();
  }

  /**
   * Check if an error type has exceeded a threshold.
   */
  hasErrorExceededThreshold(
    source: ErrorSource,
    errorName: string,
    threshold: number,
  ): boolean {
    const errorKey = `${source}:${errorName}`;
    const count = this.errorCounts.get(errorKey) || 0;
    return count >= threshold;
  }

  /**
   * Get total error count.
   */
  getTotalErrorCount(): number {
    let total = 0;
    this.errorCounts.forEach((count) => {
      total += count;
    });
    return total;
  }

  /**
   * Get error analytics from the reporter.
   */
  getErrorAnalytics() {
    return reporter.getAnalytics();
  }

  /**
   * Get error reports from the reporter.
   */
  getErrorReports(filter?: Parameters<typeof reporter.getErrorReports>[0]) {
    return reporter.getErrorReports(filter);
  }

  /**
   * Get error health score.
   */
  getHealthScore(): number {
    return reporter.getHealthScore();
  }

  /**
   * Export all error data.
   */
  exportErrorData(): string {
    return reporter.exportReports();
  }

  /**
   * Clear all error data.
   */
  clearErrorData(): void {
    this.errorCounts.clear();
    reporter.clearReports();
  }
}

// Export singleton instance
export const errorService = new ErrorService();

// Import error reporter after service initialization to avoid circular dependencies
import { reporter } from "./reporter";

/**
 * Utility function to wrap async functions with error handling.
 */
export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  errorContext?: Record<string, unknown>,
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error: unknown) {
      const extensionError = errorService.handleError(
        error instanceof Error ? error : new Error(String(error)),
        errorContext,
      );
      throw extensionError;
    }
  };
}

/**
 * Utility function to wrap sync functions with error handling.
 */
export function withSyncErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => R,
  errorContext?: Record<string, unknown>,
): (...args: T) => R {
  return (...args: T): R => {
    try {
      return fn(...args);
    } catch (error: unknown) {
      const extensionError = errorService.handleError(
        error instanceof Error ? error : new Error(String(error)),
        errorContext,
      );
      throw extensionError;
    }
  };
}
