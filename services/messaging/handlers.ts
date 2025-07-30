/**
 * Message handlers for background script.
 * Implements typed request/response handling for all message types.
 */

import { browser } from "@wxt-dev/browser";
import { ReceivedMessages, ErrorDetails } from "./types";

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
    return tabs[0] ? { id: tabs[0].id } : null;
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
  try {
    const managerMessage = message as Extract<
      ReceivedMessages,
      { type: "OPEN_MANAGER" }
    >;
    const url = managerMessage.payload.url;

    // Open the manager page in a new tab
    const tab = await browser.tabs.create({ url });

    return {
      success: true,
      tabId: tab.id,
      url: tab.url,
    };
  } catch (error: unknown) {
    throw new Error(
      `Failed to open manager page: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Registry of all message handlers.
 */
const handlerRegistry: HandlerRegistry = {
  GET_CURRENT_TAB: withErrorHandling(handleGetCurrentTab),
  TOGGLE_THEME: withErrorHandling(handleToggleTheme),
  REQUEST_EXPORT: withErrorHandling(handleRequestExport),
  REQUEST_IMPORT: withErrorHandling(handleRequestImport),
  RESET_SETTINGS: withErrorHandling(handleResetSettings),
  GET_ALL_STYLES: withErrorHandling(handleGetAllStyles),
  OPEN_MANAGER: withErrorHandling(handleOpenManager),
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
      "REQUEST_EXPORT",
      "REQUEST_IMPORT",
      "RESET_SETTINGS",
      "GET_ALL_STYLES",
      "OPEN_MANAGER",
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

// Create singleton instance
export const messageHandlerService = new MessageHandlerService();

// Export individual handlers for testing
export {
  handleGetCurrentTab,
  handleToggleTheme,
  handleRequestExport,
  handleRequestImport,
  handleResetSettings,
  handleGetAllStyles,
  handleOpenManager,
  withErrorHandling,
};
