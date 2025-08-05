/**
 * Background script for Eastyles extension.
 * Handles service worker initialization, lifecycle events, and service coordination.
 */

import { browser } from "@wxt-dev/browser";
import { errorService } from "../services/errors/service";
import { logger } from "../services/errors/logger";
import { reporter } from "../services/errors/reporter";
import { messageBus } from "../services/messaging/bus";
import { storageClient } from "../services/storage/client";
import { migrationService } from "../services/lifecycle/migrations";
import { ErrorSource } from "../services/errors/service";

/**
 * Background service initialization state.
 */
interface BackgroundState {
  isInitialized: boolean;
  initializationStartTime: number;
  initializationEndTime?: number;
  services: {
    errorService: boolean;
    logger: boolean;
    reporter: boolean;
    messageBus: boolean;
  };
  errors: string[];
}

// Global state for background script
const backgroundState: BackgroundState = {
  isInitialized: false,
  initializationStartTime: 0,
  services: {
    errorService: false,
    logger: false,
    reporter: false,
    messageBus: false,
  },
  errors: [],
};

/**
 * Initialize core services in the correct order.
 */
async function initializeServices(): Promise<void> {
  backgroundState.initializationStartTime = Date.now();

  try {
    // 1. Initialize error service first
    errorService.setDebuggingEnabled(process.env.NODE_ENV === "development");
    backgroundState.services.errorService = true;
    logger.info(ErrorSource.BACKGROUND, "Error service initialized");

    // 2. Initialize logger
    logger.setDebuggingEnabled(process.env.NODE_ENV === "development");
    backgroundState.services.logger = true;
    logger.info(ErrorSource.BACKGROUND, "Logger service initialized");

    // 3. Initialize reporter
    reporter.setDebuggingEnabled(process.env.NODE_ENV === "development");
    backgroundState.services.reporter = true;
    logger.info(ErrorSource.BACKGROUND, "Reporter service initialized");

    // 4. Initialize message bus
    // Message bus is initialized on instantiation
    backgroundState.services.messageBus = true;
    logger.info(ErrorSource.BACKGROUND, "Message bus service initialized");

    // 5. Set up error listeners
    errorService.addErrorListener((error) => {
      logger.logError(error);
      reporter.reportError(error);
    });

    backgroundState.isInitialized = true;
    backgroundState.initializationEndTime = Date.now();

    const initTime =
      backgroundState.initializationEndTime -
      backgroundState.initializationStartTime;
    logger.info(
      ErrorSource.BACKGROUND,
      `All services initialized successfully in ${initTime}ms`,
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown initialization error";
    backgroundState.errors.push(errorMessage);

    logger.error(ErrorSource.BACKGROUND, "Service initialization failed", {
      error: errorMessage,
      state: backgroundState,
    });

    // Re-throw to be handled by the background script error handler
    throw error;
  }
}

/**
 * Handle extension installation.
 */
async function handleInstallation(
  details: Browser.runtime.InstalledDetails,
): Promise<void> {
  logger.info(ErrorSource.BACKGROUND, "Extension installation detected", {
    reason: details.reason,
    previousVersion: details.previousVersion,
  });

  try {
    if (details.reason === "install") {
      // First-time installation
      logger.info(
        ErrorSource.BACKGROUND,
        "First-time installation - setting up defaults",
      );

      // Initialize default settings when storage service is available
      await storageClient.resetSettings();

      logger.info(ErrorSource.BACKGROUND, "Default settings initialized");
    } else if (details.reason === "update") {
      // Extension update
      const previousVersion = details.previousVersion || "unknown";
      logger.info(ErrorSource.BACKGROUND, "Extension update detected", {
        from: previousVersion,
        to: browser.runtime.getManifest().version,
      });

      // Run migrations when migration service is available
      await migrationService.runMigrations(previousVersion);

      logger.info(ErrorSource.BACKGROUND, "Migration completed successfully");
    }
  } catch (error: unknown) {
    const extensionError = errorService.handleError(
      error instanceof Error ? error : new Error(String(error)),
      {
        source: ErrorSource.BACKGROUND,
        installationReason: details.reason,
        previousVersion: details.previousVersion,
      },
    );

    logger.error(
      ErrorSource.BACKGROUND,
      "Installation/update handling failed",
      {
        error: extensionError.message,
      },
    );

    // Don't re-throw - we want the extension to continue working even if setup fails
  }
}

/**
 * Handle extension startup (service worker activation).
 */
async function handleStartup(): Promise<void> {
  logger.info(ErrorSource.BACKGROUND, "Extension startup detected");

  try {
    // Validate that all services are properly initialized
    const validation = messageBus.validateHandlers();
    if (!validation.isValid) {
      logger.warn(ErrorSource.BACKGROUND, "Message handler validation failed", {
        missingHandlers: validation.missingHandlers,
      });
    }

    // Log system status
    const healthScore = reporter.getHealthScore();
    const errorStats = errorService.getErrorAnalytics();

    logger.info(ErrorSource.BACKGROUND, "Extension startup completed", {
      healthScore,
      errorStats,
      initializationTime: backgroundState.initializationEndTime
        ? backgroundState.initializationEndTime -
          backgroundState.initializationStartTime
        : null,
    });
  } catch (error: unknown) {
    errorService.handleError(
      error instanceof Error ? error : new Error(String(error)),
      {
        source: ErrorSource.BACKGROUND,
        phase: "startup",
      },
    );
  }
}

/**
 * Handle extension suspension (before service worker deactivation).
 */
async function handleSuspension(): Promise<void> {
  logger.info(ErrorSource.BACKGROUND, "Extension suspension detected");

  try {
    // Clean up resources
    messageBus.cleanup();

    // Export final logs and reports for debugging
    const logStats = logger.getLogStats();
    const reporterSummary = reporter.getSummary();

    logger.info(ErrorSource.BACKGROUND, "Extension suspended gracefully", {
      logStats,
      reporterSummary,
    });
  } catch (error: unknown) {
    // Log but don't throw - we're shutting down anyway
    logger.error(ErrorSource.BACKGROUND, "Error during suspension", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Global error handler for uncaught errors in background script.
 */
function handleGlobalError(error: ErrorEvent | PromiseRejectionEvent): void {
  let errorMessage: string;
  let errorStack: string | undefined;

  if (error instanceof ErrorEvent) {
    errorMessage = error.error?.message || error.message || "Unknown error";
    errorStack = error.error?.stack;
  } else {
    errorMessage =
      error.reason?.message || String(error.reason) || "Promise rejection";
    errorStack = error.reason?.stack;
  }

  const extensionError = errorService.createRuntimeError(errorMessage, {
    stack: errorStack,
    type: error.type,
    filename: "filename" in error ? error.filename : undefined,
    lineno: "lineno" in error ? error.lineno : undefined,
    colno: "colno" in error ? error.colno : undefined,
  });

  // Ensure error gets logged even if logger isn't fully initialized
  console.error("Background script global error:", {
    message: extensionError.message,
    stack: errorStack,
    context: extensionError.context,
  });
}

/**
 * Create a context menu item for opening the manager page.
 */
function createContextMenu(): void {
  browser.contextMenus.create({
    id: "open-manager",
    title: "Manage Styles",
    contexts: ["browser_action"],
  });
}

/**
 * Main background script definition using WXT.
 */
export default defineBackground({
  persistent: false, // Use non-persistent background for Manifest V3
  type: "module", // Use ES modules for better code splitting

  main: () => {
    try {
      // Set up global error handlers
      self.addEventListener("error", handleGlobalError);
      self.addEventListener("unhandledrejection", handleGlobalError);

      // Initialize all services
      initializeServices();

      // Message bus handles its own message listener setup

      // Set up extension lifecycle event listeners
      browser.runtime.onInstalled.addListener(handleInstallation);
      browser.runtime.onStartup.addListener(handleStartup);

      // Create context menu
      createContextMenu();

      // Listen for context menu clicks
      browser.contextMenus.onClicked.addListener((info) => {
        if (info.menuItemId === "open-manager") {
          browser.runtime.openOptionsPage();
        }
      });

      // Handle service worker suspension (Manifest V3)
      if ("onSuspend" in browser.runtime) {
        browser.runtime.onSuspend.addListener(handleSuspension);
      }

      logger.info(
        ErrorSource.BACKGROUND,
        "Background script initialized successfully",
        {
          manifest: browser.runtime.getManifest().version,
          id: browser.runtime.id,
          state: backgroundState,
        },
      );
    } catch (error: unknown) {
      // Fallback error handling if services aren't initialized
      console.error("Critical background script initialization error:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        state: backgroundState,
      });

      // Try to initialize at least basic error handling
      try {
        errorService.handleError(
          error instanceof Error ? error : new Error(String(error)),
          {
            source: ErrorSource.BACKGROUND,
            phase: "critical_initialization",
          },
        );
      } catch {
        // Silent fallback - we've done all we can
      }
    }
  },
});
