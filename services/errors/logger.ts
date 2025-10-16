/**
 * Error logger with configurable logging levels for the Eastyles extension.
 * Provides structured logging with different output strategies for development and production.
 */

import { ErrorSeverity, ErrorSource, ExtensionError } from "./service";

/**
 * Logging levels for controlling log output verbosity.
 */
export enum LogLevel {
  /** No logging */
  NONE = 0,
  /** Only fatal errors */
  FATAL = 1,
  /** Fatal and notify errors */
  ERROR = 2,
  /** Errors and warnings */
  WARN = 3,
  /** Errors, warnings, and info */
  INFO = 4,
  /** All logging including debug */
  DEBUG = 5,
}

/**
 * Log entry structure for consistent logging format.
 */
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  severity: ErrorSeverity;
  source: ErrorSource;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
  error?: ExtensionError;
}

/**
 * Logger configuration options.
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Whether to include stack traces in logs */
  includeStackTrace: boolean;
  /** Whether to include context data in logs */
  includeContext: boolean;
  /** Maximum number of log entries to keep in memory */
  maxEntries: number;
  /** Whether to use console output */
  enableConsole: boolean;
  /** Whether to persist logs to storage */
  enablePersistence: boolean;
}

/**
 * Default logger configuration.
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.ERROR,
  includeStackTrace: true,
  includeContext: true,
  maxEntries: 1000,
  enableConsole: true,
  enablePersistence: false,
};

/**
 * Error logger class with configurable output and filtering.
 */
export class ErrorLogger {
  private config: LoggerConfig;
  private logEntries: LogEntry[] = [];
  private isDebuggingEnabled = false;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update logger configuration.
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set debugging mode for development logging.
   */
  setDebuggingEnabled(enabled: boolean): void {
    this.isDebuggingEnabled = enabled;

    // Automatically adjust log level in debug mode
    if (enabled && this.config.level < LogLevel.DEBUG) {
      this.config.level = LogLevel.DEBUG;
    }
  }

  /**
   * Log an ExtensionError.
   */
  logError(error: ExtensionError): void {
    const logLevel = this.severityToLogLevel(error.severity);

    if (!this.shouldLog(logLevel)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: error.timestamp,
      level: logLevel,
      severity: error.severity,
      source: error.source,
      message: error.message,
      context: this.config.includeContext ? error.context : undefined,
      stack: this.config.includeStackTrace ? error.stack : undefined,
      error,
    };

    this.addLogEntry(entry);
    this.outputLog(entry);
  }

  /**
   * Log a custom message with specified level and source.
   */
  log(
    level: LogLevel,
    source: ErrorSource,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      severity: this.logLevelToSeverity(level),
      source,
      message,
      context: this.config.includeContext ? context : undefined,
    };

