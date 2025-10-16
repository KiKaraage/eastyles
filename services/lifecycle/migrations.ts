/**
 * Migration service for Eastyles extension.
 * Handles data migrations between different extension versions and ensures data integrity.
 */

import { logger } from "../../services/errors/logger";
import { ErrorSource } from "../../services/errors/service";
import { storageClient } from "../storage/client";
import { DEFAULT_SETTINGS } from "../storage/schema";

/**
 * Interface for a migration function.
 * Each migration takes the current settings and returns the migrated settings.
 */
interface Migration {
  (settings: typeof DEFAULT_SETTINGS): typeof DEFAULT_SETTINGS;
}

/**
 * Defines migration steps by version.
 * Keys are target versions, values are arrays of migration functions.
 */
export const MIGRATION_STEPS: Record<string, Migration[]> = {
  "1.0.0": [
    // Example migration: if a new setting 'newFeatureEnabled' is introduced
    // and should be true by default, but existing users might not have it.
    (settings) => ({
      ...settings,
      // newFeatureEnabled: settings.newFeatureEnabled ?? true,
    }),
  ],
  "1.1.0": [
    // Example migration for version 1.1.0
    (settings) => ({
      ...settings,
      // Add any new settings or modifications here
    }),
  ],
  "2.0.0": [
    // Migration for UserCSS support - initialize UserCSS storage structure
    (settings) => {
      // Note: Actual migration of legacy styles to UserCSS format will be handled
      // by the storage client when UserCSS methods are called for the first time
      // This migration step ensures the settings structure is ready for UserCSS features
      return {
        ...settings,
        // Add any new settings needed for UserCSS support
        userCSSSupportEnabled: true,
      };
    },
  ],
};

export class MigrationService {
  private debugEnabled = false;
  private currentVersion: string = "1.1.0"; // Default version

  public getMigrations(): Record<string, Migration[]> {
    return MIGRATION_STEPS;
  }

  public getMigrationSteps(): Record<string, Migration[]> {
    return MIGRATION_STEPS;
  }

  public setMigrations(migrations: Record<string, Migration[]>): void {
    // Update the static MIGRATION_STEPS object
    Object.assign(MIGRATION_STEPS, migrations);

    // Also update the instance property if it exists
    if (this instanceof MigrationService) {
      Object.defineProperty(this, "MIGRATION_STEPS", {
        value: migrations,
        writable: true,
      });
    }
  }

  constructor() {
    // Initialize debug mode first
    this.initializeDebugMode();
  }

  public getCurrentVersion(): string {
    // Only access browser when needed, with fallback for tests
    try {
      const manifest = browser.runtime.getManifest();
      return manifest.version ?? this.currentVersion;
      // manifest.version is guaranteed to be a string by the browser API
    } catch {
      // Fallback for test environment
      return this.currentVersion;
    }
  }

  private async initializeDebugMode(): Promise<void> {
    try {
      const settings = await storageClient.getSettings();
      this.debugEnabled = settings?.isDebuggingEnabled ?? false;
    } catch (error: unknown) {
      console.warn(
        "[ea-MigrationService] Failed to initialize debug mode for MigrationService:",
        error,
      );
    }
  }

