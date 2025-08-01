/**
 * Installer service for Eastyles extension.
 * Handles first-time setup and initialization when the extension is installed.
 */

import { logger } from "../../services/errors/logger";
import { ErrorSource } from "../../services/errors/service";
import { storageClient } from "../storage/client";
import { DEFAULT_SETTINGS } from "../storage/schema";
import { migrationService } from "./migrations";

export class InstallerService {
  private debugEnabled = false;

  constructor() {
    this.initializeDebugMode();
  }

  private async initializeDebugMode(): Promise<void> {
    try {
      const settings = await storageClient.getSettings();
      this.debugEnabled = settings?.isDebuggingEnabled ?? false;
    } catch (error) {
      console.warn(
        "Failed to initialize debug mode for InstallerService:",
        error,
      );
    }
  }

  private debug(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      console.log(`[EastylesInstaller] ${message}`, ...args);
    }
  }

  /**
   * Performs first-time setup when the extension is installed.
   * This includes initializing default settings and running any necessary setup tasks.
   */
  async performFirstTimeSetup(): Promise<void> {
    this.debug("Starting first-time setup");

    try {
      // Initialize default settings
      this.debug("Initializing default settings");
      await storageClient.resetSettings();

      // Run initial migrations if needed (in case of migration logic that should apply to new installations)
      this.debug("Running initial migrations");
      await migrationService.runMigrations("0.0.0");

      logger.info(
        ErrorSource.BACKGROUND,
        "First-time setup completed successfully",
      );
    } catch (error: unknown) {
      logger.error(ErrorSource.BACKGROUND, "First-time setup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export const installerService = new InstallerService();
