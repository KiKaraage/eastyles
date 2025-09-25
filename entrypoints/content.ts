import { contentController } from "../services/usercss/content-controller";
import { logger } from "../services/errors/logger";
import { ErrorSource } from "../services/errors/service";
import { UserCSSStyle } from "../services/storage/schema";
import { storageClient } from "../services/storage/client";

// Types for content script messages
type ContentScriptMessage =
  | {
      type: "styleUpdate";
      styleId: string;
      style: UserCSSStyle;
    }
  | {
      type: "styleRemove";
      styleId: string;
    }
  | {
      type: "injectFont";
      fontName: string;
      css: string;
    }
  | {
      type: "VARIABLES_UPDATED";
      payload: {
        styleId: string;
        variables: Record<string, string>;
        timestamp: number;
      };
    }
  | {
      type: "STYLE_REAPPLY_REQUEST";
      payload: {
        styleId: string;
        reason: string;
        timestamp: number;
      };
    };

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log(
      "[ContentScript] UserCSS content script initializing on:",
      window.location.href,
    );

    try {
      // Check if this is a .user.css file and redirect to Save page
      if (isUserCSSFile()) {
        redirectToSavePage();
        return; // Don't initialize content controller for .user.css files
      }

      // Initialize the content controller
      contentController
        .initialize()
        .then(() => {
          console.log("UserCSS content controller initialized successfully");
        })
        .catch((error) => {
          logger.error?.(
            ErrorSource.CONTENT,
            "Failed to initialize UserCSS content controller",
            { error: error instanceof Error ? error.message : String(error) },
          );
        });

      // Set up message listener for style updates and variable changes
      browser.runtime.onMessage.addListener((message: ContentScriptMessage) => {
        console.log("[ContentScript] Received message:", message.type, message);
        try {
          if (
            message.type === "styleUpdate" &&
            message.styleId &&
            message.style
          ) {
            console.log(
              "[ContentScript] Processing styleUpdate for:",
              message.styleId,
            );
            contentController.onStyleUpdate(message.styleId, message.style);
          } else if (message.type === "styleRemove" && message.styleId) {
            console.log(
              "[ContentScript] Processing styleRemove for:",
              message.styleId,
            );
            contentController.onStyleRemove(message.styleId);
          } else if (
            message.type === "injectFont" &&
            message.fontName &&
            message.css
          ) {
            console.log(
              "[ContentScript] Processing injectFont for:",
              message.fontName,
            );
            injectFontDirectly(message.fontName, message.css);
          } else if (message.type === "VARIABLES_UPDATED" && message.payload) {
            const { styleId, variables } = message.payload;
            contentController.onVariablesUpdate(styleId, variables);
          } else if (
            message.type === "STYLE_REAPPLY_REQUEST" &&
            message.payload
          ) {
            const { styleId } = message.payload;
            // Fetch updated style and reapply
            storageClient
              .getUserCSSStyle(styleId)
              .then((updatedStyle) => {
                if (updatedStyle) {
                  console.log(
                    "[ContentScript] Reapplying updated style:",
                    styleId,
                  );
                  contentController.onStyleUpdate(styleId, updatedStyle);
                }
              })
              .catch((error) =>
                console.error(
                  "[ContentScript] Failed to reapply style:",
                  error,
                ),
              );
          } else {
            console.log(
              "[ContentScript] Ignoring unknown message type:",
              message.type,
            );
          }
        } catch (error) {
          console.error("[ContentScript] Failed to handle message:", error);
          logger.error?.(ErrorSource.CONTENT, "Failed to handle message", {
            error: error instanceof Error ? error.message : String(error),
            messageType: message.type,
          });
        }
      });
    } catch (error) {
      logger.error?.(
        ErrorSource.CONTENT,
        "Failed to initialize UserCSS content script",
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  },
});

/**
 * Check if the current page is a .user.css file
 */
