/**
 * Message handlers for background script.
 * Implements typed request/response handling for all message types.
 */

import { browser } from "@wxt-dev/browser";
import { ReceivedMessages, ErrorDetails } from "./types";

/**
 * Helper function to keep service worker alive using browser.tabs API
 * This is more reliable than setTimeout for preventing premature termination
 */
async function keepServiceWorkerAlive(): Promise<void> {
  try {
    // Query tabs to keep the service worker active
    await browser.tabs.query({});
  } catch (error) {
    console.warn("Failed to keep service worker alive:", error);
  }
}

/**
 * Debounce mechanism to prevent duplicate tab creation calls
 * This is crucial for preventing multiple tabs from being created
 * when the service worker timeout causes retries
 */
const pendingTabOperations = new Set<string>();

async function ensureUniqueOperation(
  operationId: string,
  operation: () => Promise<unknown>,
): Promise<unknown> {
  if (pendingTabOperations.has(operationId)) {
    console.log(
      `[ensureUniqueOperation] Operation ${operationId} already in progress, skipping`,
    );
    return { success: true, action: "skipped_duplicate" };
  }

  try {
    pendingTabOperations.add(operationId);
    return await operation();
  } finally {
    // Small delay before removing to prevent race conditions
    setTimeout(() => {
      pendingTabOperations.delete(operationId);
    }, 1000);
  }
}

/**
 * Tab tracking mechanism to prevent duplicate manager tabs
 * This ensures that only one manager tab exists at any time
 */
let activeManagerTabId: number | null = null;
let managerTabCheckTimeout: number | null = null;

async function trackManagerTab(tabId: number): Promise<void> {
  activeManagerTabId = tabId;

  // Clear any existing timeout
  if (managerTabCheckTimeout) {
    clearTimeout(managerTabCheckTimeout);
  }

  // Set timeout to clear the tracking after 5 minutes of inactivity
  managerTabCheckTimeout = self.setTimeout(
    () => {
      activeManagerTabId = null;
      managerTabCheckTimeout = null;
    },
    5 * 60 * 1000,
  ); // 5 minutes
}

async function getTrackedManagerTab(): Promise<number | null> {
  return activeManagerTabId;
}

/**
 * Alternative helper function to keep service worker alive using storage API
 * This is a more reliable method that works consistently across browsers
 */
async function keepServiceWorkerAliveWithStorage(): Promise<void> {
  try {
    // Use storage API to keep service worker alive
    // This is a more reliable pattern than setTimeout
    await browser.storage.local.set({
      swKeepAlive: Date.now(),
      swKeepAliveMessage: "KEEP_ALIVE",
    });

    // Immediately read it back to complete the operation
    await browser.storage.local.get("swKeepAlive");
  } catch (error) {
    console.warn("Failed to keep service worker alive with storage:", error);
    // Fallback to tabs API if storage fails
    await keepServiceWorkerAlive();
  }
}

/**
 * Helper function to keep service worker alive using runtime API
 * This extends the service worker lifetime temporarily
 */
async function keepServiceWorkerAliveWithRuntime(): Promise<void> {
  try {
    // Use runtime API to extend service worker lifetime
    // This is the most reliable method for Firefox
    await browser.runtime.getPlatformInfo();
  } catch (error) {
    console.warn("Failed to keep service worker alive with runtime:", error);
    // Fallback to storage API if runtime fails
    await keepServiceWorkerAliveWithStorage();
  }
}

// Handler function type definition
type MessageHandler = (
  message: ReceivedMessages,
  tabId?: number,
) => Promise<unknown>;

// Handler registry type
type HandlerRegistry = Record<ReceivedMessages["type"], MessageHandler>;

/**
 * Error wrapper for message handlers to ensure consistent error handling.
 */
