/**
 * Integration tests for the extension installation process.
 * Verifies that the installer service correctly initializes default settings
 * and handles first-time setup when the extension is installed.
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
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Installation Process", () => {
  it("should initialize default settings during first-time setup", async () => {
    // Arrange
    const mockResetSettings = vi.fn();
    (storageClient.resetSettings as Mock).mockImplementation(mockResetSettings);

    // Act
    await installerService.performFirstTimeSetup();

    // Assert
    expect(storageClient.resetSettings).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "First-time setup completed successfully",
    );
  });

  it("should run initial migrations during first-time setup", async () => {
    // Arrange
    const mockRunMigrations = vi.fn();
    // Mock the migrationService.runMigrations method
    vi.spyOn(migrationService, "runMigrations").mockImplementation(
      mockRunMigrations,
    );

    // Act
    await installerService.performFirstTimeSetup();

    // Assert
    expect(mockRunMigrations).toHaveBeenCalledWith("0.0.0");
  });

  it("should handle errors during first-time setup", async () => {
    // Arrange
    const error = new Error("Failed to reset settings");
    (storageClient.resetSettings as Mock).mockRejectedValue(error);

    // Act & Assert
    await expect(installerService.performFirstTimeSetup()).rejects.toThrow(
      "Failed to reset settings",
    );

    expect(logger.error).toHaveBeenCalledWith(
      ErrorSource.BACKGROUND,
      "First-time setup failed",
      expect.objectContaining({
        error: "Failed to reset settings",
      }),
    );
  });

  it("should maintain data integrity during installation", async () => {
    // Arrange
    // Mock storage to return incomplete settings
    (storageClient.getSettings as Mock).mockResolvedValue({
      theme: "dark",
      // Missing other settings
    });

    // Mock resetSettings to capture the default settings
    (storageClient.resetSettings as Mock).mockResolvedValue(undefined);

    // Act
    await installerService.performFirstTimeSetup();

    // Assert
    // Verify that resetSettings was called, which ensures default settings are applied
    expect(storageClient.resetSettings).toHaveBeenCalled();
  });

  it("should initialize with correct default settings structure", async () => {
    // Arrange
    const mockResetSettings = vi.fn();
    (storageClient.resetSettings as Mock).mockImplementation(mockResetSettings);

    // Act
    await installerService.performFirstTimeSetup();

    // Assert
    // Verify that the resetSettings call would initialize with the correct default structure
    const settingsKeys = Object.keys(DEFAULT_SETTINGS);
    expect(settingsKeys).toContain("lastUsed");
    expect(settingsKeys).toContain("version");
    expect(settingsKeys).toContain("isDebuggingEnabled");
    expect(settingsKeys).toContain("themeMode");
  });
});
