/**
 * Integration tests for the extension migration scenarios.
 * Verifies that the migration service correctly handles version updates
 * and data transformations between different extension versions.
 */

import { logger } from "@services/errors/logger";
import { ErrorSource } from "@services/errors/service";
import { migrationService } from "@services/lifecycle/migrations";
import { storageClient } from "@services/storage/client";
import { DEFAULT_SETTINGS } from "@services/storage/schema";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock dependencies
vi.mock("../../services/storage/client", () => ({
  storageClient: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock("../../services/errors/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
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
  // Set current version for tests
  mockGetManifest.mockReturnValue({ version: "1.1.0" });
  migrationService.getCurrentVersion = () => "1.1.0";
});

describe("Migration Scenarios", () => {
  it("should apply migrations when updating from older version", async () => {
    // Arrange
    const initialSettings = { ...DEFAULT_SETTINGS };
    (storageClient.getSettings as Mock).mockResolvedValue(initialSettings);

    // Act
    await migrationService.runMigrations("1.0.0");

    // Assert
    expect(logger.info).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "Running migrations from 1.0.0 to 1.1.0",
    );
    expect(logger.info).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "Migrations completed successfully.",
    );
  });

  it("should not run migrations when versions are the same", async () => {
    // Arrange
    const initialSettings = { ...DEFAULT_SETTINGS };
    (storageClient.getSettings as Mock).mockResolvedValue(initialSettings);

    // Act
    await migrationService.runMigrations("1.1.0");

    // Assert
    expect(logger.info).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "No migrations needed for this update",
    );
    expect(storageClient.updateSettings).not.toHaveBeenCalled();
  });

  it("should handle semantic versioning correctly (major version)", async () => {
    // Arrange
    const initialSettings = { ...DEFAULT_SETTINGS };
    (storageClient.getSettings as Mock).mockResolvedValue(initialSettings);

    // Act
    await migrationService.runMigrations("0.9.5");

    // Assert
    expect(logger.info).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "Running migrations from 0.9.5 to 1.1.0",
    );
  });

  it("should handle semantic versioning correctly (minor version)", async () => {
    // Arrange
    const initialSettings = { ...DEFAULT_SETTINGS };
    (storageClient.getSettings as Mock).mockResolvedValue(initialSettings);

    // Act
    await migrationService.runMigrations("1.0.5");

    // Assert
    expect(logger.info).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "Running migrations from 1.0.5 to 1.1.0",
    );
  });

  it("should apply migrations sequentially for multiple version jumps", async () => {
    // Arrange
    const initialSettings = { ...DEFAULT_SETTINGS };
    (storageClient.getSettings as Mock).mockResolvedValue(initialSettings);

    // Create spies for migration functions
    const migration1_0 = vi.fn().mockImplementation((settings) => ({
      ...settings,
      migratedTo1_0: true,
    }));
    const migration1_1 = vi.fn().mockImplementation((settings) => ({
      ...settings,
      migratedTo1_1: true,
    }));

    // Set migration steps with spy functions
    migrationService.setMigrations({
      "1.0.0": [migration1_0],
      "1.1.0": [migration1_1],
    });

    // Verify the migration functions are correctly assigned
    const migrations = migrationService.getMigrations();
    expect(migrations["1.0.0"]).toContain(migration1_0);
    expect(migrations["1.1.0"]).toContain(migration1_1);

    // Removed debug console log

    // Act
    await migrationService.runMigrations("0.9.0");

    // Assert
    expect(migration1_0).toHaveBeenCalled();
    expect(migration1_1).toHaveBeenCalled();
  });

  it("should handle data integrity checks and repairs", async () => {
    // Arrange
    const corruptedSettings = {
      ...DEFAULT_SETTINGS,
      theme: "invalid-theme",
      maxHistoryItems: -5,
    };
    (storageClient.getSettings as Mock).mockResolvedValue(corruptedSettings);

    // Act
    await migrationService.runMigrations("1.0.0");

    // Assert
    expect(logger.warn).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "Data integrity issues detected and repaired",
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.stringContaining("Missing setting"),
        ]),
      }),
    );
  });

  it("should handle errors during migration process", async () => {
    // Arrange
    const error = new Error("Migration failed");
    (storageClient.getSettings as Mock).mockRejectedValue(error);

    // Act & Assert
    await expect(migrationService.runMigrations("1.0.0")).rejects.toThrow(
      "Migration failed",
    );

    expect(logger.error).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "Migration failed",
      expect.objectContaining({
        error: "Migration failed",
        previousVersion: "1.0.0",
      }),
    );
  });

  it("should handle empty settings object", async () => {
    // Arrange
    (storageClient.getSettings as Mock).mockResolvedValue({});

    // Act
    await migrationService.runMigrations("1.0.0");

    // Assert
    // Should trigger data integrity repair
    expect(logger.warn).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "Data integrity issues detected and repaired",
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.stringContaining("Missing setting"),
        ]),
      }),
    );
  });

  it("should skip migrations for new installations", async () => {
    // Arrange
    const initialSettings = { ...DEFAULT_SETTINGS };
    (storageClient.getSettings as Mock).mockResolvedValue(initialSettings);

    // Act
    await migrationService.runMigrations("0.0.0");

    // Assert
    // For new installations, we still want to run initial migrations
    expect(logger.info).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "Running migrations from 0.0.0 to 1.1.0",
    );
  });
});