  private debug(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      console.log(`[ea-EastylesMigration] ${message}`, ...args);
    }
  }

  /**
   * Validates the integrity of settings data.
   * @param settings The settings to validate
   * @returns Object containing validity status and optional repair suggestions
   */
  private validateSettingsIntegrity(settings: typeof DEFAULT_SETTINGS): {
    isValid: boolean;
    issues: string[];
    repairedSettings: typeof DEFAULT_SETTINGS;
  } {
    const issues: string[] = [];
    let repairedSettings = { ...settings };

    // Check for missing required fields
    (
      Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>
    ).forEach((key) => {
      if (repairedSettings[key] === undefined) {
        issues.push(`Missing setting: ${key}`);
        repairedSettings = {
          ...repairedSettings,
          [key]: DEFAULT_SETTINGS[key],
        };
      }
    });

    // Validate data types and ranges
    if ("themeMode" in repairedSettings) {
      const themeMode = (repairedSettings as { themeMode?: string }).themeMode;
      if (themeMode && !["light", "dark", "system"].includes(themeMode)) {
        issues.push('themeMode must be "light", "dark", or "system"');
        (repairedSettings as { themeMode: string }).themeMode =
          DEFAULT_SETTINGS.themeMode as string;
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      repairedSettings,
    };
  }

  /**
   * Repairs settings data if integrity issues are found.
   * @param settings The settings to repair
   * @returns Repaired settings object
   */
  private async repairSettings(
    settings: typeof DEFAULT_SETTINGS,
  ): Promise<typeof DEFAULT_SETTINGS> {
    const integrityCheck = this.validateSettingsIntegrity(settings);

    if (!integrityCheck.isValid && integrityCheck.issues.length > 0) {
      this.debug(
        "Detected data integrity issues, applying repairs:",
        integrityCheck.issues,
      );

      // Apply repairs
      await storageClient.updateSettings(integrityCheck.repairedSettings);
      logger.warn?.(
        ErrorSource.BACKGROUND,
        "Data integrity issues detected and repaired",
        {
          issues: integrityCheck.issues,
          version: this.getCurrentVersion(),
        },
      );
    }

    return integrityCheck.repairedSettings;
  }

  /**
   * Determines if a migration should be run based on version comparison.
   * @param fromVersion Version to migrate from
   * @param toVersion Version to migrate to
   * @returns True if migration should be run
   */
  private shouldRunMigration(fromVersion: string, toVersion: string): boolean {
    // Handle edge cases
    if (!fromVersion || !toVersion) return false;
    if (fromVersion === toVersion) return false;
    if (fromVersion === "0.0.0") return true; // Always run migrations for new installations

    // Split versions into components and compare numerically
    const fromParts = fromVersion.split(".").map(Number);
    const toParts = toVersion.split(".").map(Number);

    // Compare major, minor, and patch versions
    // Return true only if fromVersion < toVersion (user is upgrading to this migration)
    for (let i = 0; i < Math.max(fromParts.length, toParts.length); i++) {
      const from = i < fromParts.length ? fromParts[i] : 0;
      const to = i < toParts.length ? toParts[i] : 0;

      if (from < to) return true;
      if (from > to) return false;
    }

    return false;
  }

  /**
   * Runs migrations from the previous version to the current version.
   * @param previousVersion The version from which the extension is being updated.
   */
  async runMigrations(previousVersion: string): Promise<void> {
    this.debug("Starting migrations from version:", previousVersion);
    const currentVersion = this.getCurrentVersion();
    console.log("[ea-runMigrations] Promise started.");

    try {
      console.log("[ea-runMigrations] Entering try block.");

      // Get current settings
      let currentSettings = await storageClient.getSettings();

      // Validate and repair data integrity before migrations
      this.debug("Validating and repairing data integrity");
      currentSettings = await this.repairSettings(currentSettings);

      // Track if any migrations were actually applied
      let migrationsApplied = false;

      // Get all migration versions and sort them numerically
      const migrationVersions = Object.keys(MIGRATION_STEPS).sort((a, b) => {
        const aParts = a.split(".").map(Number);
        const bParts = b.split(".").map(Number);

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = i < aParts.length ? aParts[i] : 0;
          const bVal = i < bParts.length ? bParts[i] : 0;

          if (aVal !== bVal) return aVal - bVal;
        }

        return 0;
      });

      // Removed debug console logs

      // Apply migrations sequentially for all versions between previous and current
      for (const version of migrationVersions) {
        // A migration should run if:
        // 1. The user's previous version is less than the migration version, AND
        // 2. The migration version is less than or equal to the current extension version
        const userNeedsMigration = this.shouldRunMigration(
          previousVersion,
          version,
        );
        const migrationIsForCurrentVersion =
          this.shouldRunMigration(version, currentVersion) ||
          version === currentVersion;
        const shouldRun = userNeedsMigration && migrationIsForCurrentVersion;

        if (shouldRun) {
          // Only log that we're running migrations if we actually need to run them
          if (!migrationsApplied) {
            logger.info?.(
              ErrorSource.BACKGROUND,
              `Running migrations from ${previousVersion} to ${currentVersion}`,
            );
          }

          this.debug(`Applying migrations for version ${version}`);

          for (const migration of MIGRATION_STEPS[version]) {
            currentSettings = migration(currentSettings);
          }

          migrationsApplied = true;

          // Update storage after each version to prevent data loss if migration fails midway
          await storageClient.updateSettings(currentSettings);
        }
      }

      // Only update if migrations were applied or data was repaired
      if (migrationsApplied) {
        logger.info?.(
          ErrorSource.BACKGROUND,
          "Migrations completed successfully.",
        );
      } else {
        this.debug("No migrations needed");
        logger.info?.(
          ErrorSource.BACKGROUND,
          "No migrations needed for this update",
        );
      }

      // Final integrity check after all migrations
      await this.repairSettings(currentSettings);
      console.log("[ea-runMigrations] Resolving promise.");
    } catch (_error: unknown) {
      console.error("[ea-runMigrations] Caught error in catch block:", _error);
      logger.error(ErrorSource.BACKGROUND, "Migration failed", {
        error: _error instanceof Error ? _error.message : String(_error),
        previousVersion,
        currentVersion,
      });
      console.log("[ea-runMigrations] Rejecting promise.");
      throw _error; // Re-throw the error after logging
    }
  }
}

export const migrationService = new MigrationService();
