/**
 * Message handlers for background script.
 * Implements typed request/response handling for all message types.
 */

import { browser, type PublicPath } from "wxt/browser";
import { storageClient } from "../storage/client";
import type { UserCSSStyle } from "../storage/schema";
import { broadcastService } from "../usercss/broadcast-service";
import type { BuiltInFont } from "../usercss/font-registry";
import { fontRegistry } from "../usercss/font-registry";
import type {
  DomainRule,
  ParseResult,
  VariableDescriptor,
} from "../usercss/types";
import type { ErrorDetails, ReceivedMessages } from "./types";
import { regex } from "arkregex";

function _extractHostname(url: string): string {
  const match = url.match(/^https?:\/\/([^/]+)/);
  return match ? match[1] : url;
}

/**
 * Helper function to keep service worker alive using browser.tabs API
 * This is more reliable than setTimeout for preventing premature termination
 */
async function keepServiceWorkerAlive(): Promise<void> {
  try {
    // Query tabs to keep the service worker active
    await browser.tabs.query({});
  } catch (error) {
    console.warn("[ea-Handlers] Failed to keep service worker alive:", error);
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
      `[ea-ensureUniqueOperation] Operation ${operationId} already in progress, skipping`,
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
    console.warn(
      "[ea-Handlers] Failed to keep service worker alive with storage:",
      error,
    );
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
    console.warn(
      "[ea-Handlers] Failed to keep service worker alive with runtime:",
      error,
    );
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
      console.error("[ea-Handlers] Message handler error:", {
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
  console.log("[ea] Toggle theme requested");
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
  console.log("[ea] Export requested:", exportMessage.payload);

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
  console.log("[ea] Import requested:", importMessage.payload);

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
  console.log("[ea] Settings reset requested");
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
  console.log("[ea-handleOpenManager] Processing request");
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

      if (managerTab?.id) {
        // Track this tab to prevent duplicates
        await trackManagerTab(managerTab.id);

        // Focus existing tab
        await browser.tabs.update(managerTab.id, { active: true });

        // Navigate to the correct tab if needed
        if (managerTab.url) {
          const targetHash = tab === "styles" ? "styles" : "settings";
          const currentUrl = new URL(managerTab.url);
          const currentHash = currentUrl.hash.slice(1);

          if (currentHash !== targetHash) {
            await browser.tabs.update(managerTab.id, {
              url: `/manager.html#${targetHash}`,
            });
          }
        }

        console.log("[ea-handleOpenManager] Focused existing manager tab");
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
          "[ea-handleOpenManager] Creating new manager page with URL:",
          fullUrl,
        );
        const newTab = await browser.tabs.create({ url: fullUrl });

        // Track the newly created tab
        if (newTab.id !== undefined) {
          await trackManagerTab(newTab.id);
        }

        console.log(
          "[ea-handleOpenManager] Successfully created manager tab:",
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
    console.error("[ea-handleOpenManager] Error:", error);
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
  console.log("[ea] Add style requested:", message);
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
  console.log("[ea-handleOpenSettings] Processing request");
  try {
    // Generate unique operation ID to prevent duplicates
    const operationId = `open-settings-${Date.now()}`;

    // Use debounce mechanism to prevent duplicate calls
    await ensureUniqueOperation(operationId, async () => {
      // Check if manager tab already exists
      const managerTab = await findManagerTab();

      if (managerTab?.id) {
        // Track this tab to prevent duplicates
        await trackManagerTab(managerTab.id);

        // Focus existing tab and navigate to settings
        await browser.tabs.update(managerTab.id, { active: true });
        await browser.tabs.update(managerTab.id, {
          url: `/manager.html#settings`,
        });

        console.log(
          "[ea-handleOpenSettings] Focused existing manager tab with settings",
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
          "[ea-handleOpenSettings] Creating new manager page with URL:",
          url,
        );
        const newTab = await browser.tabs.create({ url });

        // Track the newly created tab
        if (newTab.id !== undefined) {
          await trackManagerTab(newTab.id);
        }

        console.log(
          "[ea-handleOpenSettings] Successfully created settings tab:",
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
    console.error("[ea-handleOpenSettings] Error:", error);
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
  console.log("[ea-handleGetStyles] Processing message:", message);
  try {
    // Get all UserCSS styles
    const userCSSStyles = await storageClient.getUserCSSStyles();
    console.log(
      "[ea-handleGetStyles] Retrieved UserCSS styles:",
      userCSSStyles.length,
    );

    return {
      success: true,
      styles: userCSSStyles,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[ea-handleGetStyles] Error:", errorMessage);
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
  console.log("[ea-handleToggleStyle] Processing message:", toggleMessage);

  try {
    const { id, enabled, tabId } = toggleMessage.payload;

    // Update the style's enabled status in storage
    await storageClient.enableUserCSSStyle(id, enabled);
    console.log(
      `[ea-handleToggleStyle] Style ${id} ${enabled ? "enabled" : "disabled"}`,
    );

    // Notify content scripts to update/remove the style
    // Get the updated style
    const updatedStyle = await storageClient.getUserCSSStyle(id);
    if (updatedStyle) {
      // Send message to specific tab or all tabs
      try {
        if (tabId) {
          console.log(
            `[ea-handleToggleStyle] Sending ${enabled ? "styleUpdate" : "styleRemove"} for style ${id} to specific tab ${tabId}`,
          );
          browser.tabs
            .sendMessage(tabId, {
              type: enabled ? "styleUpdate" : "styleRemove",
              styleId: id,
              style: enabled ? updatedStyle : undefined,
            })
            .then(() => {
              console.log(
                `[ea-handleToggleStyle] Successfully sent message to tab ${tabId}`,
              );
            })
            .catch((error: unknown) => {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              console.warn(
                `[ea-handleToggleStyle] Error notifying tab ${tabId}:`,
                errorMessage,
              );
            });
        } else {
          console.log(
            `[ea-handleToggleStyle] Broadcasting ${enabled ? "styleUpdate" : "styleRemove"} for style ${id} to all tabs`,
          );
          browser.tabs.query({}).then((tabs) => {
            console.log(
              `[ea-handleToggleStyle] Found ${tabs.length} tabs to notify`,
            );
            tabs.forEach((tab) => {
              if (tab.id) {
                console.log(
                  `[ea-handleToggleStyle] Sending message to tab ${tab.id} (${tab.url})`,
                );
                browser.tabs
                  .sendMessage(tab.id, {
                    type: enabled ? "styleUpdate" : "styleRemove",
                    styleId: id,
                    style: enabled ? updatedStyle : undefined,
                  })
                  .then(() => {
                    console.log(
                      `[ea-handleToggleStyle] Successfully sent message to tab ${tab.id}`,
                    );
                  })
                  .catch((error) => {
                    // Silently ignore errors for tabs that don't have content scripts
                    // This is normal for extension pages, about: pages, etc.
                    const errorMessage =
                      error instanceof Error ? error.message : String(error);
                    if (
                      !errorMessage.includes(
                        "Could not establish connection",
                      ) &&
                      !errorMessage.includes("Receiving end does not exist")
                    ) {
                      console.warn(
                        `[ea-handleToggleStyle] Unexpected error notifying tab ${tab.id}:`,
                        error,
                      );
                    } else {
                      console.log(
                        `[ea-handleToggleStyle] Expected error for tab ${tab.id}: ${errorMessage}`,
                      );
                    }
                  });
              }
            });
          });
        }
      } catch (error) {
        console.warn(
          "[ea-handleToggleStyle] Error notifying content scripts:",
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
    console.error("[ea-handleToggleStyle] Error:", errorMessage);
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
  console.log("[ea] Theme changed:", themeMessage.payload);
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
  console.log("[ea] Parse UserCSS requested:", parseMessage.payload);

  try {
    const { text, sourceUrl } = parseMessage.payload;

    // Basic validation
    if (!text || typeof text !== "string") {
      throw new Error("Invalid UserCSS text: must be a non-empty string");
    }

    // Use the main processor which now supports background context

    // Extract domains from regexp patterns
    const extractDomainsFromRegexp = (pattern: string): DomainRule[] => {
      const domains: DomainRule[] = [];

      try {
        // Remove protocol prefix
        let domainPart: string = pattern.replace(/^https?:\/\//, "");

        // Handle escaped characters in the pattern
        domainPart = domainPart.replace(/\\./g, ".");

        // Remove regexp quantifiers and groups that don't affect the domain
        // This is a simplified approach - remove common patterns that don't affect domain extraction
        domainPart = domainPart.replace(/\([^)]*\)\*/g, ""); // Remove optional groups like (gist\.)*
        domainPart = domainPart.replace(/\([^)]*\)\?/g, ""); // Remove optional groups
        domainPart = domainPart.replace(/\([^)]*\)/g, ""); // Remove other groups

        // Split by common separators and extract domain-like parts
        const parts = domainPart.split(/[/?#]/)[0]; // Take everything before path/query/fragment

        // Look for domain patterns (word.word or word.word.word)
        const domainRegex =
          /\b([a-zA-Z0-9-]+\.[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)?)\b/g;
        let match: RegExpExecArray | null;
        while (true) {
          match = domainRegex.exec(parts);
          if (match === null) break;
          const potentialDomain = match[1];
          // Basic validation - should have at least one dot and be reasonable length
          if (
            potentialDomain.length >= 4 &&
            potentialDomain.length <= 253 &&
            potentialDomain.includes(".")
          ) {
            domains.push(potentialDomain);
          }
        }
      } catch (error) {
        // If parsing fails, try fallback methods
        console.warn(
          "[ea-handleParseUserCSS] Failed to parse regexp pattern for domains:",
          pattern,
          error,
        );
      }

      return domains;
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
    const parseUserCSSUltraMinimal = (raw: string): ParseResult => {
      console.log("[ea-parseUserCSSMinimal] Function called");

      const warnings: string[] = [];
      const errors: string[] = [];
      let css: string = raw;
      let metadataBlock: string = "";
      const domains: DomainRule[] = [];

      // Basic metadata extraction
      const metadataMatch = raw.match(METADATA_BLOCK_REGEX);
      let metadataContent: string = "";
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
      const licenseMatch = metadataContent.match(/@license\s+([^\r\n]+)/);

      const name = nameMatch ? nameMatch[1].trim() : "";
      const namespace = namespaceMatch ? namespaceMatch[1].trim() : "";
      const version = versionMatch ? versionMatch[1].trim() : "";
      const description = descriptionMatch ? descriptionMatch[1].trim() : "";
      const author = authorMatch ? authorMatch[1].trim() : "";
      const license = licenseMatch ? licenseMatch[1].trim() : undefined;
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
            .map((d: string) => d.trim())
            .filter(Boolean),
        );
      }

      // Extract from match patterns
      const matchMatches = metadataContent.match(/@match\s+([^\r\n]+)/g);
      if (matchMatches) {
        matchMatches.forEach((match: string) => {
          const pattern = match.replace("@match", "").trim();
          // Very basic domain extraction from pattern
          if (pattern.includes("*://*.")) {
            const domain = pattern.split("*://*.")[1]?.split("/")[0];
            if (domain) domains.push(domain);
          }
        });
      }

      // Parse CSS content for @-moz-document rules
      const mozDocumentCssMatch = css.match(/@-moz-document\s+([^}]+)\s*\{/);
      if (mozDocumentCssMatch) {
        const mozDocumentRule = mozDocumentCssMatch[1];
        console.log(
          "[ea-parseUserCSSMinimal] Found mozDocumentRule:",
          mozDocumentRule,
        );

        // Extract domains from CSS @-moz-document rules
        const domainMatchesCss = mozDocumentRule.match(
          /domain\(["']?([^"')]+)["']?\)/g,
        );
        if (domainMatchesCss) {
          domainMatchesCss.forEach((match: string) => {
            const domainMatch = match.match(/domain\(["']?([^"')]+)["']?\)/);
            if (domainMatch) {
              domains.push(domainMatch[1]);
            }
          });
        }

        // Extract domains from regexp() rules
        const regexpMatches = mozDocumentRule.match(
          /regexp\(["']?([^"']+)["']?\)/g,
        );
        if (regexpMatches) {
          console.log(
            "[ea-parseUserCSSMinimal] Found regexpMatches:",
            regexpMatches,
          );
          regexpMatches.forEach((match: string) => {
            const regexpMatch = match.match(/regexp\(["']?([^"']+)["']?\)/);
            if (regexpMatch) {
              const pattern = regexpMatch[1];
              console.log(
                "[ea-parseUserCSSMinimal] Extracting from pattern:",
                pattern,
              );
              // Parse the regexp pattern to extract domain
              const extractedDomains = extractDomainsFromRegexp(pattern);
              console.log(
                "[ea-parseUserCSSMinimal] Extracted domains:",
                extractedDomains,
              );
              extractedDomains.forEach((domain: string) => {
                if (!domains.includes(domain)) {
                  domains.push(domain);
                }
              });
            }
          });
        }

        // Extract url-prefix patterns
        const urlPrefixMatches = mozDocumentRule.match(
          /url-prefix\\(["']?([^"')]+)["']?\\)/g,
        );
        if (urlPrefixMatches) {
          urlPrefixMatches.forEach((match: string) => {
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
        // Handles patterns like: bg-default	"Sky*"			<<<EOT https://i.imgur.com/P5VYGj4.jpeg EOT;
        const eotRegex = /([\w*-]+)\s+([^<]+?)\s*<<<EOT\s*([\s\S]*?)\s*EOT;/g;

        const options: string[] = [];
        const optionCss: Record<string, string> = {};
        let defaultValue = "";
        let hasDefault = false;

        let match: RegExpExecArray | null;
        while (true) {
          match = eotRegex.exec(value);
          if (match === null) break;
          const [, , rawLabel, cssContent] = match as RegExpExecArray;

          // Clean up the label - remove quotes and trim
          let displayLabel = rawLabel.trim();
          if (displayLabel.startsWith('"') && displayLabel.endsWith('"')) {
            displayLabel = displayLabel.slice(1, -1);
          }

          // Check if this is the default option (marked with * in display label like "Sky*")
          const isDefault = displayLabel.includes("*");
          const cleanDisplayLabel = displayLabel.replace(/\*$/, "");

          options.push(cleanDisplayLabel);
          // Preserve the CSS content for each option, with backslash escapes handled
          let cleanCss = cssContent.trim();
          // Handle escaped comment markers like /*[[bg-custom]]*\/
          cleanCss = cleanCss.replace(/\*\\\//g, "*/");
          optionCss[cleanDisplayLabel] = cleanCss;

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
      const variables: Record<string, VariableDescriptor> = {};

      // Enhanced regex to find variable directives in various formats
      // This handles formats like:
      // @var color name "label" default_value
      // @advanced dropdown name "label" { options }
      // @path/color name "label" default_value
      // @path/range name "label" [default, min, max, step, unit]
      // Using \s to match both spaces and tabs
      const directiveRegex =
        /@[\w/.:-]+\s+(range|color|text|select|number|dropdown|checkbox)\s+([\w-]+)\s+"([^"]+)"\s*([\s\S]*?)(?=\r?\n\s*@|\r?\n==\/UserStyle==|$)/g;
      let directiveMatch: RegExpExecArray | null;

      while (true) {
        directiveMatch = directiveRegex.exec(metadataContent);
        if (directiveMatch === null) break;
        const fullMatch = directiveMatch[0];
        const type = directiveMatch[1]; // "range", "color", "text", "select", "number", "dropdown"
        const name = directiveMatch[2]; // variable name
        const label = directiveMatch[3]; // variable label
        let defaultValue: string = directiveMatch[4] || ""; // default value or options

        // Clean up the default value (remove leading/trailing spaces)
        defaultValue = defaultValue.trim();

        // Map the regex-matched type to the enum
        let mappedType: VariableDescriptor["type"];
        switch (type) {
          case "color":
            mappedType = "color";
            break;
          case "range":
          case "number":
            mappedType = "number";
            break;
          case "text":
            mappedType = "text";
            break;
          case "select":
          case "dropdown":
            mappedType = "select";
            break;
          case "checkbox":
            mappedType = "checkbox";
            break;
          default:
            mappedType = "unknown";
        }

        let varDescriptor: VariableDescriptor = {
          name: name,
          type: mappedType,
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
              varDescriptor.min = parseFloat(rangeParts[1]);
              varDescriptor.max = parseFloat(rangeParts[2]);
            }
          }
        }

        // Handle checkbox type - default should be "0" or "1"
        if (type === "checkbox") {
          varDescriptor.type = "checkbox";
          varDescriptor.default = defaultValue === "1" ? "1" : "0";
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
            // Find the matching closing brace in the full match
            let braceCount = 1;
            let pos = braceStart + 1;

            while (pos < fullMatch.length && braceCount > 0) {
              if (fullMatch[pos] === "{") braceCount++;
              else if (fullMatch[pos] === "}") braceCount--;
              pos++;
            }

            if (braceCount === 0) {
              const optionsBlock = fullMatch
                .substring(braceStart + 1, pos - 1)
                .trim();

              // Use parseEOTBlocks equivalent logic for USO format
              const dropdownOptions = parseEOTBlocksMinimal(optionsBlock);
              if (dropdownOptions) {
                varDescriptor = {
                  ...varDescriptor,
                  type: "select",
                  options: dropdownOptions.options.map((opt) => ({
                    value: opt,
                    label: opt,
                  })),
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

      // Also handle @advanced directives that may not match the regex due to complex formatting
      // Look for @advanced lines that weren't captured
      // Updated regex to handle tabs and multi-line braces blocks better
      const advancedRegex =
        /@advanced\s+(dropdown|color|text|select|checkbox|number|range)\s+([\w-]+)\s+"([^"]+)"?\s*\{([\s\S]*?)\n\}/gm;
      let advancedMatch: RegExpExecArray | null;

      console.log(
        "[ea-parseUserCSSMinimal] Starting variable extraction from @advanced directives",
      );

      while (true) {
        advancedMatch = advancedRegex.exec(metadataContent);
        if (advancedMatch === null) break;

        const type = advancedMatch[1];
        const name = advancedMatch[2];
        const label = advancedMatch[3];
        const optionsBlock = advancedMatch[4];

        console.log(
          `[ea-parseUserCSSMinimal] Found @advanced: name=${name}, type=${type}, label=${label}`,
        );
        console.log(
          `[ea-parseUserCSSMinimal] Options block length: ${optionsBlock.length} chars`,
        );

        // Skip if already captured by directiveRegex
        if (!variables[name]) {
          let mappedType: VariableDescriptor["type"];
          switch (type) {
            case "color":
              mappedType = "color";
              break;
            case "text":
              mappedType = "text";
              break;
            case "dropdown":
            case "select":
              mappedType = "select";
              break;
            case "checkbox":
              mappedType = "checkbox";
              break;
            case "number":
            case "range":
              mappedType = "number";
              break;
            default:
              mappedType = "unknown";
          }

          if (type === "dropdown" || type === "select") {
            const dropdownOptions = parseEOTBlocksMinimal(optionsBlock);
            if (dropdownOptions) {
              console.log(
                `[ea-parseUserCSSMinimal] Successfully parsed ${dropdownOptions.options.length} options for ${name}`,
              );
              variables[name] = {
                name,
                type: mappedType,
                label,
                default: dropdownOptions.defaultValue,
                value: dropdownOptions.defaultValue,
                options: dropdownOptions.options.map((opt) => ({
                  value: opt,
                  label: opt,
                })),
                optionCss: dropdownOptions.optionCss,
              };
            } else {
              console.log(
                `[ea-parseUserCSSMinimal] Failed to parse dropdown options for ${name}`,
              );
              variables[name] = {
                name,
                type: mappedType,
                label,
                default: "",
                value: "",
              };
            }
          } else {
            // For non-dropdown types with braces (though unusual), just store basic descriptor
            variables[name] = {
              name,
              type: mappedType,
              label,
              default: "",
              value: "",
            };
          }
        } else {
          console.log(
            `[ea-parseUserCSSMinimal] Variable ${name} already exists, skipping`,
          );
        }
      }

      // Handle simple @advanced directives without braces (e.g., @advanced color name "label" #value)
      const simpleAdvancedRegex =
        /@advanced\s+(color|text|checkbox)\s+([\w-]+)\s+"([^"]+)"?\s+([^\r\n{]+)/g;
      let simpleMatch: RegExpExecArray | null;

      while (true) {
        simpleMatch = simpleAdvancedRegex.exec(metadataContent);
        if (simpleMatch === null) break;

        const type = simpleMatch[1];
        const name = simpleMatch[2];
        const label = simpleMatch[3];
        const defaultValue = simpleMatch[4].trim();

        // Skip if already parsed
        if (variables[name]) continue;

        console.log(
          `[ea-parseUserCSSMinimal] Found simple @advanced: name=${name}, type=${type}, default=${defaultValue}`,
        );

        let mappedType: VariableDescriptor["type"];
        switch (type) {
          case "color":
            mappedType = "color";
            break;
          case "text":
            mappedType = "text";
            break;
          case "checkbox":
            mappedType = "checkbox";
            break;
          default:
            mappedType = "unknown";
        }

        variables[name] = {
          name,
          type: mappedType,
          label,
          default: defaultValue,
          value: defaultValue,
        };
      }

      console.log(
        `[ea-parseUserCSSMinimal] Total variables extracted: ${Object.keys(variables).length}`,
      );

      const homepageURL = homepageURLMatch
        ? homepageURLMatch[1].trim()
        : undefined;
      const supportURL = supportURLMatch
        ? supportURLMatch[1].trim()
        : undefined;

      const meta = {
        id: name && namespace ? generateId(name, namespace) : "",
        name,
        namespace,
        version,
        description,
        author,
        license,
        sourceUrl,
        homepageURL,
        supportURL,
        domains,
        variables,
        compiledCss: "",
      };

      return {
        meta,
        css,
        metadataBlock,
        warnings,
        errors,
      };
    };

    // Check if DOM is available for preprocessing
    const hasDom = typeof globalThis.document !== "undefined";

    let parseResult: ParseResult;

    // Always try the main processor first for better parsing
    console.log("[ea-handleParseUserCSS] Trying main processor...");

    try {
      const { parseUserCSS } = await import("../usercss/processor");
      parseResult = parseUserCSS(text);
      console.log("[ea-handleParseUserCSS] Main processor parsing successful");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[ea-handleParseUserCSS] Main processor failed:", err);
      console.error(
        "[ea-handleParseUserCSS] Error stack:",
        err.stack ?? "<no stack>",
      );
      console.error(
        "[ea-handleParseUserCSS] Error message:",
        err.message ?? "<no message>",
      );
      // Fallback to simplified parser
      console.log(
        "[ea-handleParseUserCSS] Falling back to simplified parser...",
      );
      parseResult = parseUserCSSUltraMinimal(text);
    }
    console.log("[ea-handleParseUserCSS] Parser result:", parseResult);

    // Preprocess CSS if DOM is available and we used the main parser

    let preprocessorErrors: string[] = [];

    console.log("[ea-handleParseUserCSS] About to check DOM preprocessing...");
    try {
      if (hasDom) {
        // Only preprocess if DOM is available (and we used main parser)
        const { processUserCSS } = await import("../usercss/processor");
        const fullResult = await processUserCSS(text);
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
      css: text, // Return the original input text, not compiled CSS
      metadataBlock: parseResult.metadataBlock,
      variables: parseResult.meta.variables || {}, // Include variables from ultra-minimal parser
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
    "[ea-handleInstallStyle] Handler called with message:",
    message?.type,
  );
  console.log(
    "[ea-handleInstallStyle] Message has payload:",
    "payload" in (message || {}),
  );

  const installMessage = message as Extract<
    ReceivedMessages,
    { type: "INSTALL_STYLE" }
  >;
  console.log("[ea-handleInstallStyle] Type casting completed");
  console.log("Install style requested:", installMessage.payload);

  try {
    console.log("[ea-handleInstallStyle] Starting installation process...");
    const { meta, compiledCss, variables, source } = installMessage.payload;
    console.log("[ea-handleInstallStyle] Payload extracted successfully");
    console.log(
      "[ea-handleInstallStyle] Has source:",
      !!source,
      "source length:",
      source?.length || 0,
    );

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
    console.log("[ea-handleInstallStyle] Using direct storage access...");
    // Use the already imported storageClient instead of importing wxt/storage directly
    console.log("[ea-handleInstallStyle] Storage client ready");

    // Parse domains from CSS content if not found in metadata
    console.log("[ea-handleInstallStyle] About to process domains...");
    const allDomains = [...meta.domains];
    console.log(
      "[ea-handleInstallStyle] Initial domains processed:",
      allDomains.length,
    );

    // Extract original @-moz-document condition for display
    let originalDomainCondition: string | undefined;
    const mozDocumentCssMatch = compiledCss.match(
      /@-moz-document\s+([^}]+)\s*\{/,
    );
    if (mozDocumentCssMatch) {
      originalDomainCondition = mozDocumentCssMatch[1].trim();
      console.log(
        "[ea-handleInstallStyle] Found @-moz-document rule in CSS:",
        originalDomainCondition,
      );

      // Extract domains from CSS @-moz-document rules
      const domainMatches = originalDomainCondition.match(
        /domain\(["']?([^"')]+)["']?\)/g,
      );
      if (domainMatches) {
        domainMatches.forEach((match: string) => {
          const domainMatch = match.match(/domain\(["']?([^"')]+)["']?\)/);
          if (domainMatch && !allDomains.includes(domainMatch[1])) {
            allDomains.push(domainMatch[1]);
            console.log(
              "[ea-handleInstallStyle] Extracted domain from CSS:",
              domainMatch[1],
            );
          }
        });
      }

      // Extract url-prefix patterns from CSS @-moz-document rules
      const urlPrefixMatches = originalDomainCondition.match(
        /url-prefix\(["']?([^"')]+)["']?\)/g,
      );
      if (urlPrefixMatches) {
        urlPrefixMatches.forEach((match: string) => {
          const urlMatch = match.match(/url-prefix\(["']?([^"')]+)["']?\)/);
          if (urlMatch) {
            try {
              const url = new URL(urlMatch[1]);
              const domain = url.hostname;
              if (!allDomains.includes(domain)) {
                allDomains.push(domain);
                console.log(
                  "[ea-handleInstallStyle] Extracted domain from url-prefix:",
                  domain,
                );
              }
            } catch {
              // Invalid URL, skip
            }
          }
        });
      }
    }

    // Normalize domain pattern (inline to avoid window access)
    console.log("[ea-handleInstallStyle] About to normalize domain rules...");
    const normalizePattern = (domain: string): string => {
      // Simple normalization without URL constructor
      return domain.toLowerCase().trim();
    };

    // Normalize existing domain rules
    const normalizedDomainRules: DomainRule[] = allDomainRules.map((rule) => ({
      ...rule,
      pattern: normalizePattern(rule.pattern),
    }));
    console.log(
      "[ea-handleInstallStyle] Domain rules normalized:",
      normalizedDomainRules.length,
    );

    // Simple domain extraction from CSS content (inline to avoid window access)
    const extractDomains = (css: string): DomainRule[] => {
      const rules: DomainRule[] = [];

      // Find all @-moz-document blocks
      const mozDocumentRegex = /@-moz-document\s+([^{\n\r]+?)\s*\{/g;
      let match: RegExpExecArray | null;

      while (true) {
        match = mozDocumentRegex.exec(css);
        if (match === null) break;
        const conditionList = match[1];

        // Extract domain patterns
        const domainMatches = conditionList.match(
          /domain\(["']?([^"')]+)["']?\)/g,
        );
        if (domainMatches) {
          domainMatches.forEach((match: string) => {
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
          urlPrefixMatches.forEach((match: string) => {
            const urlMatch = match.match(/url-prefix\(["']?([^"')]+)["']?\)/);
            if (urlMatch) {
              // Extract domain from URL prefix (simple approach)
              const url = urlMatch[1];
              if (url.startsWith("https://")) {
                const domain = url.substring(8).split("/")[0];
                if (domain) {
                  rules.push({
                    kind: "url-prefix",
                    pattern: `https://${domain}/`,
                    include: true,
                  });
                }
              }
            }
          });
        }

        // Extract regexp patterns
        const regexpMatches = conditionList.match(
          /regexp\(["']?([^"')]+)["']?\)/g,
        );
        if (regexpMatches) {
          regexpMatches.forEach((match: string) => {
            const regexpMatch = match.match(/regexp\(["']?([^"')]+)["']?\)/);
            if (regexpMatch) {
              rules.push({
                kind: "regexp",
                pattern: regexpMatch[1],
                include: true,
              });
            }
          });
        }
      }

      return rules;
    };

    const extractedRules = extractDomains(compiledCss);
    if (extractedRules.length > 0) {
      console.log(
        "[ea-handleInstallStyle] Extracted domain rules from CSS:",
        extractedRules,
      );
      // Merge with existing rules, avoiding duplicates
      for (const rule of extractedRules) {
        const exists = normalizedDomainRules.some(
          (existing: DomainRule) =>
            existing.kind === rule.kind && existing.pattern === rule.pattern,
        );
        if (!exists) {
          normalizedDomainRules.push(rule);
        }
      }
    }

    console.log(
      "[ea-handleInstallStyle] Final domain rules:",
      normalizedDomainRules,
    );
    console.log(
      "[ea-handleInstallStyle] Total domain count:",
      normalizedDomainRules.length,
    );

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
          case "checkbox":
            mappedType = "checkbox";
            break;
          default:
            mappedType = "unknown";
        }

        const varDescriptor: import("../usercss/types").VariableDescriptor = {
          name: variable.name,
          type: mappedType,
          default: variable.default,
          value: variable.default, // Start with default value
          min: variable.min,
          max: variable.max,
          options: variable.options,
        };
        // Add optionCss if it exists (for USO dropdown variables)
        if ("optionCss" in variable && variable.optionCss) {
          varDescriptor.optionCss = variable.optionCss as Record<
            string,
            string
          >;
        }
        variablesRecord[variable.name] = varDescriptor;
      });
    }

    // Apply default variable values to compiled CSS
    const processedCompiledCss = compiledCss;

    // Create the style object for storage
    const styleData = {
      name: meta.name,
      namespace: meta.namespace || "",
      version: meta.version || "1.0.0",
      description: meta.description || "",
      author: meta.author || "",
      sourceUrl: meta.sourceUrl || "",
      domains: normalizedDomainRules,
      originalDomainCondition,
      compiledCss: processedCompiledCss,
      variables: variablesRecord,
      originalDefaults: {},
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: source || "", // Original source code for preprocessor detection
      updatedAt: Date.now(),
    };

    // Add the style to storage using inline operations
    console.log("[ea-handleInstallStyle] About to save style to storage...");
    const savedStyle = await storageClient.addUserCSSStyle(styleData);
    console.log(
      "[ea-handleInstallStyle] Style saved successfully:",
      savedStyle.id,
    );

    console.log("Style installed successfully:", savedStyle.id, savedStyle);
    console.log("Style domains:", savedStyle.domains);

    // Notify all content scripts to apply the new style
    console.log(
      "[ea-handleInstallStyle] Notifying content scripts about new style",
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
                    `[ea-handleInstallStyle] Unexpected error notifying tab ${tab.id}:`,
                    error,
                  );
                }
              });
          }
        });
      });
    } catch (error) {
      console.warn(
        "[ea-handleInstallStyle] Error notifying content scripts:",
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
    console.error(
      "[ea-handleInstallStyle] Failed to install style:",
      errorMessage,
    );
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

    // Determine font type and validate availability
    const builtInFonts = fontRegistry.getBuiltInFonts();
    const fontExists = builtInFonts.some((font) => font.name === fontName);
    const fontType: "builtin" | "custom" = fontExists ? "builtin" : "custom";

    let font: BuiltInFont | undefined;
    let absoluteFontPath: string | null = null;

    if (fontType === "builtin") {
      // Get font data for built-in fonts
      font = builtInFonts.find((f) => f.name === fontName);
      if (!font) {
        throw new Error(`Font "${fontName}" not found`);
      }

      // Generate font path for built-in fonts
      const fontPath = `/fonts/${font.file}`;
      absoluteFontPath = browser?.runtime?.getURL
        ? browser.runtime.getURL(fontPath as PublicPath)
        : fontPath;
    }

    const fontFaceRule =
      fontType === "builtin"
        ? `
  @font-face {
    font-family: '${fontName}';
    src: url('${absoluteFontPath}') format('woff2');
    font-weight: ${(font as BuiltInFont).weight};
    font-style: ${(font as BuiltInFont).style};
    font-display: swap;
  }`
        : "";

    const fontFamilyRule = `
   * {
     font-family: '${fontName}', sans-serif !important;
   }`;

    const name = `[FONT] ${fontName}`;
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
      assets:
        fontType === "builtin"
          ? absoluteFontPath
            ? [
                {
                  name: (font as BuiltInFont).file,
                  url: absoluteFontPath,
                  type: "font" as const,
                  mimeType: "font/woff2",
                },
              ]
            : []
          : [],
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
      "[ea-handleInstallStyle] Failed to install style:",
      errorMessage,
    );
    console.error("[ea-handleInstallStyle] Error details:", error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handle updating a font style
 */
const handleUpdateFontStyle: MessageHandler = async (message) => {
  try {
    const { styleId, domain, fontName } = (
      message as unknown as {
        payload: { styleId: string; domain?: string; fontName: string };
      }
    ).payload;

    console.log(
      "[handleUpdateFontStyle] Updating font style:",
      styleId,
      "with font:",
      fontName,
      "for domain:",
      domain,
    );

    // Validate inputs
    if (
      !styleId ||
      typeof styleId !== "string" ||
      styleId.trim().length === 0
    ) {
      throw new Error("Style ID is required");
    }

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

    // Determine font type and validate availability
    const builtInFonts = fontRegistry.getBuiltInFonts();
    const fontExists = builtInFonts.some((font) => font.name === fontName);
    const fontType: "builtin" | "custom" = fontExists ? "builtin" : "custom";

    let font: BuiltInFont | undefined;
    let absoluteFontPath: string | null = null;

    if (fontType === "builtin") {
      // Get font data for built-in fonts
      font = builtInFonts.find((f) => f.name === fontName);
      if (!font) {
        throw new Error(`Font "${fontName}" not found`);
      }

      // Generate font path for built-in fonts
      const fontPath = `/fonts/${font.file}`;
      absoluteFontPath = browser?.runtime?.getURL
        ? browser.runtime.getURL(fontPath as PublicPath)
        : fontPath;
    } else {
      // For custom fonts, we assume availability was checked in the UI
      // The content script will handle fallback if the font is not available
    }

    console.log(
      "[handleUpdateFontStyle] Updating font style:",
      styleId,
      "with font:",
      fontName,
      "for domain:",
      domain,
    );

    // Validate inputs
    if (
      !styleId ||
      typeof styleId !== "string" ||
      styleId.trim().length === 0
    ) {
      throw new Error("Style ID is required");
    }

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

    // Get existing style to preserve other properties
    const existingStyle = await storageClient.getUserCSSStyle(styleId);
    if (!existingStyle) {
      throw new Error(`Style with ID "${styleId}" not found`);
    }

    // Verify this is actually a font style before updating
    if (!existingStyle.name.startsWith("[FONT] ")) {
      throw new Error(
        `Style "${styleId}" is not a font style (name: "${existingStyle.name}")`,
      );
    }

    // Log total styles count before update to ensure no duplicates are created
    const allStylesBefore = await storageClient.getUserCSSStyles();
    console.log(
      `[handleUpdateFontStyle] Total styles before update: ${allStylesBefore.length}`,
    );

    const fontFaceRule =
      fontType === "builtin"
        ? `
  @font-face {
    font-family: '${fontName}';
    src: url('${absoluteFontPath}') format('woff2');
    font-weight: ${(font as BuiltInFont).weight};
    font-style: ${(font as BuiltInFont).style};
    font-display: swap;
  }`
        : "";

    const fontFamilyRule = `
   * {
     font-family: '${fontName}', sans-serif !important;
   }`;

    const name = `[FONT] ${fontName}`;
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

    // Update the existing style with new font information
    const updates = {
      name,
      description: `Apply ${fontName} font to ${domain || "all sites"}`,
      domains: domainRules,
      originalDomainCondition: domain
        ? `domain("${normalizePattern(domain)}")`
        : undefined,
      compiledCss: `${fontFaceRule}\n${fontFamilyRule}`.trim(),
      assets:
        fontType === "builtin"
          ? absoluteFontPath
            ? [
                {
                  name: (font as BuiltInFont).file,
                  url: absoluteFontPath,
                  type: "font" as const,
                  mimeType: "font/woff2",
                },
              ]
            : []
          : [],
      source: userCSS,
      updatedAt: Date.now(),
    };

    const updatedStyle = await storageClient.updateUserCSSStyle(
      styleId,
      updates,
    );

    // Verify no new styles were created
    const allStylesAfter = await storageClient.getUserCSSStyles();
    console.log(
      `[handleUpdateFontStyle] Total styles after update: ${allStylesAfter.length}`,
    );

    if (allStylesAfter.length !== allStylesBefore.length) {
      console.error(
        `[ea-handleUpdateFontStyle] ERROR: Style count changed from ${allStylesBefore.length} to ${allStylesAfter.length} - possible duplicate created!`,
      );
      throw new Error(
        `Style update created duplicate: count changed from ${allStylesBefore.length} to ${allStylesAfter.length}`,
      );
    }

    if (updatedStyle.id !== styleId) {
      console.error(
        `[ea-handleUpdateFontStyle] ERROR: Updated style ID changed from ${styleId} to ${updatedStyle.id}`,
      );
      throw new Error(
        `Style update changed ID from ${styleId} to ${updatedStyle.id}`,
      );
    }

    console.log(
      "[handleUpdateFontStyle] Font style updated successfully:",
      styleId,
    );

    // Notify all content scripts to update the font style
    try {
      browser.tabs.query({}).then((tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            browser.tabs
              .sendMessage(tab.id, {
                type: "styleUpdate",
                styleId,
                style: updatedStyle,
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
                    `[handleUpdateFontStyle] Unexpected error notifying tab ${tab.id}:`,
                    error,
                  );
                }
              });
          }
        });
      });
    } catch (error) {
      console.warn(
        "[handleUpdateFontStyle] Error notifying content scripts:",
        error,
      );
    }

    return {
      success: true,
      styleId,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      "[handleUpdateFontStyle] Failed to update font style:",
      errorMessage,
    );
    console.error("[handleUpdateFontStyle] Error details:", error);
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

    console.log("[ea-handleInjectFont] Injecting font:", fontName);

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
      console.log("[ea-handleInjectFont] Successfully sent to content script");
    } catch (contentScriptError) {
      // Content script not available, inject directly using executeScript
      console.log(
        "[ea-handleInjectFont] Content script not available, injecting directly",
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

        console.log(
          "[ea-handleInjectFont] Successfully injected font directly",
        );
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
    console.error("[ea-handleInjectFont] Failed to inject font:", errorMessage);
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

    // Get style name for better logging
    const style = await storageClient.getUserCSSStyle(styleId);
    const styleName = style?.name || "Unknown";

    console.log("[ea-handleUpdateVariables] Received variable update:", {
      styleName,
      styleId,
      variables,
      timestamp: new Date().toISOString(),
    });

    console.log(
      "[ea-handleUpdateVariables] Updating variables via storageClient",
    );

    const updatedStyle = await storageClient.updateUserCSSStyleVariables(
      styleId,
      variables,
    );

    console.log("[ea-handleUpdateVariables] Variables updated successfully:", {
      styleName,
      styleId,
      variables,
    });

    // Notify other extension contexts about the variable change
    try {
      await broadcastService.broadcastVariableUpdate({
        styleId,
        variables,
      });
    } catch (notifyError) {
      console.warn(
        "[ea-handleUpdateVariables] Failed to broadcast VARIABLES_UPDATED notification:",
        notifyError,
      );
    }

    // Notify content scripts to reapply the style with new variables
    console.log(
      "[ea-handleUpdateVariables] Notifying content scripts about variable change",
    );
    try {
      const tabs = await browser.tabs.query({});
      console.log(
        `[ea-handleUpdateVariables] Found ${tabs.length} tabs to notify`,
      );

      for (const tab of tabs) {
        if (tab.id) {
          browser.tabs
            .sendMessage(tab.id, {
              type: "styleUpdate",
              styleId,
              style: updatedStyle, // Send the UPDATED style, not the old one
            })
            .catch((error) => {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              // Only log unexpected errors
              if (
                !errorMessage.includes("Could not establish connection") &&
                !errorMessage.includes("Receiving end does not exist")
              ) {
                console.warn(
                  `[ea-handleUpdateVariables] Error notifying tab ${tab.id}:`,
                  error,
                );
              }
            });
        }
      }
    } catch (broadcastError) {
      console.warn(
        "[ea-handleUpdateVariables] Error broadcasting to tabs:",
        broadcastError,
      );
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[ea-handleUpdateVariables] Failed to update variables:", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
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
      "[ea-handleQueryStylesForUrl] Handler called with message:",
      message,
    );
    const { url } = (message as { payload: { url: string } }).payload;

    console.log("[ea-handleQueryStylesForUrl] Processing URL:", url);

    // Get all UserCSS styles using storage client
    console.log("[ea-handleQueryStylesForUrl] About to get UserCSS styles");
    const userCSSStyles = await storageClient.getUserCSSStyles();
    console.log(
      "[ea-handleQueryStylesForUrl] Retrieved styles:",
      userCSSStyles.length,
    );

    // Simple inline domain extraction without URL constructor
    const extractDomain = (url: string): string => {
      try {
        // Simple regex-based domain extraction
        const match = url.match(/^https?:\/\/([^/?#]+)/i);
        return match ? match[1].toLowerCase() : url.toLowerCase();
      } catch (error) {
        console.log(
          "[ea-handleQueryStylesForUrl] Error in extractDomain:",
          error,
        );
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
              const arkRegex = regex.as<string>(rulePattern);
              return arkRegex.test(url);
            } catch (error) {
              console.log(
                "[ea-handleQueryStylesForUrl] Invalid regex pattern:",
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
          "[ea-handleQueryStylesForUrl] Error in matchesDomainRule:",
          error,
        );
        return false;
      }
    };

    // Filter styles that match the URL using inline domain detection
    console.log("[ea-handleQueryStylesForUrl] About to filter styles");
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
          "[ea-handleQueryStylesForUrl] Error filtering style:",
          style.id,
          error,
        );
        // If there's an error in matching, exclude the style
        return false;
      }
    });

    console.log(
      "[ea-handleQueryStylesForUrl] Found matching styles:",
      matchingStyles.length,
    );

    return {
      success: true,
      styles: matchingStyles,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[ea-handleQueryStylesForUrl] Error:", errorMessage);
    console.error("[ea-handleQueryStylesForUrl] Error stack:", error);
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
  console.log("[ea-handleFetchAssets] Processing message:", message);
  try {
    const { assets } = (
      message as {
        payload: {
          assets: Array<{ url: string; type: "image" | "font" | "other" }>;
        };
      }
    ).payload;
    console.log(`[ea-handleFetchAssets] Fetching ${assets.length} assets`);

    // Import asset processor with error handling
    let fetchAssetAsDataUrl;
    try {
      const assetProcessor = await import("../usercss/asset-processor");
      fetchAssetAsDataUrl = assetProcessor.fetchAssetAsDataUrl;
    } catch (importError) {
      console.error(
        "[ea-handleFetchAssets] Failed to import asset-processor:",
        importError,
      );
      // Return failed assets if import fails
      return {
        success: false,
        error: `Failed to import asset processor: ${importError instanceof Error ? importError.message : "Unknown error"}`,
      };
    }

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
      `[ea-handleFetchAssets] Successfully processed ${results.filter((r) => r.dataUrl).length}/${assets.length} assets`,
    );

    return {
      success: true,
      assets: results,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[ea-handleFetchAssets] Error:", errorMessage);
    console.error(
      "[ea-handleFetchAssets] Error stack:",
      error instanceof Error ? error.stack : "No stack",
    );
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handler for GET_STYLE_FOR_EDIT messages.
 */
const handleGetStyleForEdit: MessageHandler = async (message) => {
  console.log("[ea-handleGetStyleForEdit] Processing message:", message);
  try {
    const editMessage = message as Extract<
      ReceivedMessages,
      { type: "GET_STYLE_FOR_EDIT" }
    >;
    const { styleId } = editMessage.payload;

    console.log("[ea-handleGetStyleForEdit] Getting style for edit:", styleId);

    // Get the style from storage
    const style = await storageClient.getUserCSSStyle(styleId);

    if (!style) {
      console.log("[ea-handleGetStyleForEdit] Style not found:", styleId);
      return {
        success: false,
        error: `Style with ID '${styleId}' not found`,
      };
    }

    console.log(
      "[ea-handleGetStyleForEdit] Style retrieved successfully, source length:",
      style.source?.length || 0,
    );

    // Source is required for editing - cannot edit without the original UserCSS text
    if (!style.source) {
      console.error(
        "[ea-handleGetStyleForEdit] Source is empty, cannot edit style without source",
      );
      return {
        success: false,
        error:
          "Style source is missing - this style was corrupted and cannot be edited",
      };
    }
    const cssContent = style.source;

    return {
      success: true,
      style: {
        id: style.id,
        name: style.name,
        css: cssContent,
        meta: {
          name: style.name,
          namespace: style.namespace,
          version: style.version,
          description: style.description,
          author: style.author,
          sourceUrl: style.sourceUrl,
          domains: style.domains.map((d) => d.pattern), // Convert DomainRule[] to string[]
          variables: style.variables,
        },
        variables: style.variables,
      },
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[ea-handleGetStyleForEdit] Error:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Handler for UPDATE_STYLE messages.
 */
const handleUpdateStyle: MessageHandler = async (message) => {
  console.log("[ea-handleUpdateStyle] Processing message:", message);
  try {
    const updateMessage = message as Extract<
      ReceivedMessages,
      { type: "UPDATE_STYLE" }
    >;
    const { styleId, name, css, meta, variables } = updateMessage.payload;

    console.log("[ea-handleUpdateStyle] Updating style:", styleId);

    // Get the existing style
    const existingStyle = await storageClient.getUserCSSStyle(styleId);
    if (!existingStyle) {
      return {
        success: false,
        error: `Style with ID '${styleId}' not found`,
      };
    }

    // Map the payload to UserCSSStyle format
    const updates: Partial<UserCSSStyle> = {
      name,
      source: css, // css field contains the source code
      namespace: meta.namespace,
      version: meta.version,
      description: meta.description,
      author: meta.author,
      sourceUrl: meta.sourceUrl,
      domains: meta.domains.map((domain) => ({
        kind: "domain" as const,
        pattern: domain,
        include: true,
      })), // Convert string[] to DomainRule[]
      variables: variables
        ? Object.fromEntries(
            variables.map((v) => [
              v.name,
              {
                name: v.name,
                type: v.type,
                default: v.default,
                value: existingStyle.variables?.[v.name]?.value || v.default, // Preserve current value or use default
                min: v.min,
                max: v.max,
                options: v.options,
                optionCss: v.optionCss,
              } as VariableDescriptor,
            ]),
          )
        : existingStyle.variables,
    };

    // Update the style
    await storageClient.updateUserCSSStyle(styleId, updates);

    console.log("[ea-handleUpdateStyle] Style updated successfully");

    return {
      success: true,
      styleId,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[ea-handleUpdateStyle] Error:", errorMessage);
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
  UPDATE_FONT_STYLE: withErrorHandling(handleUpdateFontStyle),
  UPDATE_VARIABLES: withErrorHandling(handleUpdateVariables),
  QUERY_STYLES_FOR_URL: withErrorHandling(handleQueryStylesForUrl), // Full version with inline domain matching
  FETCH_ASSETS: withErrorHandling(handleFetchAssets),
  PARSE_USERCSS: withErrorHandling(handleParseUserCSS), // Restored - confirmed not the source of window error
  GET_STYLE_FOR_EDIT: withErrorHandling(handleGetStyleForEdit),
  UPDATE_STYLE: withErrorHandling(handleUpdateStyle),
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
    Object.entries(handlers).forEach(
      ([messageType, handler]: [string, MessageHandler | undefined]) => {
        if (handler) {
          this.handlers[messageType as ReceivedMessages["type"]] = handler;
        }
      },
    );
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
    console.log("[ea-MessageHandlerService] Handling message:", message.type);
    // Ensure service is initialized
    if (!this.isInitialized) {
      console.log("[ea-MessageHandlerService] Initializing service");
      this.initialize();
    }

    const handler = this.handlers[message.type];
    console.log(
      "[ea-MessageHandlerService] Found handler for",
      message.type,
      ":",
      !!handler,
    );

    if (!handler) {
      console.error(
        "[ea-MessageHandlerService] No handler registered for message type:",
        message.type,
      );
      throw new Error(
        `No handler registered for message type: ${message.type}`,
      );
    }

    console.log("[ea-MessageHandlerService] Calling handler for", message.type);
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
      "GET_STYLE_FOR_EDIT",
      "UPDATE_STYLE",
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
    console.warn("[ea-findManagerTab] Error querying tabs:", error);
    return null;
  }
}

/**
 * Initialize tab close listener to clear tracking when manager tab is closed
 */
function initializeTabCloseListener(): void {
  if (browser?.tabs) {
    browser.tabs.onRemoved.addListener((tabId) => {
      if (tabId === activeManagerTabId) {
        console.log("[ea-TabTracker] Manager tab closed, clearing tracking");
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