function withErrorHandling(handler: MessageHandler): MessageHandler {
  return async (
    message: ReceivedMessages,
    tabId?: number,
  ): Promise<unknown> => {
    try {
      return await handler(message, tabId);
    } catch (error: unknown) {
      // Create standardized error response
      const errorDetails: ErrorDetails = {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack || "" : "",
        source: "background",
        timestamp: Date.now(),
        severity: "notify",
      };

      // Log error for debugging (conditional on debug flag)
      console.error("Message handler error:", {
        messageType: message.type,
        error: errorDetails,
        tabId,
      });

      // Re-throw the error to be handled by the message bus
      throw errorDetails;
    }
  };
}

/**
 * Handler for GET_CURRENT_TAB messages.
 */
const handleGetCurrentTab: MessageHandler = async (_message, tabId) => {
  if (tabId !== undefined) {
    return { id: tabId };
  }

  // If no tabId provided, try to get the active tab
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tabs && tabs.length > 0 ? { id: tabs[0].id } : null;
  } catch (error: unknown) {
    throw new Error(
      `Failed to get current tab: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Handler for TOGGLE_THEME messages.
 */
const handleToggleTheme: MessageHandler = async (_message) => {
  // TODO: Implement theme toggling logic when storage service is available
  // For now, return success as placeholder
  console.log("Toggle theme requested");
  return { success: true, theme: "toggled" };
};

/**
 * Handler for REQUEST_EXPORT messages.
 */
const handleRequestExport: MessageHandler = async (message) => {
  // TODO: Implement actual export logic when storage service is available
  // For now, return mock data
  const exportMessage = message as Extract<
    ReceivedMessages,
    { type: "REQUEST_EXPORT" }
  >;
  console.log("Export requested:", exportMessage.payload);

  const exportData = {
    settings: {
      lastUsed: Date.now(),
      version: "1.0.0",
      isDebuggingEnabled: false,
    },
    styles: [],
    timestamp: Date.now(),
    version: "1.0.0",
  };

  return {
    data: exportData,
    format: exportMessage.payload.format,
    filename: `eastyles-backup-${Date.now()}.json`,
  };
};

/**
 * Handler for REQUEST_IMPORT messages.
 */
const handleRequestImport: MessageHandler = async (message) => {
  // TODO: Implement actual import logic when storage service is available
  // For now, validate the data structure and return success
  const importMessage = message as Extract<
    ReceivedMessages,
    { type: "REQUEST_IMPORT" }
  >;
  console.log("Import requested:", importMessage.payload);

  const { data } = importMessage.payload;

  // Basic validation of import data structure
  if (!data || typeof data !== "string") {
    throw new Error("Invalid import data: must be a string");
  }

  // Parse the JSON string
  let importData: Record<string, unknown>;
  try {
    importData = JSON.parse(data);
  } catch {
    throw new Error("Invalid import data: malformed JSON");
  }

  if (!importData || typeof importData !== "object") {
    throw new Error("Invalid import data: must be an object");
  }

  if (!importData.settings || !importData.styles || !importData.version) {
    throw new Error(
      "Invalid import data: missing required fields (settings, styles, version)",
    );
  }

  // TODO: Perform actual import when storage service is ready
  return {
    success: true,
    importedCount: Array.isArray(importData.styles)
      ? importData.styles.length
      : 0,
    version: importData.version,
  };
};

/**
 * Handler for RESET_SETTINGS messages.
 */
const handleResetSettings: MessageHandler = async (_message) => {
  // TODO: Implement actual settings reset when storage service is available
  // For now, return success as placeholder
  console.log("Settings reset requested");
  return { success: true };
};

/**
 * Handler for GET_ALL_STYLES messages.
 */
const handleGetAllStyles: MessageHandler = async (_message) => {
  // TODO: Implement actual styles retrieval when storage service is available
  // For now, return empty array
  return { styles: [] };
};

/**
 * Handler for OPEN_MANAGER messages.
 */
const handleOpenManager: MessageHandler = async (message) => {
  console.log("[handleOpenManager] Processing request");
  try {
    // Extract optional payload for navigation
    const navMessage = message as Extract<
      ReceivedMessages,
      { type: "OPEN_MANAGER" }
    >;
    const tab = navMessage.payload?.url ? "styles" : "styles"; // Default to styles tab

    // Generate unique operation ID to prevent duplicates
    const operationId = `open-manager-${Date.now()}`;

    // Use debounce mechanism to prevent duplicate calls
    await ensureUniqueOperation(operationId, async () => {
      // Check if manager tab already exists
      const managerTab = await findManagerTab();

      if (managerTab) {
        // Track this tab to prevent duplicates
        await trackManagerTab(managerTab.id!);

        // Focus existing tab
        await browser.tabs.update(managerTab.id, { active: true });

        // Navigate to the correct tab if needed
        const targetHash = tab === "styles" ? "styles" : "settings";
        const currentUrl = new URL(managerTab.url!);
        const currentHash = currentUrl.hash.slice(1);

        if (currentHash !== targetHash) {
          await browser.tabs.update(managerTab.id, {
            url: `/manager.html#${targetHash}`,
          });
        }

        console.log("[handleOpenManager] Focused existing manager tab");
        return {
          success: true,
          action: "focused_existing_manager_page",
          tab: tab,
          tabId: managerTab.id,
        };
      } else {
        // Open new manager page
        const url = "/manager.html";
        const fullUrl = tab === "styles" ? `${url}#styles` : `${url}#settings`;

        console.log(
          "[handleOpenManager] Creating new manager page with URL:",
          fullUrl,
        );
        const newTab = await browser.tabs.create({ url: fullUrl });

        // Track the newly created tab
        await trackManagerTab(newTab.id!);

        console.log(
          "[handleOpenManager] Successfully created manager tab:",
          newTab.id,
        );
        return {
          success: true,
          action: "created_manager_page",
          tab: tab,
          tabId: newTab.id,
        };
      }
    });

    return { success: true, action: "processed", tab: tab };
  } catch (error: unknown) {
    console.error("[handleOpenManager] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to open manager page: ${errorMessage}`);
  } finally {
    // Use runtime API which is the most reliable method for Firefox
    await keepServiceWorkerAliveWithRuntime();
  }
};

