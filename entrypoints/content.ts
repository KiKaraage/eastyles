import { contentController } from "../services/usercss/content-controller";
import { logger } from "../services/errors/logger";
import { ErrorSource } from "../services/errors/service";
import { UserCSSStyle } from "../services/storage/schema";

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
      type: "VARIABLES_UPDATED";
      payload: {
        styleId: string;
        variables: Record<string, string>;
        timestamp: number;
      };
    };

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("UserCSS content script initializing...");

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
        try {
          if (
            message.type === "styleUpdate" &&
            message.styleId &&
            message.style
          ) {
            contentController.onStyleUpdate(message.styleId, message.style);
          } else if (message.type === "styleRemove" && message.styleId) {
            contentController.onStyleRemove(message.styleId);
          } else if (message.type === "VARIABLES_UPDATED" && message.payload) {
            const { styleId, variables } = message.payload;
            contentController.onVariablesUpdate(styleId, variables);
          }
        } catch (error) {
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
    const url = window.location.href;
    const cssContent = document.body?.textContent || "";

    if (cssContent.trim()) {
      // For external URLs, pass the content as base64 (safer than URL encoding)
      const saveURL = browser.runtime.getURL("/save.html");
      const encodedCss = btoa(encodeURIComponent(cssContent));
      const finalUrl = `${saveURL}?css=${encodedCss}&sourceUrl=${encodeURIComponent(url)}&source=external&encoding=base64`;

      console.log("Redirecting to:", finalUrl.substring(0, 100) + "...");
      window.location.href = finalUrl;
    } else {
      console.warn("No CSS content found in UserCSS file");
    }
  } catch (error) {
    console.error("Failed to redirect to Save page:", error);
  }
}
