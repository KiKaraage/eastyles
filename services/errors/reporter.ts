/**
 * Error reporter for aggregating, analyzing, and reporting extension errors.
 * Provides error tracking, analytics, and reporting capabilities.
 */

import { ExtensionError, ErrorSeverity, ErrorSource } from "./service";
import { logger } from "./logger";

/**
 * Error report structure for analysis and reporting.
 */
export interface ErrorReport {
  id: string;
  timestamp: number;
  error: ExtensionError;
  frequency: number;
  firstOccurrence: number;
  lastOccurrence: number;
  context: Record<string, unknown>[];
  userAgent?: string;
  extensionVersion?: string;
}

/**
 * Error analytics data.
 */
export interface ErrorAnalytics {
  totalErrors: number;
  errorsBySource: Record<ErrorSource, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByType: Record<string, number>;
  mostFrequentErrors: ErrorReport[];
  recentErrors: ErrorReport[];
  errorTrends: {
    hourly: number[];
    daily: number[];
  };
}

/**
 * Reporter configuration options.
 */
export interface ReporterConfig {
  /** Maximum number of error reports to keep */
  maxReports: number;
  /** Whether to track error trends over time */
  enableTrends: boolean;
  /** Whether to collect browser/extension info */
  collectSystemInfo: boolean;
  /** Minimum frequency to include in frequent errors */
  frequentErrorThreshold: number;
  /** Maximum age of errors to include in analytics (in milliseconds) */
  maxErrorAge: number;
}

/**
 * Default reporter configuration.
 */