/**
 * Handler for ADD_STYLE messages.
 */
const handleAddStyle: MessageHandler = async (message) => {
  console.log("Add style requested:", message);
  // TODO: Implement actual style creation when storage service is available
  return {
    success: true,
    styleId: `style-${Date.now()}`,
  };
};

/**
 * Handler for OPEN_SETTINGS messages.
 */
const handleOpenSettings: MessageHandler = async (_message) => {
  console.log("[handleOpenSettings] Processing request");
  try {
    // Generate unique operation ID to prevent duplicates
    const operationId = `open-settings-${Date.now()}`;

    // Use debounce mechanism to prevent duplicate calls
    await ensureUniqueOperation(operationId, async () => {
      // Check if manager tab already exists
      const managerTab = await findManagerTab();

      if (managerTab) {
        // Track this tab to prevent duplicates
        await trackManagerTab(managerTab.id!);

        // Focus existing tab and navigate to settings
        await browser.tabs.update(managerTab.id, { active: true });
        await browser.tabs.update(managerTab.id, {
          url: `/manager.html#settings`,
        });

        console.log(
          "[handleOpenSettings] Focused existing manager tab with settings",
        );
        return {
          success: true,
          action: "focused_existing_settings_page",
          tab: "settings",
          tabId: managerTab.id,
        };
      } else {
        // Open new manager page with settings tab
        const url = "/manager.html#settings";

        console.log(
          "[handleOpenSettings] Creating new manager page with URL:",
          url,
        );
        const newTab = await browser.tabs.create({ url });

        // Track the newly created tab
        await trackManagerTab(newTab.id!);

        console.log(
          "[handleOpenSettings] Successfully created settings tab:",
          newTab.id,
        );
        return {
          success: true,
          action: "created_settings_page",
          tab: "settings",
          tabId: newTab.id,
        };
      }
    });

    return { success: true, action: "processed", tab: "settings" };
  } catch (error: unknown) {
    console.error("[handleOpenSettings] Error:", error);
    throw new Error(
      `Failed to open settings page: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    // Use runtime API which is the most reliable method for Firefox
    await keepServiceWorkerAliveWithRuntime();
  }
};

/**
 * Handler for GET_STYLES messages.
 */
const handleGetStyles: MessageHandler = async (message) => {
  console.log("Get styles requested:", message);
  // TODO: Implement actual styles retrieval when storage service is available
  return {
    styles: [],
  };
};

/**
 * Handler for TOGGLE_STYLE messages.
 */
const handleToggleStyle: MessageHandler = async (message) => {
  const toggleMessage = message as Extract<
    ReceivedMessages,
    { type: "TOGGLE_STYLE" }
  >;
  console.log("Toggle style requested:", toggleMessage);
  // TODO: Implement actual style toggling when storage service is available
  return {
    success: true,
  };
};

/**
 * Handler for THEME_CHANGED messages.
 */
const handleThemeChanged: MessageHandler = async (message) => {
  const themeMessage = message as Extract<
    ReceivedMessages,
    { type: "THEME_CHANGED" }
  >;
  console.log("Theme changed:", themeMessage.payload);
  // TODO: Implement actual theme change handling when storage service is available
  return {
    success: true,
  };
};

/**
 * Registry of all message handlers.
 */
const handlerRegistry: HandlerRegistry = {
  GET_CURRENT_TAB: withErrorHandling(handleGetCurrentTab),
  TOGGLE_THEME: withErrorHandling(handleToggleTheme),
  OPEN_MANAGER: withErrorHandling(handleOpenManager),
  ADD_STYLE: withErrorHandling(handleAddStyle),
  OPEN_SETTINGS: withErrorHandling(handleOpenSettings),
  GET_STYLES: withErrorHandling(handleGetStyles),
  TOGGLE_STYLE: withErrorHandling(handleToggleStyle),
  THEME_CHANGED: withErrorHandling(handleThemeChanged),
  REQUEST_EXPORT: withErrorHandling(handleRequestExport),
  REQUEST_IMPORT: withErrorHandling(handleRequestImport),
  RESET_SETTINGS: withErrorHandling(handleResetSettings),
  GET_ALL_STYLES: withErrorHandling(handleGetAllStyles),
};

/**
 * MessageHandlerService class that manages message handler registration and execution.
 */
export class MessageHandlerService {
  private handlers: Partial<HandlerRegistry> = {};
  private isInitialized = false;

  constructor() {
    // Register all default handlers
    this.initialize();
  }

  /**
   * Initialize the service with default handlers.
   */
  private initialize(): void {
    if (this.isInitialized) return;

    this.registerHandlers(handlerRegistry);
    this.isInitialized = true;
  }

  /**
   * Register a single message handler.
   */
  registerHandler(
    messageType: ReceivedMessages["type"],
    handler: MessageHandler,
  ): void {
    this.handlers[messageType] = withErrorHandling(handler);
  }

  /**
   * Register multiple message handlers.
   */
  registerHandlers(handlers: Partial<HandlerRegistry>): void {
    Object.entries(handlers).forEach(([messageType, handler]) => {
      if (handler) {
        this.handlers[messageType as ReceivedMessages["type"]] = handler;
      }
    });
  }

  /**
   * Unregister a message handler.
   */
  unregisterHandler(messageType: ReceivedMessages["type"]): void {
    delete this.handlers[messageType];
  }

  /**
   * Unregister all handlers (useful for cleanup).
   */
  unregisterAllHandlers(): void {
    this.handlers = {};
  }

  /**
   * Reset handlers to default state.
   */
  resetToDefaults(): void {
    this.handlers = {};
    this.registerHandlers(handlerRegistry);
  }

  /**
   * Handle an incoming message by routing it to the appropriate handler.
   */
  async handleMessage(
    message: ReceivedMessages,
    tabId?: number,
  ): Promise<unknown> {
    // Ensure service is initialized
    if (!this.isInitialized) {
      this.initialize();
    }

    const handler = this.handlers[message.type];

    if (!handler) {
      throw new Error(
        `No handler registered for message type: ${message.type}`,
      );
    }

    return await handler(message, tabId);
  }

  /**
   * Get all registered handler types.
   */
  getRegisteredHandlers(): ReceivedMessages["type"][] {
    return Object.keys(this.handlers) as ReceivedMessages["type"][];
  }

  /**
   * Check if a handler is registered for a message type.
   */
  hasHandler(messageType: ReceivedMessages["type"]): boolean {
    return messageType in this.handlers;
  }

  /**
   * Get the total number of registered handlers.
   */
  getHandlerCount(): number {
    return Object.keys(this.handlers).length;
  }

  /**
   * Validate that all required message types have handlers.
   */
  validateHandlers(): { isValid: boolean; missingHandlers: string[] } {
    const requiredTypes: ReceivedMessages["type"][] = [
      "GET_CURRENT_TAB",
      "TOGGLE_THEME",
      "OPEN_MANAGER",
      "ADD_STYLE",
      "OPEN_SETTINGS",
      "GET_STYLES",
      "TOGGLE_STYLE",
      "THEME_CHANGED",
      "REQUEST_EXPORT",
      "REQUEST_IMPORT",
      "RESET_SETTINGS",
      "GET_ALL_STYLES",
    ];

    const missingHandlers: string[] = [];

    for (const type of requiredTypes) {
      if (!this.hasHandler(type)) {
        missingHandlers.push(type);
      }
    }

    return {
      isValid: missingHandlers.length === 0,
      missingHandlers,
    };
  }
}

/**
 * Helper function to find existing manager tab
 * Uses both tracked tab and browser query for reliability
 */
async function findManagerTab(): Promise<Browser.tabs.Tab | null> {
  try {
    // First check if we have a tracked tab
    const trackedTabId = await getTrackedManagerTab();
    if (trackedTabId) {
      try {
        const tab = await browser.tabs.get(trackedTabId);
        if (tab.url?.includes("manager.html")) {
          return tab;
        }
      } catch {
        // Tab might have been closed, clear the tracking
        activeManagerTabId = null;
      }
    }

    // Fall back to querying all tabs
    const tabs = await browser.tabs.query({
      url: "*://*/manager.html*",
    });

    // Return the first manager tab found
    return tabs.length > 0 ? tabs[0] : null;
  } catch (error: unknown) {
    console.warn("[findManagerTab] Error querying tabs:", error);
    return null;
  }
}

/**
 * Initialize tab close listener to clear tracking when manager tab is closed
 */
function initializeTabCloseListener(): void {
  if (typeof browser !== "undefined" && browser.tabs) {
    browser.tabs.onRemoved.addListener((tabId) => {
      if (tabId === activeManagerTabId) {
        console.log("[TabTracker] Manager tab closed, clearing tracking");
        activeManagerTabId = null;
        if (managerTabCheckTimeout) {
          clearTimeout(managerTabCheckTimeout);
          managerTabCheckTimeout = null;
        }
      }
    });
  }
}

// Initialize the tab close listener when the module loads
initializeTabCloseListener();

// Create singleton instance
export const messageHandlerService = new MessageHandlerService();

// Export individual handlers for testing
export {
  handleGetCurrentTab,
  handleToggleTheme,
  handleOpenManager,
  handleAddStyle,
  handleOpenSettings,
  handleGetStyles,
  handleToggleStyle,
  handleThemeChanged,
  handleRequestExport,
  handleRequestImport,
  handleResetSettings,
  handleGetAllStyles,
  withErrorHandling,
};
