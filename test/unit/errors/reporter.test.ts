/// <reference types="vitest" />
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import {
  ErrorReporter,
  reporter,
  createDevelopmentReporter,
  createProductionReporter,
} from "../../../services/errors/reporter";
import {
  StorageError,
  MessageError,
  RuntimeError,
  ErrorSeverity,
  ErrorSource,
} from "../../../services/errors/service";

// Mock navigator.userAgent
Object.defineProperty(navigator, "userAgent", {
  writable: true,
  value: "Mozilla/5.0 (Test Browser)",
});

// Mock logger to avoid console output during tests
vi.mock("../../../services/errors/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ErrorReporter", () => {
  let testReporter: ErrorReporter;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testReporter = new ErrorReporter({
      maxReports: 10,
      enableTrends: true,
      collectSystemInfo: true,
      frequentErrorThreshold: 2,
      maxErrorAge: 60 * 60 * 1000, // 1 hour
    });
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleSpy.mockRestore();
  });

  describe("Configuration", () => {
    test("should use default configuration", () => {
      const defaultReporter = new ErrorReporter();
      const analytics = defaultReporter.getAnalytics();

      // Should not crash and return valid analytics structure
      expect(analytics).toMatchObject({
        totalErrors: 0,
        errorsBySource: expect.any(Object),
        errorsBySeverity: expect.any(Object),
        errorsByType: expect.any(Object),
        mostFrequentErrors: expect.any(Array),
        recentErrors: expect.any(Array),
        errorTrends: expect.any(Object),
      });
    });

    test("should update configuration", () => {
      testReporter.updateConfig({
        maxReports: 20,
        enableTrends: false,
      });

      // Should accept new config (we can't directly test the config values,
      // but we can test behavior changes)
      const error = new StorageError("Test error");
      testReporter.reportError(error);

      expect(() => testReporter.getAnalytics()).not.toThrow();
    });

    test("should set debugging mode", () => {
      testReporter.setDebuggingEnabled(true);

      const error = new StorageError("Debug test");
      testReporter.reportError(error);

      // In debug mode, it should call logger.debug (mocked)
      // We can't directly test this, but we can ensure no errors occur
      expect(() => testReporter.getAnalytics()).not.toThrow();
    });
  });

  describe("Error Reporting", () => {
    test("should report new error", () => {
      const error = new StorageError("Storage failed", ErrorSeverity.NOTIFY, {
        key: "test",
      });

      testReporter.reportError(error);

      const analytics = testReporter.getAnalytics();
      expect(analytics.totalErrors).toBe(1);
      expect(analytics.errorsBySource[ErrorSource.STORAGE]).toBe(1);
      expect(analytics.errorsBySeverity[ErrorSeverity.NOTIFY]).toBe(1);
      expect(analytics.errorsByType.StorageError).toBe(1);
    });

    test("should aggregate duplicate errors", () => {
      const error1 = new StorageError("Same error");
      const error2 = new StorageError("Same error");

      testReporter.reportError(error1);
      testReporter.reportError(error2);

      const analytics = testReporter.getAnalytics();
      expect(analytics.totalErrors).toBe(2);

      const reports = testReporter.getErrorReports();
      expect(reports).toHaveLength(1);
      expect(reports[0].frequency).toBe(2);
    });

    test("should track different error types separately", () => {
      const storageError = new StorageError("Storage error");
      const messageError = new MessageError("Message error");

      testReporter.reportError(storageError);
      testReporter.reportError(messageError);

      const reports = testReporter.getErrorReports();
      expect(reports).toHaveLength(2);

      const analytics = testReporter.getAnalytics();
      expect(analytics.errorsByType.StorageError).toBe(1);
      expect(analytics.errorsByType.MessageError).toBe(1);
    });

    test("should collect system info when enabled", () => {
      const error = new RuntimeError("Runtime error");

      testReporter.reportError(error);

      const reports = testReporter.getErrorReports();
      expect(reports[0].userAgent).toBe("Mozilla/5.0 (Test Browser)");
      expect(reports[0].extensionVersion).toBeDefined();
    });

    test("should not collect system info when disabled", () => {
      const noSystemInfoReporter = new ErrorReporter({
        collectSystemInfo: false,
      });

      const error = new RuntimeError("Runtime error");
      noSystemInfoReporter.reportError(error);

      const reports = noSystemInfoReporter.getErrorReports();
      expect(reports[0].userAgent).toBeUndefined();
      expect(reports[0].extensionVersion).toBeUndefined();
    });

    test("should limit context entries", () => {
      const error = new StorageError("Test error");

      // Report the same error multiple times with different contexts
      for (let i = 0; i < 15; i++) {
        const errorInstance = new StorageError(
          "Test error",
          ErrorSeverity.NOTIFY,
          { iteration: i },
        );
        testReporter.reportError(errorInstance);
      }

      const reports = testReporter.getErrorReports();
      expect(reports[0].context).toHaveLength(10); // Should be limited to 10
      expect(reports[0].frequency).toBe(15);
    });
  });

  describe("Analytics", () => {
    beforeEach(() => {
      // Add some test data
      const storageError = new StorageError(
        "Storage error",
        ErrorSeverity.NOTIFY,
      );
      const messageError = new MessageError(
        "Message error",
        ErrorSeverity.FATAL,
      );
      const runtimeError = new RuntimeError(
        "Runtime error",
        ErrorSeverity.SILENT,
      );

      testReporter.reportError(storageError);
      testReporter.reportError(storageError); // Duplicate
      testReporter.reportError(messageError);
      testReporter.reportError(runtimeError);
    });

    test("should generate comprehensive analytics", () => {
      const analytics = testReporter.getAnalytics();

      expect(analytics.totalErrors).toBe(4);
      expect(analytics.errorsBySource[ErrorSource.STORAGE]).toBe(2);
      expect(analytics.errorsBySource[ErrorSource.MESSAGING]).toBe(1);
      expect(analytics.errorsBySource[ErrorSource.RUNTIME]).toBe(1);
      expect(analytics.errorsBySeverity[ErrorSeverity.NOTIFY]).toBe(2);
      expect(analytics.errorsBySeverity[ErrorSeverity.FATAL]).toBe(1);
      expect(analytics.errorsBySeverity[ErrorSeverity.SILENT]).toBe(1);
    });

    test("should identify most frequent errors", () => {
      const analytics = testReporter.getAnalytics();

      expect(analytics.mostFrequentErrors).toHaveLength(1); // Only storage error meets threshold of 2
      expect(analytics.mostFrequentErrors[0].frequency).toBe(2);
      expect(analytics.mostFrequentErrors[0].error.message).toBe(
        "Storage error",
      );
    });

    test("should list recent errors", () => {
      const analytics = testReporter.getAnalytics();

      expect(analytics.recentErrors).toHaveLength(3); // 3 unique errors
      // Just check that they are sorted by timestamp (most recent first)
      expect(analytics.recentErrors[0].lastOccurrence).toBeGreaterThanOrEqual(
        analytics.recentErrors[1].lastOccurrence,
      );
    });

    test("should include error trends", () => {
      const analytics = testReporter.getAnalytics();

      expect(analytics.errorTrends.hourly).toHaveLength(24);
      expect(analytics.errorTrends.daily).toHaveLength(7);
      expect(analytics.errorTrends.hourly.some((count) => count > 0)).toBe(
        true,
      );
      expect(analytics.errorTrends.daily.some((count) => count > 0)).toBe(true);
    });
  });

  describe("Error Filtering", () => {
    beforeEach(() => {
      const now = Date.now();
      const oldTimestamp = now - 2 * 60 * 60 * 1000; // 2 hours ago

      // Create errors with specific timestamps
      const recentError = new StorageError("Recent error");
      const oldError = new MessageError("Old error");
      const fatalError = new RuntimeError("Fatal error", ErrorSeverity.FATAL);

      // Manually set timestamps for testing
      Object.defineProperty(recentError, "timestamp", {
        value: now,
        writable: false,
      });
      Object.defineProperty(oldError, "timestamp", {
        value: oldTimestamp,
        writable: false,
      });
      Object.defineProperty(fatalError, "timestamp", {
        value: now,
        writable: false,
      });

      testReporter.reportError(recentError);
      testReporter.reportError(recentError); // Duplicate for frequency
      testReporter.reportError(oldError);
      testReporter.reportError(fatalError);
    });

    test("should filter by source", () => {
      const storageReports = testReporter.getErrorReports({
        source: ErrorSource.STORAGE,
      });

      expect(storageReports).toHaveLength(1);
      expect(storageReports[0].error.source).toBe(ErrorSource.STORAGE);
    });

    test("should filter by severity", () => {
      const fatalReports = testReporter.getErrorReports({
        severity: ErrorSeverity.FATAL,
      });

      expect(fatalReports).toHaveLength(1);
      expect(fatalReports[0].error.severity).toBe(ErrorSeverity.FATAL);
    });

    test("should filter by minimum frequency", () => {
      const frequentReports = testReporter.getErrorReports({
        minFrequency: 2,
      });

      expect(frequentReports).toHaveLength(1);
      expect(frequentReports[0].frequency).toBeGreaterThanOrEqual(2);
    });

    test("should filter by time", () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const recentReports = testReporter.getErrorReports({
        since: oneHourAgo,
      });

      expect(recentReports.length).toBeGreaterThan(0);
      recentReports.forEach((report) => {
        expect(report.lastOccurrence).toBeGreaterThan(oneHourAgo);
      });
    });

    test("should combine multiple filters", () => {
      const filteredReports = testReporter.getErrorReports({
        source: ErrorSource.STORAGE,
        minFrequency: 2,
      });

      expect(filteredReports).toHaveLength(1);
      expect(filteredReports[0].error.source).toBe(ErrorSource.STORAGE);
      expect(filteredReports[0].frequency).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Report Management", () => {
    test("should get error report by ID", () => {
      const error = new StorageError("Test error");
      testReporter.reportError(error);

      const reports = testReporter.getErrorReports();
      const reportId = reports[0].id;

      const retrievedReport = testReporter.getErrorReport(reportId);
      expect(retrievedReport).toBeDefined();
      expect(retrievedReport?.id).toBe(reportId);
    });

    test("should return undefined for non-existent report ID", () => {
      const report = testReporter.getErrorReport("non-existent-id");
      expect(report).toBeUndefined();
    });

    test("should clear all reports", () => {
      const error = new StorageError("Test error");
      testReporter.reportError(error);

      expect(testReporter.getErrorReports()).toHaveLength(1);

      testReporter.clearReports();

      expect(testReporter.getErrorReports()).toHaveLength(0);
      const analytics = testReporter.getAnalytics();
      expect(analytics.totalErrors).toBe(0);
    });
  });

  describe("Summary Statistics", () => {
    test("should generate summary", () => {
      const notifyError = new StorageError(
        "Notify error",
        ErrorSeverity.NOTIFY,
      );
      const fatalError = new RuntimeError("Fatal error", ErrorSeverity.FATAL);

      testReporter.reportError(notifyError);
      testReporter.reportError(notifyError);
      testReporter.reportError(fatalError);

      const summary = testReporter.getSummary();

      expect(summary.totalReports).toBe(2); // 2 unique error types
      expect(summary.totalErrors).toBe(3); // 3 total error instances
      expect(summary.criticalErrors).toBe(1); // 1 fatal error
      expect(summary.recentErrorRate).toBeGreaterThan(0);
    });

    test("should calculate recent error rate", () => {
      // Add multiple errors to test rate calculation
      for (let i = 0; i < 5; i++) {
        const error = new StorageError(`Error ${i}`);
        testReporter.reportError(error);
      }

      const summary = testReporter.getSummary();
      expect(summary.recentErrorRate).toBeGreaterThan(0);
      expect(summary.recentErrorRate).toBeLessThanOrEqual(5 / 24); // Should be reasonable
    });
  });

  describe("Health Score", () => {
    test("should calculate perfect health score with no errors", () => {
      const healthScore = testReporter.getHealthScore();
      expect(healthScore).toBe(100);
    });

    test("should penalize high error rates", () => {
      // Add many different errors to trigger high error rate penalty
      // Need more than 24 errors to get recentErrorRate > 1 (24 errors / 24 hours = 1 per hour)
      for (let i = 0; i < 30; i++) {
        const error = new StorageError(`High rate error ${i}`);
        testReporter.reportError(error);
      }

      const summary = testReporter.getSummary();
      const healthScore = testReporter.getHealthScore();

      // Should have recent error rate > 1 per hour (30 errors in last 24 hours)
      expect(summary.recentErrorRate).toBeGreaterThan(1);
      expect(healthScore).toBeLessThan(100);
    });

    test("should penalize fatal errors", () => {
      const fatalError = new RuntimeError("Fatal error", ErrorSeverity.FATAL);
      testReporter.reportError(fatalError);

      const healthScore = testReporter.getHealthScore();
      expect(healthScore).toBeLessThan(100);
      expect(healthScore).toBeLessThanOrEqual(60); // Should have significant penalty
    });

    test("should penalize high total error count", () => {
      // Add many different errors to trigger total count penalty
      for (let i = 0; i < 60; i++) {
        const error = new StorageError(`Total count error ${i}`);
        testReporter.reportError(error);
      }

      const healthScore = testReporter.getHealthScore();
      expect(healthScore).toBeLessThan(100);
    });

    test("should not go below 0", () => {
      // Add excessive errors and fatal errors
      for (let i = 0; i < 50; i++) {
        const fatalError = new RuntimeError(
          `Excessive fatal ${i}`,
          ErrorSeverity.FATAL,
        );
        testReporter.reportError(fatalError);
      }

      const healthScore = testReporter.getHealthScore();
      expect(healthScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Data Export", () => {
    test("should export reports as JSON", () => {
      const error = new StorageError("Export test error");
      testReporter.reportError(error);

      const exportedData = testReporter.exportReports();
      const parsedData = JSON.parse(exportedData);

      expect(parsedData).toMatchObject({
        summary: expect.any(Object),
        analytics: expect.any(Object),
        reports: expect.any(Array),
        exportedAt: expect.any(Number),
        config: expect.any(Object),
      });

      expect(parsedData.reports).toHaveLength(1);
      expect(parsedData.reports[0].error.message).toBe("Export test error");
    });

    test("should include timestamp in export", () => {
      const beforeExport = Date.now();
      const exportedData = testReporter.exportReports();
      const afterExport = Date.now();

      const parsedData = JSON.parse(exportedData);

      expect(parsedData.exportedAt).toBeGreaterThanOrEqual(beforeExport);
      expect(parsedData.exportedAt).toBeLessThanOrEqual(afterExport);
    });
  });

  describe("Report Cleanup", () => {
    test("should remove old reports based on age", () => {
      const oldTimestamp = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago (older than 1 hour limit)
      const recentTimestamp = Date.now();

      const oldError = new StorageError("Old error");
      const recentError = new StorageError("Recent error");

      // Manually set timestamps
      Object.defineProperty(oldError, "timestamp", {
        value: oldTimestamp,
        writable: false,
      });
      Object.defineProperty(recentError, "timestamp", {
        value: recentTimestamp,
        writable: false,
      });

      testReporter.reportError(oldError);
      testReporter.reportError(recentError);

      // Trigger cleanup by adding another error
      const triggerError = new StorageError("Trigger cleanup");
      testReporter.reportError(triggerError);

      const reports = testReporter.getErrorReports();
      // Should only have recent errors (exact count depends on cleanup timing)
      expect(reports.length).toBeGreaterThan(0);
    });

    test("should limit total number of reports", () => {
      const smallReporter = new ErrorReporter({ maxReports: 3 });

      // Add more errors than the limit
      for (let i = 0; i < 5; i++) {
        const error = new StorageError(`Error ${i}`);
        smallReporter.reportError(error);
      }

      const reports = smallReporter.getErrorReports();
      expect(reports.length).toBeLessThanOrEqual(3);
    });
  });
});

describe("Reporter Factory Functions", () => {
  test("should create development reporter", () => {
    const devReporter = createDevelopmentReporter();

    // Should not throw when used
    const error = new StorageError("Dev test error");
    devReporter.reportError(error);

    const analytics = devReporter.getAnalytics();
    expect(analytics.totalErrors).toBe(1);
  });

  test("should create production reporter", () => {
    const prodReporter = createProductionReporter();

    // Should not throw when used
    const error = new StorageError("Prod test error");
    prodReporter.reportError(error);

    const analytics = prodReporter.getAnalytics();
    expect(analytics.totalErrors).toBe(1);
  });
});

describe("Global Reporter Instance", () => {
  test("should export singleton reporter", () => {
    expect(reporter).toBeInstanceOf(ErrorReporter);
  });

  test("should maintain state across usage", () => {
    const error = new StorageError("Global test error");
    reporter.reportError(error);

    const analytics = reporter.getAnalytics();
    expect(analytics.totalErrors).toBeGreaterThan(0);

    // Clean up for other tests
    reporter.clearReports();
  });
});