function isUserCSSFile(): boolean {
  // Guard against running in non-browser context
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const url = window.location.href;
  const contentType = document.contentType || "";

  // Check URL ends with .user.css
  if (url.endsWith(".user.css")) {
    return true;
  }

  // Check if content type indicates CSS
  if (contentType.includes("text/css") || contentType.includes("text/plain")) {
    // Additional check: look for UserCSS metadata in the page content
    const bodyText = document.body?.textContent || "";
    if (bodyText.includes("==UserStyle==") || bodyText.includes("@name")) {
      return true;
    }
  }

  return false;
}

/**
 * Redirect to the Save page with the UserCSS content
 */
function redirectToSavePage(): void {
  console.log("Detected UserCSS file, redirecting to Save page");

  try {
    // Guard against running in non-browser context
    if (typeof window === "undefined" || typeof document === "undefined") {
      console.warn("Browser APIs not available in content script");
      return;
    }

    const url = window.location.href;
    const cssContent = document.body?.textContent || "";

    if (cssContent.trim()) {
      // Use browser storage instead of sessionStorage (works across extension contexts)
      const storageId = `usercss_external_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store in browser local storage (shared across extension)
      browser.storage.local
        .set({
          [storageId]: {
            content: cssContent,
            sourceUrl: url,
            timestamp: Date.now(),
          },
        })
        .then(() => {
          // Redirect with storage ID
          const saveURL = browser.runtime.getURL("/save.html");
          const filename = url.split("/").pop() || "external.user.css";
          const finalUrl = `${saveURL}?storageId=${storageId}&filename=${encodeURIComponent(filename)}&sourceUrl=${encodeURIComponent(url)}&source=external&storage=local`;

          console.log(
            "Redirecting to Save page with browser storage reference",
          );
          window.location.href = finalUrl;
        })
        .catch((error: unknown) => {
          console.error("Failed to store in browser storage:", error);
          // Fallback to direct URL for smaller files
          if (cssContent.length < 50000) {
            // Only for reasonably sized files
            fallbackToDirectUrl(cssContent, url);
          } else {
            console.error("File too large for direct URL fallback");
          }
        });
    } else {
      console.warn("No CSS content found in UserCSS file");
    }
  } catch (error) {
    console.error("Failed to redirect to Save page:", error);
  }
}

/**
 * Fallback method for when storage fails
 */
function fallbackToDirectUrl(cssContent: string, sourceUrl: string): void {
  try {
    // Guard against browser API not being available
    if (typeof window === "undefined") {
      console.warn("Window not available in fallback method");
      return;
    }

    const saveURL = browser.runtime.getURL("/save.html");
    const encodedCss = btoa(encodeURIComponent(cssContent));
    const filename = sourceUrl.split("/").pop() || "external.user.css";
    const finalUrl = `${saveURL}?css=${encodedCss}&filename=${encodeURIComponent(filename)}&sourceUrl=${encodeURIComponent(sourceUrl)}&source=external&encoding=base64`;

    console.log("Using fallback direct URL method");
    window.location.href = finalUrl;
  } catch (error) {
    console.error("Fallback method also failed:", error);
  }
}

/**
 * Directly inject font CSS into the page
 */
function injectFontDirectly(fontName: string, css: string): void {
  try {
    // Guard against document not being available
    if (typeof document === "undefined") {
      console.warn("Document not available for font injection");
      return;
    }

    console.log(`[injectFontDirectly] Injecting font CSS for ${fontName}`);

    // Create a style element for the font
    const styleElement = document.createElement("style");
    styleElement.setAttribute("data-font-injection", fontName);
    styleElement.textContent = css;

    // Insert at the beginning of head to ensure fonts load before other styles
    const head = document.head || document.documentElement;
    head.insertBefore(styleElement, head.firstChild);

    console.log(
      `[injectFontDirectly] Successfully injected font CSS for ${fontName}`,
    );
  } catch (error) {
    console.error(
      `[injectFontDirectly] Failed to inject font CSS for ${fontName}:`,
      error,
    );
  }
}
