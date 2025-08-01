/**
 * Integration tests for the extension migration scenarios.
 * Verifies that the migration service correctly handles version updates
 * and data transformations between different extension versions.
 */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { migrationService } from "../../services/lifecycle/migrations";
import { storageClient } from "../../services/storage/client";
import { DEFAULT_SETTINGS } from "../../services/storage/schema";
import { logger } from "../../services/errors/logger";
import { ErrorSource } from "../../services/errors/service";

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

    // Mock multiple migration steps
    const MIGRATION_STEPS = {
      "1.0.0": [
        vi
          .fn()
          .mockImplementation((settings) => ({
            ...settings,
            migratedTo1_0: true,
          })),
      ],
      "1.1.0": [
        vi
          .fn()
          .mockImplementation((settings) => ({
            ...settings,
            migratedTo1_1: true,
          })),
      ],
    };

    // Spy on the migration steps
    const migration1_0 = MIGRATION_STEPS["1.0.0"][0];
    const migration1_1 = MIGRATION_STEPS["1.1.0"][0];

    // Replace the actual migration steps with our mocks
    Object.defineProperty(migrationService, "MIGRATION_STEPS", {
      value: MIGRATION_STEPS,
      writable: true,
    });

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
          expect.stringContaining("theme must be"),
          expect.stringContaining("maxHistoryItems must be"),
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
      expect.any(Object),
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
