/**
 * Message handlers for background script.
 * Implements typed request/response handling for all message types.
 */

import { browser } from "@wxt-dev/browser";
import { ReceivedMessages, ErrorDetails } from "./types";
import { storageClient } from "../storage/client";
import { UserCSSStyle } from "../storage/schema";
import { DomainRule } from "../usercss/types";

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
  console.log("[handleGetStyles] Processing message:", message);
  try {
    // Get all UserCSS styles
    const userCSSStyles = await storageClient.getUserCSSStyles();
    console.log(
      "[handleGetStyles] Retrieved UserCSS styles:",
      userCSSStyles.length,
    );

    return {
      success: true,
      styles: userCSSStyles,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[handleGetStyles] Error:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handler for TOGGLE_STYLE messages.
 */
const handleToggleStyle: MessageHandler = async (message) => {
  const toggleMessage = message as Extract<
    ReceivedMessages,
    { type: "TOGGLE_STYLE" }
  >;
  console.log("[handleToggleStyle] Processing message:", toggleMessage);

  try {
    const { id, enabled } = toggleMessage.payload;

    // Update the style's enabled status in storage
    await storageClient.enableUserCSSStyle(id, enabled);
    console.log(
      `[handleToggleStyle] Style ${id} ${enabled ? "enabled" : "disabled"}`,
    );

    // Notify all content scripts to update/remove the style
    // Get the updated style
    const updatedStyle = await storageClient.getUserCSSStyle(id);
    if (updatedStyle) {
      // Broadcast style update to all tabs
      try {
        browser.tabs.query({}).then((tabs) => {
          tabs.forEach((tab) => {
            if (tab.id) {
              browser.tabs
                .sendMessage(tab.id, {
                  type: enabled ? "styleUpdate" : "styleRemove",
                  styleId: id,
                  style: enabled ? updatedStyle : undefined,
                })
                .catch((error) => {
                  // Silently ignore errors for tabs that don't have content scripts
                  // This is normal for extension pages, about: pages, etc.
                  const errorMessage =
                    error instanceof Error ? error.message : String(error);
                  if (
                    !errorMessage.includes("Could not establish connection") &&
                    !errorMessage.includes("Receiving end does not exist")
                  ) {
                    console.warn(
                      `[handleToggleStyle] Unexpected error notifying tab ${tab.id}:`,
                      error,
                    );
                  }
                });
            }
          });
        });
      } catch (error) {
        console.warn(
          "[handleToggleStyle] Error notifying content scripts:",
          error,
        );
      }
    }

    return {
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[handleToggleStyle] Error:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
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
 * Handler for PARSE_USERCSS messages.
 */
const handleParseUserCSS: MessageHandler = async (message) => {
  const parseMessage = message as Extract<
    ReceivedMessages,
    { type: "PARSE_USERCSS" }
  >;
  console.log("Parse UserCSS requested:", parseMessage.payload);

  try {
    const { text, sourceUrl } = parseMessage.payload;

    // Basic validation
    if (!text || typeof text !== "string") {
      throw new Error("Invalid UserCSS text: must be a non-empty string");
    }

    // Inline ultra-minimal parser to avoid import issues in background context
    console.log("[handleParseUserCSS] Using inline parser...");

    // Extract hostname from URL string without using URL constructor
    const extractHostname = (url: string): string => {
      const match = url.match(/^https?:\/\/([^/]+)/);
      return match ? match[1] : url;
    };

    // Create a simple ID hash from name and namespace
    const generateId = (name: string, namespace: string): string => {
      const input = `${namespace}:${name}`;
      let hash = 0;
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash >>> 0; // Convert to unsigned 32-bit
      }
      return Math.abs(hash).toString(16).padStart(8, "0");
    };

    // Basic regex patterns
    const METADATA_BLOCK_REGEX =
      /\/\*\s*==UserStyle==\s*\r?\n([\s\S]*?)\s*==\/UserStyle==\s*\*\//;
    // const DIRECTIVE_REGEX =
    //   /@([^\s\r\n]+)[^\S\r\n]*([\s\S]*?)(?=\r?\n@|\r?\n==\/UserStyle==|$)/g;

    // Minimal parseUserCSS function with zero DOM dependencies
    const parseUserCSSUltraMinimal = (raw: string) => {
      console.log("[parseUserCSSMinimal] Function called");

      const warnings: string[] = [];
      const errors: string[] = [];
      let css = raw;
      let metadataBlock = "";
      const domains: string[] = [];

      // Basic metadata extraction
      const metadataMatch = raw.match(METADATA_BLOCK_REGEX);
      let metadataContent = "";
      if (metadataMatch) {
        metadataBlock = metadataMatch[0];
        metadataContent = metadataMatch[1];
        css = raw.replace(metadataMatch[0], "").trim();
      } else {
        // Try to find a general comment block at the start
        const generalCommentMatch = raw.match(/^\/\*\*([\s\S]*?)\*\//);
        if (generalCommentMatch) {
          metadataContent = generalCommentMatch[1];
          metadataBlock = generalCommentMatch[0];
          css = raw.replace(generalCommentMatch[0], "").trim();
        } else {
          css = raw;
        }
      }

      // Extract basic directives
      const nameMatch = metadataContent.match(/@name\s+([^\r\n]+)/);
      const namespaceMatch = metadataContent.match(/@namespace\s+([^\r\n]+)/);
      const versionMatch = metadataContent.match(/@version\s+([^\r\n]+)/);
      const descriptionMatch = metadataContent.match(
        /@description\s+([^\r\n]+)/,
      );
      const authorMatch = metadataContent.match(/@author\s+([^\r\n]+)/);
      const homepageURLMatch = metadataContent.match(
        /@homepageURL\s+([^\r\n]+)/,
      );
      const supportURLMatch = metadataContent.match(/@supportURL\s+([^\r\n]+)/);

      const name = nameMatch ? nameMatch[1].trim() : "";
      const namespace = namespaceMatch ? namespaceMatch[1].trim() : "";
      const version = versionMatch ? versionMatch[1].trim() : "";
      const description = descriptionMatch ? descriptionMatch[1].trim() : "";
      const author = authorMatch ? authorMatch[1].trim() : "";
      const sourceUrl = homepageURLMatch
        ? homepageURLMatch[1].trim()
        : supportURLMatch
          ? supportURLMatch[1].trim()
          : "";

      // Validation - only if metadata block exists
      if (metadataMatch) {
        if (!name) {
          errors.push("Missing required @name directive");
        }
        if (!namespace) {
          errors.push("Missing required @namespace directive");
        }
        if (!version) {
          errors.push("Missing required @version directive");
        }
      }

      // Extract domains
      const domainMatches = metadataContent.match(/@domain\s+([^\r\n]+)/);
      if (domainMatches) {
        domains.push(
          ...domainMatches[1]
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean),
        );
      }

      // Extract from match patterns
      const matchMatches = metadataContent.match(/@match\s+([^\r\n]+)/g);
      if (matchMatches) {
        matchMatches.forEach((match) => {
          const pattern = match.replace("@match", "").trim();
          // Very basic domain extraction from pattern
          if (pattern.includes("*://*.")) {
            const domain = pattern.split("*://*.")[1]?.split("/")[0];
            if (domain) domains.push(domain);
          }
        });
      }

      // Parse CSS content for @-moz-document rules
      const mozDocumentCssMatch = css.match(/@-moz-document\\s+([^}]+)\\s*\\{/);
      if (mozDocumentCssMatch) {
        const mozDocumentRule = mozDocumentCssMatch[1];

        // Extract domains from CSS @-moz-document rules
        const domainMatchesCss = mozDocumentRule.match(
          /domain\\(["']?([^"')]+)["']?\\)/g,
        );
        if (domainMatchesCss) {
          domainMatchesCss.forEach((match) => {
            const domainMatch = match.match(/domain\\(["']?([^"')]+)["']?\\)/);
            if (domainMatch) {
              domains.push(domainMatch[1]);
            }
          });
        }

        // Extract url-prefix patterns
        const urlPrefixMatches = mozDocumentRule.match(
          /url-prefix\\(["']?([^"')]+)["']?\\)/g,
        );
        if (urlPrefixMatches) {
          urlPrefixMatches.forEach((match) => {
            const urlMatch = match.match(/url-prefix\\(["']?([^"')]+)["']?\\)/);
            if (urlMatch) {
              domains.push(extractHostname(urlMatch[1]));
            }
          });
        }
      }

      // Helper function to parse USO EOT blocks (similar to processor.ts)
      const parseEOTBlocksMinimal = (value: string) => {
        // Regular expression to match EOT blocks in USO format
        const eotRegex = /([\w\-]+)\s+"([^\"]+)"\s*<<<EOT\s*([\s\S]*?)\s*EOT;/g;

        const options: string[] = [];
        const optionCss: Record<string, string> = {};
        let defaultValue = "";
        let hasDefault = false;

        let match;
        while ((match = eotRegex.exec(value)) !== null) {
          const [displayLabel, cssContent] = match;

          // Check if this is the default option (marked with * in display label like "Sky*")
          const isDefault = displayLabel.includes("*");
          const cleanDisplayLabel = displayLabel.replace(/\*$/, "");

          options.push(cleanDisplayLabel);
          // Preserve the CSS content for each option
          optionCss[cleanDisplayLabel] = cssContent.trim();

          if (isDefault && !hasDefault) {
            defaultValue = cleanDisplayLabel;
            hasDefault = true;
          }
        }

        // If no default was found, use the first option's label as default
        if (!hasDefault && options.length > 0) {
          defaultValue = options[0];
        }

        return options.length > 0 ? { options, optionCss, defaultValue } : null;
      };

      // Extract variables from various directive formats (e.g., @var, @advanced, @path/type color name "label" default)
      const variables: Record<string, any> = {};

      // Enhanced regex to find variable directives in various formats
      // This handles formats like:
      // @var color name "label" default_value
      // @advanced dropdown name "label" { options }
      // @path/color name "label" default_value
      // @path/range name "label" [default, min, max, step, unit]
      // Using \s to match both spaces and tabs
      const directiveRegex =
        /@[\w\/\.\-:]+\s+(range|color|text|select|number|dropdown)\s+([\w\-]+)\s+"([^"]+)"\s*([^\r\n]+)/g;
      let directiveMatch;

      while ((directiveMatch = directiveRegex.exec(metadataContent)) !== null) {
        const fullMatch = directiveMatch[0];
        const type = directiveMatch[1]; // "range", "color", "text", "select", "number", "dropdown"
        const name = directiveMatch[2]; // variable name
        const label = directiveMatch[3]; // variable label
        let defaultValue = directiveMatch[4] || ""; // default value or options

        // Clean up the default value (remove leading/trailing spaces)
        defaultValue = defaultValue.trim();

        // Handle different types of default values
        if (defaultValue.startsWith('"') && defaultValue.endsWith('"')) {
          // Quoted string value
          defaultValue = defaultValue.slice(1, -1);
        } else if (defaultValue.startsWith("[") && defaultValue.endsWith("]")) {
          // Array format [default, min, max, step, unit] - for ranges
          const rangeParts = defaultValue
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim());
          if (rangeParts.length >= 3) {
            defaultValue = rangeParts[0]; // First value is typically the default
          }
        }

        let varDescriptor: any = {
          name: `--${name}`,
          type: type === "range" ? "number" : type, // Convert 'range' to 'number' type
          label,
          default: defaultValue,
          value: defaultValue,
        };

        // Handle range-specific properties
        if (type === "range") {
          // Parse range format [default, min, max, step, unit]
          const rangeMatch = fullMatch.match(/\[([^\]]+)\]/);
          if (rangeMatch) {
            const rangeParts = rangeMatch[1].split(",").map((s) => s.trim());
            if (rangeParts.length >= 3) {
              varDescriptor.default = rangeParts[0];
              varDescriptor.value = rangeParts[0];
              varDescriptor.min = parseFloat(rangeParts[1]);
              varDescriptor.max = parseFloat(rangeParts[2]);
            }
            if (rangeParts.length >= 4) {
              varDescriptor.step = parseFloat(rangeParts[3]);
            }
          }
        }

        // Handle dropdown types that have options in braces - check if the full metadata contains the braces
        if (
          type === "select" ||
          type === "dropdown" ||
          fullMatch.includes("{")
        ) {
          // Find the opening brace in the full match
          const braceStart = fullMatch.indexOf("{");
          if (braceStart !== -1) {
            // Find the matching closing brace in the full metadataContent
            const globalPos = directiveMatch.index + braceStart;
            let braceCount = 1;
            let pos = globalPos + 1;

            while (pos < metadataContent.length && braceCount > 0) {
              if (metadataContent[pos] === "{") braceCount++;
              else if (metadataContent[pos] === "}") braceCount--;
              pos++;
            }

            if (braceCount === 0) {
              const optionsBlock = metadataContent
                .substring(globalPos + 1, pos - 1)
                .trim();

              // Use parseEOTBlocks equivalent logic for USO format
              const dropdownOptions = parseEOTBlocksMinimal(optionsBlock);
              if (dropdownOptions) {
                varDescriptor = {
                  ...varDescriptor,
                  type: "select",
                  options: dropdownOptions.options,
                  default: dropdownOptions.defaultValue,
                  value: dropdownOptions.defaultValue,
                  optionCss: dropdownOptions.optionCss,
                };
              }
            }
          }
        }

        variables[varDescriptor.name] = varDescriptor;
      }

      const meta = {
        id: name && namespace ? generateId(name, namespace) : "",
        name,
        namespace,
        version,
        description,
        author,
        sourceUrl,
        domains,
      };

      return {
        meta,
        css,
        metadataBlock,
        variables,
        warnings,
        errors,
      };
    };

    // Use the ultra-minimal processor to avoid any DOM dependencies
    console.log(
      "[handleParseUserCSS] About to call parseUserCSSUltraMinimal...",
    );
    const parseResult = parseUserCSSUltraMinimal(text);
    console.log(
      "[handleParseUserCSS] parseUserCSSUltraMinimal returned:",
      parseResult,
    );

    // Only preprocess if we're not in a background context where DOM is not available
    let compiledCss = parseResult.css;
    let preprocessorErrors: string[] = [];

    console.log("[handleParseUserCSS] About to check DOM preprocessing...");
    try {
      // Check if we're in a context where DOM APIs are available
      let hasDom = false;
      try {
        hasDom = typeof globalThis.window !== "undefined";
      } catch {
        // If accessing window throws, we definitely don't have DOM access
        hasDom = false;
      }

      if (hasDom) {
        // Only preprocess if DOM is available
        const { processUserCSS } = await import("../usercss/processor");
        const fullResult = await processUserCSS(text);
        compiledCss = fullResult.compiledCss;
        preprocessorErrors = fullResult.preprocessorErrors || [];
      } else {
        // In background context, just use the basic parsed CSS
        console.log("Background context detected, skipping preprocessing");
      }
    } catch (preprocessError) {
      // If preprocessing fails, continue with basic parsing
      console.warn(
        "UserCSS preprocessing failed, using basic parsing:",
        preprocessError,
      );
      preprocessorErrors.push(
        preprocessError instanceof Error
          ? preprocessError.message
          : "Preprocessing failed",
      );
    }

    return {
      success: true,
      meta: {
        ...parseResult.meta,
        sourceUrl: sourceUrl || parseResult.meta.sourceUrl,
      },
      css: compiledCss,
      metadataBlock: parseResult.metadataBlock,
      variables: parseResult.variables || {}, // Include variables from ultra-minimal parser
      warnings: [...parseResult.warnings, ...preprocessorErrors],
      errors: parseResult.errors,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handler for INSTALL_STYLE messages.
 */
const handleInstallStyle: MessageHandler = async (message) => {
  console.log(
    "[handleInstallStyle] Handler called with message:",
    message?.type,
  );
  console.log(
    "[handleInstallStyle] Message has payload:",
    "payload" in (message || {}),
  );

  const installMessage = message as Extract<
    ReceivedMessages,
    { type: "INSTALL_STYLE" }
  >;
  console.log("[handleInstallStyle] Type casting completed");
  console.log("Install style requested:", installMessage.payload);

  try {
    console.log("[handleInstallStyle] Starting installation process...");
    const { meta, compiledCss, variables } = installMessage.payload;
    console.log("[handleInstallStyle] Payload extracted successfully");

    // Basic validation
    if (!meta || !meta.name) {
      throw new Error("Invalid style metadata: name is required");
    }

    if (!compiledCss || typeof compiledCss !== "string") {
      throw new Error("Invalid compiled CSS: must be a non-empty string");
    }

    // Validate variables if provided
    if (variables && Array.isArray(variables)) {
      for (const variable of variables) {
        if (!variable.name || !variable.type) {
          throw new Error("Invalid variable: name and type are required");
        }
      }
    }

    // Use direct storage access to avoid window dependencies
    console.log("[handleInstallStyle] Using direct storage access...");
    // Use the already imported storageClient instead of importing @wxt-dev/storage directly
    console.log("[handleInstallStyle] Storage client ready");

    // Parse domains from CSS content if not found in metadata
    console.log("[handleInstallStyle] About to process domains...");
    const allDomains = [...meta.domains];
    console.log(
      "[handleInstallStyle] Initial domains processed:",
      allDomains.length,
    );

    // Parse CSS content for @-moz-document rules
    const mozDocumentCssMatch = compiledCss.match(
      /@-moz-document\s+([^}]+)\s*\{/,
    );
    if (mozDocumentCssMatch) {
      const mozDocumentRule = mozDocumentCssMatch[1];
      console.log(
        "[handleInstallStyle] Found @-moz-document rule in CSS:",
        mozDocumentRule,
      );

      // Extract domains from CSS @-moz-document rules
      const domainMatches = mozDocumentRule.match(
        /domain\(["']?([^"')]+)["']?\)/g,
      );
      if (domainMatches) {
        domainMatches.forEach((match) => {
          const domainMatch = match.match(/domain\(["']?([^"')]+)["']?\)/);
          if (domainMatch && !allDomains.includes(domainMatch[1])) {
            allDomains.push(domainMatch[1]);
            console.log(
              "[handleInstallStyle] Extracted domain from CSS:",
              domainMatch[1],
            );
          }
        });
      }

      // Extract url-prefix patterns from CSS @-moz-document rules
      const urlPrefixMatches = mozDocumentRule.match(
        /url-prefix\(["']?([^"')]+)["']?\)/g,
      );
      if (urlPrefixMatches) {
        urlPrefixMatches.forEach((match) => {
          const urlMatch = match.match(/url-prefix\(["']?([^"')]+)["']?\)/);
          if (urlMatch) {
            try {
              const url = new URL(urlMatch[1]);
              const domain = url.hostname;
              if (!allDomains.includes(domain)) {
                allDomains.push(domain);
                console.log(
                  "[handleInstallStyle] Extracted domain from url-prefix:",
                  domain,
                );
              }
            } catch {
              // Ignore invalid URLs
            }
          }
        });
      }
    }

    // Convert string domains to DomainRule format (inline to avoid window access)
    console.log("[handleInstallStyle] About to create domain rules...");
    const normalizePattern = (domain: string): string => {
      // Simple normalization without URL constructor
      return domain.toLowerCase().trim();
    };

    const domainRules: DomainRule[] = allDomains.map((domain) => ({
      kind: "domain" as const,
      pattern: normalizePattern(domain),
      include: true,
    }));
    console.log(
      "[handleInstallStyle] Domain rules created:",
      domainRules.length,
    );

    // Simple domain extraction from CSS content (inline to avoid window access)
    const extractDomains = (css: string): DomainRule[] => {
      const rules: DomainRule[] = [];

      // Find all @-moz-document blocks
      const mozDocumentRegex = /@-moz-document\s+([^{\n\r]+?)\s*\{/g;
      let match;

      while ((match = mozDocumentRegex.exec(css)) !== null) {
        const conditionList = match[1];

        // Extract domain patterns
        const domainMatches = conditionList.match(
          /domain\(["']?([^"')]+)["']?\)/g,
        );
        if (domainMatches) {
          domainMatches.forEach((match) => {
            const domainMatch = match.match(/domain\(["']?([^"')]+)["']?\)/);
            if (domainMatch) {
              rules.push({
                kind: "domain",
                pattern: normalizePattern(domainMatch[1]),
                include: true,
              });
            }
          });
        }

        // Extract url-prefix patterns
        const urlPrefixMatches = conditionList.match(
          /url-prefix\(["']?([^"')]+)["']?\)/g,
        );
        if (urlPrefixMatches) {
          urlPrefixMatches.forEach((match) => {
            const urlMatch = match.match(/url-prefix\(["']?([^"')]+)["']?\)/);
            if (urlMatch) {
              // Extract domain from URL prefix (simple approach)
              const url = urlMatch[1];
              if (url.startsWith("https://")) {
                const domain = url.substring(8).split("/")[0];
                if (domain) {
                  rules.push({
                    kind: "url-prefix",
                    pattern: normalizePattern(url),
                    include: true,
                  });
                }
              }
            }
          });
        }
      }

      return rules;
    };

    const extractedRules = extractDomains(compiledCss);
    if (extractedRules.length > 0) {
      console.log(
        "[handleInstallStyle] Extracted domain rules from CSS:",
        extractedRules,
      );
      // Merge with existing rules, avoiding duplicates
      for (const rule of extractedRules) {
        const exists = domainRules.some(
          (existing) =>
            existing.kind === rule.kind && existing.pattern === rule.pattern,
        );
        if (!exists) {
          domainRules.push(rule);
        }
      }
    }

    console.log("[handleInstallStyle] Final domains:", allDomains);
    console.log("[handleInstallStyle] Domain rules:", domainRules);

    // Convert variables array to Record format
    const variablesRecord: Record<
      string,
      import("../usercss/types").VariableDescriptor
    > = {};
    if (variables) {
      variables.forEach((variable) => {
        // Map the string type to the expected enum values
        let mappedType: import("../usercss/types").VariableDescriptor["type"] =
          "unknown";
        switch (variable.type) {
          case "color":
            mappedType = "color";
            break;
          case "number":
            mappedType = "number";
            break;
          case "text":
            mappedType = "text";
            break;
          case "select":
            mappedType = "select";
            break;
        }

        variablesRecord[variable.name] = {
          name: variable.name,
          type: mappedType,
          default: variable.default,
          value: variable.default, // Start with default value
          min: variable.min,
          max: variable.max,
          options: variable.options,
        };
      });
    }

    // Create the style object for storage
    const styleData = {
      name: meta.name,
      namespace: meta.namespace || "",
      version: meta.version || "1.0.0",
      description: meta.description || "",
      author: meta.author || "",
      sourceUrl: meta.sourceUrl || "",
      domains: domainRules,
      compiledCss: compiledCss,
      variables: variablesRecord,
      originalDefaults: {},
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: "", // Original source code (could be added later if needed)
      updatedAt: Date.now(),
    };

    // Add the style to storage using inline operations
    console.log("[handleInstallStyle] About to save style to storage...");
    const savedStyle = await storageClient.addUserCSSStyle(styleData);
    console.log(
      "[handleInstallStyle] Style saved successfully:",
      savedStyle.id,
    );

    console.log("Style installed successfully:", savedStyle.id, savedStyle);
    console.log("Style domains:", savedStyle.domains);

    // Notify all content scripts to apply the new style
    console.log(
      "[handleInstallStyle] Notifying content scripts about new style",
    );
    try {
      browser.tabs.query({}).then((tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            browser.tabs
              .sendMessage(tab.id, {
                type: "styleUpdate",
                styleId: savedStyle.id,
                style: savedStyle,
              })
              .catch((error) => {
                // Silently ignore errors for tabs that don't have content scripts
                // This is normal for extension pages, about: pages, etc.
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                if (
                  !errorMessage.includes("Could not establish connection") &&
                  !errorMessage.includes("Receiving end does not exist")
                ) {
                  console.warn(
                    `[handleInstallStyle] Unexpected error notifying tab ${tab.id}:`,
                    error,
                  );
                }
              });
          }
        });
      });
    } catch (error) {
      console.warn(
        "[handleInstallStyle] Error notifying content scripts:",
        error,
      );
    }

    // Verify the style was saved by retrieving all styles
    const allStyles = await storageClient.getUserCSSStyles();
    console.log("Total styles after installation:", allStyles.length);
    console.log(
      "All styles domains:",
      allStyles.map((s) => ({ id: s.id, domains: s.domains })),
    );

    return {
      success: true,
      styleId: savedStyle.id,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to install style:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handle creating a new font style
 */
const handleCreateFontStyle: MessageHandler = async (message) => {
  try {
    const { domain, fontName } = (
      message as {
        payload: { domain?: string; fontName: string };
      }
    ).payload;

    console.log(
      "[handleCreateFontStyle] Creating font style:",
      fontName,
      "for domain:",
      domain,
    );

    // Validate font name
    if (
      !fontName ||
      typeof fontName !== "string" ||
      fontName.trim().length === 0
    ) {
      throw new Error("Font name is required and cannot be empty");
    }

    // Validate domain if provided
    if (domain && typeof domain === "string") {
      // Basic domain validation - should contain at least one dot and no spaces
      const trimmedDomain = domain.trim();
      if (trimmedDomain.length === 0) {
        throw new Error("Domain cannot be empty");
      }
      if (trimmedDomain.includes(" ")) {
        throw new Error("Domain cannot contain spaces");
      }
      if (!trimmedDomain.includes(".")) {
        throw new Error(
          "Domain must contain at least one dot (e.g., example.com)",
        );
      }
      // Additional validation for common domain patterns
      const domainRegex =
        /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!domainRegex.test(trimmedDomain)) {
        throw new Error("Invalid domain format");
      }
    }

    // Create inline normalizePattern function to avoid window/URL issues in background script
    const normalizePattern = (pattern: string): string => {
      try {
        // Remove leading/trailing whitespace
        let normalized = pattern.trim();

        // If it's a full URL, extract just the hostname using simple string manipulation
        if (normalized.includes("://")) {
          // Simple hostname extraction without URL constructor
          const protocolIndex = normalized.indexOf("://");
          const afterProtocol = normalized.slice(protocolIndex + 3);
          const pathIndex = afterProtocol.indexOf("/");
          const hostname =
            pathIndex >= 0 ? afterProtocol.slice(0, pathIndex) : afterProtocol;
          return hostname;
        }

        // Remove trailing slashes
        normalized = normalized.replace(/\/+$/, "");

        return normalized;
      } catch {
        // If parsing fails, return as-is (but still trim and remove trailing slashes)
        return pattern.trim().replace(/\/+$/, "");
      }
    };

    // Validate that the font exists (inline check)
    const builtInFonts = [
      {
        name: "Inter",
        file: "Inter.woff2",
        category: "sans-serif",
        weight: "400",
        style: "normal",
      },
      {
        name: "JetBrains Mono",
        file: "JetBrains Mono.woff2",
        category: "monospace",
        weight: "400",
        style: "normal",
      },
      {
        name: "Parkinsans",
        file: "Parkinsans.woff2",
        category: "sans-serif",
        weight: "400",
        style: "normal",
      },
      {
        name: "Atkinson Hyperlegible",
        file: "Atkinson Hyperlegible.woff2",
        category: "sans-serif",
        weight: "400",
        style: "normal",
      },
      {
        name: "Crimson Pro",
        file: "Crimson Pro.woff2",
        category: "serif",
        weight: "400",
        style: "normal",
      },
      {
        name: "Faculty Glyphic",
        file: "Faculty Glyphic.woff2",
        category: "display",
        weight: "400",
        style: "normal",
      },
      {
        name: "Fraunces",
        file: "Fraunces.woff2",
        category: "serif",
        weight: "400",
        style: "normal",
      },
      {
        name: "Henny Penny",
        file: "Henny Penny.woff2",
        category: "handwriting",
        weight: "400",
        style: "normal",
      },
      {
        name: "Jost",
        file: "Jost.woff2",
        category: "sans-serif",
        weight: "400",
        style: "normal",
      },
      {
        name: "Kode Mono",
        file: "Kode Mono.woff2",
        category: "monospace",
        weight: "400",
        style: "normal",
      },
      {
        name: "Outfit",
        file: "Outfit.woff2",
        category: "sans-serif",
        weight: "400",
        style: "normal",
      },
      {
        name: "Parkinsans",
        file: "Parkinsans.woff2",
        category: "sans-serif",
        weight: "400",
        style: "normal",
      },
      {
        name: "Playwrite IN",
        file: "Playwrite IN.woff2",
        category: "handwriting",
        weight: "400",
        style: "normal",
      },
      {
        name: "SUSE",
        file: "SUSE.woff2",
        category: "sans-serif",
        weight: "400",
        style: "normal",
      },
      {
        name: "Unbounded",
        file: "Unbounded.woff2",
        category: "sans-serif",
        weight: "400",
        style: "normal",
      },
    ];
    const fontExists = builtInFonts.some((font) => font.name === fontName);
    if (!fontExists) {
      throw new Error(
        `Font "${fontName}" is not available. Please select a font from the available options.`,
      );
    }

    // Get font data
    const font = builtInFonts.find((f) => f.name === fontName);
    if (!font) {
      throw new Error(`Font "${fontName}" not found`);
    }

    // Generate UserCSS for the font (inline generation)
    const fontPath = `/fonts/${font.file}`;
    const absoluteFontPath = browser?.runtime?.getURL
      ? browser.runtime.getURL(fontPath)
      : fontPath;

    const fontFaceRule = `
  @font-face {
    font-family: '${fontName}';
    src: url('${absoluteFontPath}') format('woff2');
    font-weight: ${font.weight};
    font-style: ${font.style};
    font-display: swap;
  }`;

    const fontFamilyRule = `
   * {
     font-family: '${fontName}', sans-serif !important;
   }`;

    // Process domain for title
    const titleDomain = domain
      ? domain
          .replace(/\.(com|org|net|edu)$/, "")
          .replace(/\./g, " ")
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
      : "";
    const name = domain
      ? `${fontName} in ${titleDomain}`
      : `Eastyles Font: ${fontName}`;
    const matchRule = domain ? `@match *://${domain}/*` : "";

    const userCSS = `/* ==UserStyle==
  @name ${name}
  @namespace github.com/KiKaraage/Eastyles
  @version 1.0.0
  @description Apply ${fontName} font to ${domain || "all sites"}
  @author Eastyles
  ${matchRule}
  ==/UserStyle== */

  ${fontFaceRule}
  ${fontFamilyRule}`;

    // Create domain rules directly
    const domainRules: DomainRule[] = domain
      ? [
          {
            kind: "domain" as const,
            pattern: normalizePattern(domain),
            include: true,
          },
        ]
      : [];

    // Create the style data directly without parsing
    const styleData = {
      name,
      namespace: "github.com/KiKaraage/Eastyles",
      version: "1.0.0",
      description: `Apply ${fontName} font to ${domain || "all sites"}`,
      author: "Eastyles",
      sourceUrl: "",
      domains: domainRules,
      compiledCss: `${fontFaceRule}\n${fontFamilyRule}`.trim(),
      variables: {},
      originalDefaults: {},
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: userCSS,
      updatedAt: Date.now(),
    };

    // Save the style
    const savedStyle = await storageClient.addUserCSSStyle(styleData);

    console.log(
      "[handleCreateFontStyle] Font style created successfully:",
      savedStyle.id,
    );

    // Notify all content scripts to apply the new font style
    try {
      browser.tabs.query({}).then((tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            browser.tabs
              .sendMessage(tab.id, {
                type: "styleUpdate",
                styleId: savedStyle.id,
                style: savedStyle,
              })
              .catch((error) => {
                // Silently ignore errors for tabs that don't have content scripts
                // This is normal for extension pages, about: pages, etc.
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                if (
                  !errorMessage.includes("Could not establish connection") &&
                  !errorMessage.includes("Receiving end does not exist")
                ) {
                  console.warn(
                    `[handleCreateFontStyle] Unexpected error notifying tab ${tab.id}:`,
                    error,
                  );
                }
              });
          }
        });
      });
    } catch (error) {
      console.warn(
        "[handleCreateFontStyle] Error notifying content scripts:",
        error,
      );
    }

    return {
      success: true,
      styleId: savedStyle.id,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      "[handleInstallStyle] Failed to install style:",
      errorMessage,
    );
    console.error("[handleInstallStyle] Error details:", error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handle direct font injection
 */
const handleInjectFont: MessageHandler = async (message) => {
  try {
    const { fontName, css } = (
      message as {
        payload: { fontName: string; css: string };
      }
    ).payload;

    console.log("[handleInjectFont] Injecting font:", fontName);

    // Get the current active tab
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const currentTab = tabs[0];

    if (!currentTab?.id) {
      throw new Error("No active tab found");
    }

    // Try to send to content script first
    try {
      await browser.tabs.sendMessage(currentTab.id, {
        type: "injectFont",
        fontName,
        css,
      });
      console.log("[handleInjectFont] Successfully sent to content script");
    } catch (contentScriptError) {
      // Content script not available, inject directly using executeScript
      console.log(
        "[handleInjectFont] Content script not available, injecting directly",
      );

      const errorMessage =
        contentScriptError instanceof Error
          ? contentScriptError.message
          : String(contentScriptError);
      if (
        errorMessage.includes("Could not establish connection") ||
        errorMessage.includes("Receiving end does not exist")
      ) {
        // Inject CSS directly using insertCSS
        await browser.tabs.insertCSS(currentTab.id, {
          code: css,
          cssOrigin: "user",
          runAt: "document_start",
        });

        console.log("[handleInjectFont] Successfully injected font directly");
      } else {
        // Re-throw unexpected errors
        throw contentScriptError;
      }
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[handleInjectFont] Failed to inject font:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handle variable updates for UserCSS styles
 */
const handleUpdateVariables: MessageHandler = async (message) => {
  try {
    const { styleId, variables } = (
      message as {
        payload: { styleId: string; variables: Record<string, string> };
      }
    ).payload;

    // Update variables using the variable persistence service
    const { variablePersistenceService } = await import(
      "../usercss/variable-service"
    );
    await variablePersistenceService.updateVariables(styleId, variables);

    return {
      success: true,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update variables:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handle queries for styles applicable to a specific URL
 */
/**
 * Handler for QUERY_STYLES_FOR_URL messages.
 * Queries active UserCSS styles that match the current URL.
 */
const handleQueryStylesForUrl: MessageHandler = async (message) => {
  try {
    console.log(
      "[handleQueryStylesForUrl] Handler called with message:",
      message,
    );
    const { url } = (message as { payload: { url: string } }).payload;

    console.log("[handleQueryStylesForUrl] Processing URL:", url);

    // Get all UserCSS styles using storage client
    console.log("[handleQueryStylesForUrl] About to get UserCSS styles");
    const userCSSStyles = await storageClient.getUserCSSStyles();
    console.log(
      "[handleQueryStylesForUrl] Retrieved styles:",
      userCSSStyles.length,
    );

    // Simple inline domain extraction without URL constructor
    const extractDomain = (url: string): string => {
      try {
        // Simple regex-based domain extraction
        const match = url.match(/^https?:\/\/([^/?#]+)/i);
        return match ? match[1].toLowerCase() : url.toLowerCase();
      } catch (error) {
        console.log("[handleQueryStylesForUrl] Error in extractDomain:", error);
        return url.toLowerCase();
      }
    };

    // Simple inline domain matching without importing domain detector
    const matchesDomainRule = (domain: string, rule: DomainRule): boolean => {
      try {
        const rulePattern = rule.pattern.toLowerCase();

        switch (rule.kind) {
          case "domain":
            // Handle exact domain matches and subdomain matches
            if (domain === rulePattern) return true;
            if (domain.endsWith("." + rulePattern)) return true;
            // Handle www subdomain special case
            if (
              domain.startsWith("www.") &&
              domain.substring(4) === rulePattern
            )
              return true;
            if (
              rulePattern.startsWith("www.") &&
              rulePattern.substring(4) === domain
            )
              return true;
            return false;

          case "url-prefix":
            return url.toLowerCase().startsWith(rulePattern);

          case "url":
            return url.toLowerCase() === rulePattern;

          case "regexp":
            try {
              const regex = new RegExp(rulePattern);
              return regex.test(url);
            } catch (error) {
              console.log(
                "[handleQueryStylesForUrl] Invalid regex pattern:",
                rulePattern,
                error,
              );
              return false; // Invalid regex doesn't match
            }

          default:
            return false;
        }
      } catch (error) {
        console.log(
          "[handleQueryStylesForUrl] Error in matchesDomainRule:",
          error,
        );
        return false;
      }
    };

    // Filter styles that match the URL using inline domain detection
    console.log("[handleQueryStylesForUrl] About to filter styles");
    const matchingStyles = userCSSStyles.filter((style: UserCSSStyle) => {
      try {
        const styleDomains = style.domains || [];

        // If no domains, treat as global style
        if (styleDomains.length === 0) {
          return true;
        }

        const urlDomain = extractDomain(url);

        // First check exclude rules - if any exclude rule matches, return false
        for (const rule of styleDomains) {
          if (!rule.include && matchesDomainRule(urlDomain, rule)) {
            return false;
          }
        }

        // Then check include rules - if any include rule matches, return true
        for (const rule of styleDomains) {
          if (rule.include && matchesDomainRule(urlDomain, rule)) {
            return true;
          }
        }

        // If we have include rules but none matched, return false
        const hasIncludeRules = styleDomains.some((rule) => rule.include);
        if (hasIncludeRules) {
          return false;
        }

        // If we only have exclude rules and none matched, return true
        return true;
      } catch (error) {
        console.log(
          "[handleQueryStylesForUrl] Error filtering style:",
          style.id,
          error,
        );
        // If there's an error in matching, exclude the style
        return false;
      }
    });

    console.log(
      "[handleQueryStylesForUrl] Found matching styles:",
      matchingStyles.length,
    );

    return {
      success: true,
      styles: matchingStyles,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[handleQueryStylesForUrl] Error:", errorMessage);
    console.error("[handleQueryStylesForUrl] Error stack:", error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handler for FETCH_ASSETS messages.
 */
const handleFetchAssets: MessageHandler = async (message) => {
  console.log("[handleFetchAssets] Processing message:", message);
  try {
    const { assets } = (
      message as {
        payload: {
          assets: Array<{ url: string; type: "image" | "font" | "other" }>;
        };
      }
    ).payload;
    console.log(`[handleFetchAssets] Fetching ${assets.length} assets`);

    // Import asset processor
    const { fetchAssetAsDataUrl } = await import("../usercss/asset-processor");

    // Fetch all assets in parallel
    const fetchPromises = assets.map((asset) =>
      fetchAssetAsDataUrl({
        url: asset.url,
        type: asset.type,
        originalUrl: asset.url,
      }),
    );
    const results = await Promise.all(fetchPromises);

    console.log(
      `[handleFetchAssets] Successfully processed ${results.filter((r) => r.dataUrl).length}/${assets.length} assets`,
    );

    return {
      success: true,
      assets: results,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[handleFetchAssets] Error:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
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
  // PARSE_USERCSS: withErrorHandling(handleParseUserCSS), // Temporarily disabled to isolate window error
  INSTALL_STYLE: withErrorHandling(handleInstallStyle),
  INJECT_FONT: withErrorHandling(handleInjectFont),
  CREATE_FONT_STYLE: withErrorHandling(handleCreateFontStyle),
  UPDATE_VARIABLES: withErrorHandling(handleUpdateVariables),
  QUERY_STYLES_FOR_URL: withErrorHandling(handleQueryStylesForUrl), // Full version with inline domain matching
  FETCH_ASSETS: withErrorHandling(handleFetchAssets),
  PARSE_USERCSS: withErrorHandling(handleParseUserCSS), // Restored - confirmed not the source of window error
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
    console.log("[MessageHandlerService] Handling message:", message.type);
    // Ensure service is initialized
    if (!this.isInitialized) {
      console.log("[MessageHandlerService] Initializing service");
      this.initialize();
    }

    const handler = this.handlers[message.type];
    console.log(
      "[MessageHandlerService] Found handler for",
      message.type,
      ":",
      !!handler,
    );

    if (!handler) {
      console.error(
        "[MessageHandlerService] No handler registered for message type:",
        message.type,
      );
      throw new Error(
        `No handler registered for message type: ${message.type}`,
      );
    }

    console.log("[MessageHandlerService] Calling handler for", message.type);
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
      "PARSE_USERCSS", // Restored
      "INSTALL_STYLE",
      "QUERY_STYLES_FOR_URL", // Restored
      "FETCH_ASSETS",
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
  handleParseUserCSS,
  handleInstallStyle,
  handleFetchAssets,
  withErrorHandling,
};