const DEFAULT_CONFIG: ReporterConfig = {
  maxReports: 500,
  enableTrends: true,
  collectSystemInfo: true,
  frequentErrorThreshold: 3,
  maxErrorAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Error reporter class for tracking and analyzing extension errors.
 */
export class ErrorReporter {
  private config: ReporterConfig;
  private errorReports: Map<string, ErrorReport> = new Map();
  private errorTrends: {
    hourly: number[];
    daily: number[];
  } = {
    hourly: new Array(24).fill(0),
    daily: new Array(7).fill(0),
  };
  private isDebuggingEnabled = false;

  constructor(config: Partial<ReporterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update reporter configuration.
   */
  updateConfig(config: Partial<ReporterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set debugging mode for development reporting.
   */
  setDebuggingEnabled(enabled: boolean): void {
    this.isDebuggingEnabled = enabled;
  }

  /**
   * Report an error to the reporter.
   */
  reportError(error: ExtensionError): void {
    const errorId = this.generateErrorId(error);
    const existingReport = this.errorReports.get(errorId);

    if (existingReport) {
      // Update existing report
      existingReport.frequency++;
      existingReport.lastOccurrence = error.timestamp;
      existingReport.context.push(error.context || {});

      // Keep only recent context entries
      if (existingReport.context.length > 10) {
        existingReport.context = existingReport.context.slice(-10);
      }
    } else {
      // Create new report
      const newReport: ErrorReport = {
        id: errorId,
        timestamp: error.timestamp,
        error,
        frequency: 1,
        firstOccurrence: error.timestamp,
        lastOccurrence: error.timestamp,
        context: [error.context || {}],
        userAgent: this.config.collectSystemInfo
          ? navigator.userAgent
          : undefined,
        extensionVersion: this.config.collectSystemInfo
          ? this.getExtensionVersion()
          : undefined,
      };

      this.errorReports.set(errorId, newReport);
    }

    // Update trends
    if (this.config.enableTrends) {
      this.updateErrorTrends(error.timestamp);
    }

    // Clean up old reports
    this.cleanupOldReports();

    // Debug logging
    if (this.isDebuggingEnabled) {
      logger.debug(ErrorSource.RUNTIME, `Error reported: ${errorId}`, {
        frequency: this.errorReports.get(errorId)?.frequency,
      });
    }
  }

  /**
   * Get comprehensive error analytics.
   */
  getAnalytics(): ErrorAnalytics {
    const reports = Array.from(this.errorReports.values());
    const cutoffTime = Date.now() - this.config.maxErrorAge;
    const recentReports = reports.filter(
      (report) => report.lastOccurrence > cutoffTime,
    );

    // Count by source
    const errorsBySource: Record<ErrorSource, number> = {
      [ErrorSource.BACKGROUND]: 0,
      [ErrorSource.POPUP]: 0,
      [ErrorSource.MANAGER]: 0,
      [ErrorSource.CONTENT]: 0,
      [ErrorSource.STORAGE]: 0,
      [ErrorSource.MESSAGING]: 0,
      [ErrorSource.IMPORT_EXPORT]: 0,
      [ErrorSource.RUNTIME]: 0,
    };

    // Count by severity
    const errorsBySeverity: Record<ErrorSeverity, number> = {
      [ErrorSeverity.SILENT]: 0,
      [ErrorSeverity.NOTIFY]: 0,
      [ErrorSeverity.FATAL]: 0,
    };

    // Count by type
    const errorsByType: Record<string, number> = {};

    let totalErrors = 0;

    recentReports.forEach((report) => {
      totalErrors += report.frequency;
      errorsBySource[report.error.source] += report.frequency;
      errorsBySeverity[report.error.severity] += report.frequency;

      const errorType = report.error.constructor.name;
      errorsByType[errorType] =
        (errorsByType[errorType] || 0) + report.frequency;
    });

    // Get most frequent errors
    const mostFrequentErrors = recentReports
      .filter(
        (report) => report.frequency >= this.config.frequentErrorThreshold,
      )
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // Get recent errors
    const recentErrors = recentReports
      .sort((a, b) => b.lastOccurrence - a.lastOccurrence)
      .slice(0, 20);

    return {
      totalErrors,
      errorsBySource,
      errorsBySeverity,
      errorsByType,
      mostFrequentErrors,
      recentErrors,
      errorTrends: { ...this.errorTrends },
    };
  }

  /**
   * Get error reports matching criteria.
   */
  getErrorReports(filter?: {
    source?: ErrorSource;
    severity?: ErrorSeverity;
    minFrequency?: number;
    since?: number;
  }): ErrorReport[] {
    const reports = Array.from(this.errorReports.values());

    return reports.filter((report) => {
      if (filter?.source && report.error.source !== filter.source) {
        return false;
      }
      if (filter?.severity && report.error.severity !== filter.severity) {
        return false;
      }
      if (filter?.minFrequency && report.frequency < filter.minFrequency) {
        return false;
      }
      if (filter?.since && report.lastOccurrence < filter.since) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get error report by ID.
   */
  getErrorReport(id: string): ErrorReport | undefined {
    return this.errorReports.get(id);
  }

  /**
   * Get summary statistics.
   */
  getSummary(): {
    totalReports: number;
    totalErrors: number;
    criticalErrors: number;
    recentErrorRate: number; // errors per hour in last 24 hours
  } {
    const reports = Array.from(this.errorReports.values());
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentReports = reports.filter(
      (report) => report.lastOccurrence > twentyFourHoursAgo,
    );

    const totalErrors = reports.reduce(
      (sum, report) => sum + report.frequency,
      0,
    );
    const criticalErrors = reports
      .filter((report) => report.error.severity === ErrorSeverity.FATAL)
      .reduce((sum, report) => sum + report.frequency, 0);
    const recentErrors = recentReports.reduce(
      (sum, report) => sum + report.frequency,
      0,
    );

    return {
      totalReports: reports.length,
      totalErrors,
      criticalErrors,
      recentErrorRate: recentErrors / 24, // per hour
    };
  }

  /**
   * Export error reports as JSON.
   */
  exportReports(): string {
    const analytics = this.getAnalytics();
    const summary = this.getSummary();

    return JSON.stringify(
      {
        summary,
        analytics,
        reports: Array.from(this.errorReports.values()),
        exportedAt: Date.now(),
        config: this.config,
      },
      null,
      2,
    );
  }

  /**
   * Clear all error reports.
   */
  clearReports(): void {
    this.errorReports.clear();
    this.errorTrends.hourly.fill(0);
    this.errorTrends.daily.fill(0);
  }

  /**
   * Get health score based on error patterns (0-100, higher is better).
   */
  getHealthScore(): number {
    const summary = this.getSummary();

    // Base score
    let score = 100;

    // Penalize recent error rate
    if (summary.recentErrorRate > 10) score -= 30;
    else if (summary.recentErrorRate > 5) score -= 20;
    else if (summary.recentErrorRate > 1) score -= 10;

    // Penalize critical errors
    if (summary.criticalErrors > 0) score -= 40;

    // Penalize high total error count
    if (summary.totalErrors > 100) score -= 20;
    else if (summary.totalErrors > 50) score -= 10;

    return Math.max(0, score);
  }

  /**
   * Generate a unique ID for an error based on its characteristics.
   */
  private generateErrorId(error: ExtensionError): string {
    const key = `${error.source}-${error.constructor.name}-${error.message}`;
    return btoa(key)
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 16);
  }

  /**
   * Update error trend tracking.
   */
  private updateErrorTrends(timestamp: number): void {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const day = date.getDay();

    this.errorTrends.hourly[hour]++;
    this.errorTrends.daily[day]++;
  }

  /**
   * Clean up old error reports based on configuration.
   */
  private cleanupOldReports(): void {
    const cutoffTime = Date.now() - this.config.maxErrorAge;
    const reportsToDelete: string[] = [];

    this.errorReports.forEach((report, id) => {
      if (report.lastOccurrence < cutoffTime) {
        reportsToDelete.push(id);
      }
    });

    reportsToDelete.forEach((id) => {
      this.errorReports.delete(id);
    });

    // Also limit total number of reports
    if (this.errorReports.size > this.config.maxReports) {
      const reports = Array.from(this.errorReports.entries())
        .sort(([, a], [, b]) => b.lastOccurrence - a.lastOccurrence)
        .slice(this.config.maxReports);

      reports.forEach(([id]) => {
        this.errorReports.delete(id);
      });
    }
  }

  /**
   * Get extension version from manifest (placeholder).
   */
  private getExtensionVersion(): string {
    // TODO: Implement version detection when manifest access is available
    return "1.0.0";
  }
}

/**
 * Create reporter with development-friendly defaults.
 */
export function createDevelopmentReporter(): ErrorReporter {
  return new ErrorReporter({
    maxReports: 200,
    enableTrends: true,
    collectSystemInfo: true,
    frequentErrorThreshold: 2,
    maxErrorAge: 24 * 60 * 60 * 1000, // 1 day
  });
}

/**
 * Create reporter with production-friendly defaults.
 */
export function createProductionReporter(): ErrorReporter {
  return new ErrorReporter({
    maxReports: 100,
    enableTrends: false,
    collectSystemInfo: false,
    frequentErrorThreshold: 5,
    maxErrorAge: 3 * 24 * 60 * 60 * 1000, // 3 days
  });
}

// Export singleton reporter instance
export const reporter = new ErrorReporter();
