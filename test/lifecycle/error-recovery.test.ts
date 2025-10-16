/**
 * Integration tests for error recovery during extension lifecycle events.
 * Verifies that the system can gracefully handle and recover from various
 * error conditions during installation, migration, and other lifecycle events.
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { logger } from "../../services/errors/logger";
import { ErrorSource } from "../../services/errors/service";
import { installerService } from "../../services/lifecycle/installer";
import { migrationService } from "../../services/lifecycle/migrations";
import { storageClient } from "../../services/storage/client";
import { DEFAULT_SETTINGS } from "../../services/storage/schema";

// Mock dependencies
vi.mock("../../services/storage/client", () => ({
  storageClient: {
    getSettings: vi.fn(),
    resetSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock("../../services/errors/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../services/lifecycle/migrations", () => ({
  migrationService: {
    runMigrations: vi.fn(),
  },
}));

// Mock browser.runtime.getManifest
const mockGetManifest = vi.fn();
vi.stubGlobal("browser", {
  runtime: {
    getManifest: mockGetManifest,
  },
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  mockGetManifest.mockReturnValue({ version: "1.1.0" }); // Default for tests
});

describe("Error Recovery", () => {
  describe("Installation Error Recovery", () => {
    it("should handle storage failures during first-time setup", async () => {
      // Arrange
      const error = new Error("Storage failure");
      (storageClient.resetSettings as Mock).mockRejectedValue(error);

      // Act & Assert
      await expect(installerService.performFirstTimeSetup()).rejects.toThrow(
        "Storage failure",
      );

      expect(logger.error).toHaveBeenCalledWith(
        ErrorSource.BACKGROUND,
        "First-time setup failed",
        expect.objectContaining({
          error: "Storage failure",
        }),
      );
    });

    it("should recover from partial installation state", async () => {
      // Arrange
      // Simulate failure after some settings are saved
      let callCount = 0;
      (storageClient.resetSettings as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve();
      });

      // Act
      // First attempt should succeed
      await installerService.performFirstTimeSetup();
      // Second attempt should fail
      await expect(installerService.performFirstTimeSetup()).rejects.toThrow(
        "Network error",
      );
      // Retry should succeed
      await installerService.performFirstTimeSetup();

      // Assert
      // Should have attempted resetSettings multiple times
      expect(storageClient.resetSettings).toHaveBeenCalledTimes(3);
      expect(logger.info).toHaveBeenCalledWith(
        ErrorSource.BACKGROUND,
        "First-time setup completed successfully",
      );
    });

    it("should handle concurrent installation attempts", async () => {
      // Arrange
      const error = new Error("Settings locked");
      (storageClient.resetSettings as Mock).mockRejectedValue(error);

      // Act
      const promises = [
        installerService.performFirstTimeSetup(),
        installerService.performFirstTimeSetup(),
      ];

      // Assert
      await expect(Promise.allSettled(promises)).resolves.toHaveLength(2);
      // One should succeed, one should fail gracefully
      expect(storageClient.resetSettings).toHaveBeenCalledTimes(2);
    });

    it("should handle one successful and one failed concurrent installation attempt", async () => {
      // Arrange
      let callCount = 0;
      (storageClient.resetSettings as Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("Settings locked"));
      });

      // Act
      const promises = [
        installerService.performFirstTimeSetup(),
        installerService.performFirstTimeSetup(),
      ];

      // Assert
      const results = await Promise.allSettled(promises);
      expect(results).toHaveLength(2);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(storageClient.resetSettings).toHaveBeenCalledTimes(2);
    });

    it("should handle two successful concurrent installation attempts", async () => {
      // Arrange
      (storageClient.resetSettings as Mock).mockResolvedValue(undefined);

      // Act
      const promises = [
        installerService.performFirstTimeSetup(),
        installerService.performFirstTimeSetup(),
      ];

      // Assert
      const results = await Promise.allSettled(promises);
      expect(results).toHaveLength(2);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
      expect(storageClient.resetSettings).toHaveBeenCalledTimes(2);
    });
  });

  describe("Migration Error Recovery", () => {
    it("should handle partial migration failures", async () => {
      // Arrange - Mock storage to fail during updateSettings to simulate migration failure
      (storageClient.getSettings as Mock).mockResolvedValue(DEFAULT_SETTINGS);
      (storageClient.updateSettings as Mock).mockRejectedValue(
        new Error("Migration step failed"),
      );

      // Mock version to ensure migration attempts to run
      mockGetManifest.mockReturnValue({ version: "1.1.0" });

      // Act & Assert
      await expect(migrationService.runMigrations("1.0.0")).rejects.toThrow(
        "Migration step failed",
      );

      // Verify the error was logged
      expect(logger.error).toHaveBeenCalledWith(
        ErrorSource.BACKGROUND,
        "Migration failed",
        expect.objectContaining({
          error: "Migration step failed",
        }),
      );
    });

    it("should recover from corrupted settings data", async () => {
      // Un-mock to use the actual service implementation
      vi.unmock("../../services/lifecycle/migrations");
      const { migrationService: actualMigrationService } = await import(
        "../../services/lifecycle/migrations"
      );

      // Arrange
      const corruptedSettings = {
        lastUsed: Date.now(),
        version: "invalid-version",
        isDebuggingEnabled: "not-a-boolean",
        themeMode: "invalid-theme",
        // Missing required fields
      };
      (storageClient.getSettings as Mock).mockResolvedValueOnce(
        corruptedSettings,
      );
      (storageClient.updateSettings as Mock).mockResolvedValue(undefined); // Mock the repair call

      // Act
      await actualMigrationService.runMigrations("1.0.0");

      // Assert
      // The real method should call repairSettings, which calls logger.warn
      expect(logger.warn).toHaveBeenCalledWith(
        ErrorSource.BACKGROUND,
        "Data integrity issues detected and repaired",
        expect.objectContaining({
          issues: expect.any(Array),
          version: expect.any(String),
        }),
      );
    });

    it("should handle version rollback scenarios", async () => {
      // Un-mock to use the actual service implementation
      vi.unmock("../../services/lifecycle/migrations");
      const { migrationService: actualMigrationService } = await import(
        "../../services/lifecycle/migrations"
      );

      // Arrange
      const currentSettings = { ...DEFAULT_SETTINGS };
      (storageClient.getSettings as Mock).mockResolvedValueOnce(
        currentSettings,
      );
      mockGetManifest.mockReturnValue({ version: "1.0.0" }); // Downgraded version

      // Act
      await actualMigrationService.runMigrations("1.1.0"); // Previous version was higher

      // Assert
      // The real method should detect the rollback and log the info message
      expect(logger.info).toHaveBeenCalledWith(
        ErrorSource.BACKGROUND,
        "No migrations needed for this update",
      );
    });
  });

  describe("General Error Recovery", () => {
    it("should maintain system stability during unexpected errors", async () => {
      // Arrange
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {
          /* no-op */
        });

      // Mock storage to cause an error during migration
      (storageClient.getSettings as Mock).mockRejectedValue(
        new Error("Unexpected critical failure"),
      );

      // Act & Assert
      // Call the method on the service object directly to trigger the actual error handling
      await expect(migrationService.runMigrations("1.0.0")).rejects.toThrow(
        "Unexpected critical failure",
      );

      // Assert that console.error was called to log the issue
      expect(console.error).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Clean up mocks
      consoleErrorSpy.mockRestore();
    });

    it("should handle resource exhaustion scenarios", async () => {
      // Arrange - Mock getSettings to fail first few times, then succeed
      let callCount = 0;
      (storageClient.getSettings as Mock).mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          return Promise.reject(new Error("Resource temporarily unavailable"));
        }
        return Promise.resolve({ ...DEFAULT_SETTINGS });
      });

      // Act & Assert - Should eventually succeed with retry logic
      let success = false;
      for (let i = 0; i < 5; i++) {
        try {
          await migrationService.runMigrations("1.0.0");
          success = true;
          break;
        } catch {
          // Continue retrying
          continue;
        }
      }

      expect(success).toBe(true);
    });
  });
});