    this.addLogEntry(entry);
    this.outputLog(entry);
  }

  /**
   * Log a debug message.
   */
  debug(
    source: ErrorSource,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.DEBUG, source, message, context);
  }

  /**
   * Log an info message.
   */
  info(
    source: ErrorSource,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.INFO, source, message, context);
  }

  /**
   * Log a warning message.
   */
  warn(
    source: ErrorSource,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.WARN, source, message, context);
  }

  /**
   * Log an error message.
   */
  error(
    source: ErrorSource,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.ERROR, source, message, context);
  }

  /**
   * Log a fatal message.
   */
  fatal(
    source: ErrorSource,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.log(LogLevel.FATAL, source, message, context);
  }

  /**
   * Get all log entries.
   */
  getLogEntries(): readonly LogEntry[] {
    return [...this.logEntries];
  }

  /**
   * Get log entries filtered by criteria.
   */
  getFilteredLogEntries(filter: {
    level?: LogLevel;
    severity?: ErrorSeverity;
    source?: ErrorSource;
    since?: number;
  }): LogEntry[] {
    return this.logEntries.filter((entry) => {
      if (filter.level !== undefined && entry.level < filter.level) {
        return false;
      }
      if (filter.severity !== undefined && entry.severity !== filter.severity) {
        return false;
      }
      if (filter.source !== undefined && entry.source !== filter.source) {
        return false;
      }
      if (filter.since !== undefined && entry.timestamp < filter.since) {
        return false;
      }
      return true;
    });
  }

  /**
   * Clear all log entries.
   */
  clearLogs(): void {
    this.logEntries = [];
  }

  /**
   * Get log statistics.
   */
  getLogStats(): Record<string, number> {
    const stats: Record<string, number> = {
      total: this.logEntries.length,
      fatal: 0,
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
    };

    this.logEntries.forEach((entry) => {
      switch (entry.level) {
        case LogLevel.FATAL:
          stats.fatal++;
          break;
        case LogLevel.ERROR:
          stats.error++;
          break;
        case LogLevel.WARN:
          stats.warn++;
          break;
        case LogLevel.INFO:
          stats.info++;
          break;
        case LogLevel.DEBUG:
          stats.debug++;
          break;
      }
    });

    return stats;
  }

  /**
   * Export logs as JSON string.
   */
  exportLogs(): string {
    return JSON.stringify(
      {
        config: this.config,
        entries: this.logEntries,
        exportedAt: Date.now(),
      },
      null,
      2,
    );
  }

  /**
   * Check if a log level should be output.
   */
  private shouldLog(level: LogLevel): boolean {
    return level <= this.config.level && level !== LogLevel.NONE;
  }

  /**
   * Convert error severity to log level.
   */
  private severityToLogLevel(severity: ErrorSeverity): LogLevel {
    switch (severity) {
      case ErrorSeverity.SILENT:
        return LogLevel.DEBUG;
      case ErrorSeverity.NOTIFY:
        return LogLevel.ERROR;
      case ErrorSeverity.FATAL:
        return LogLevel.FATAL;
      default:
        return LogLevel.ERROR;
    }
  }

  /**
   * Convert log level to error severity.
   */
  private logLevelToSeverity(level: LogLevel): ErrorSeverity {
    switch (level) {
      case LogLevel.FATAL:
        return ErrorSeverity.FATAL;
      case LogLevel.ERROR:
        return ErrorSeverity.NOTIFY;
      case LogLevel.WARN:
      case LogLevel.INFO:
      case LogLevel.DEBUG:
        return ErrorSeverity.SILENT;
      default:
        return ErrorSeverity.SILENT;
    }
  }

  /**
   * Add a log entry to the internal storage.
   */
  private addLogEntry(entry: LogEntry): void {
    this.logEntries.push(entry);

    // Trim entries if over limit
    if (this.logEntries.length > this.config.maxEntries) {
      this.logEntries = this.logEntries.slice(-this.config.maxEntries);
    }
  }

  /**
   * Output log entry to console and/or storage based on configuration.
   */
  private outputLog(entry: LogEntry): void {
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    if (this.config.enablePersistence) {
      this.outputToStorage(entry);
    }
  }

  /**
   * Output log entry to console with appropriate styling.
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${entry.source.toUpperCase()}] [${LogLevel[entry.level]}]`;
    const message = `[ea-Logger] ${prefix} ${entry.message}`;

    // Choose appropriate console method based on log level
    switch (entry.level) {
      case LogLevel.FATAL:
      case LogLevel.ERROR:
        console.error(message, entry.context || "", entry.stack || "");
        break;
      case LogLevel.WARN:
        console.warn(message, entry.context || "");
        break;
      case LogLevel.INFO:
        console.info(message, entry.context || "");
        break;
      case LogLevel.DEBUG:
        if (this.isDebuggingEnabled) {
          console.debug(message, entry.context || "");
        }
        break;
      default:
        console.log(`[ea] ${message}`, entry.context || "");
    }
  }

  /**
   * Output log entry to persistent storage (placeholder for future implementation).
   */
  private outputToStorage(_entry: LogEntry): void {
    // TODO: Implement persistent storage when storage service is available
    // For now, this is a placeholder for future implementation
  }
}

/**
 * Create logger with development-friendly defaults.
 */
export function createDevelopmentLogger(): ErrorLogger {
  return new ErrorLogger({
    level: LogLevel.DEBUG,
    includeStackTrace: true,
    includeContext: true,
    maxEntries: 500,
    enableConsole: true,
    enablePersistence: false,
  });
}

/**
 * Create logger with production-friendly defaults.
 */
export function createProductionLogger(): ErrorLogger {
  return new ErrorLogger({
    level: LogLevel.ERROR,
    includeStackTrace: false,
    includeContext: false,
    maxEntries: 100,
    enableConsole: false,
    enablePersistence: true,
  });
}

// Export singleton logger instance
export const logger = new ErrorLogger();
