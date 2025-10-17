/**
 * CSS Injection System for UserCSS styles
 *
 * Provides multiple injection methods with automatic fallback:
 * 1. Constructable stylesheets (preferred, when available)
 * 2. <style> element injection (fallback)
 * 3. chrome.scripting.insertCSS (CSP/permission fallback)
 */

import { browser } from "wxt/browser";

export interface CSSInjector {
  inject(css: string, styleId: string): Promise<void>;
  remove(styleId: string): Promise<void>;
  update(styleId: string, css: string): Promise<void>;
  getInjectionMethod():
    | "style-element"
    | "constructable-stylesheet"
    | "scripting-api";
}

export interface CSPSuggestion {
  type: "host-permission" | "scripting-api" | "user-action";
  message: string;
  action?: string;
}

export interface CSPErrorDetails {
  reason: string;
  directive: string;
  violatedDirective: string;
  suggestion: CSPSuggestion;
}

export class CSPError extends Error {
  public readonly code = "ERR_INJECTION_CSP";
  public readonly details: CSPErrorDetails;

  constructor(details: CSPErrorDetails) {
    super(`CSS injection blocked by CSP: ${details.reason}`);
    this.name = "CSPError";
    this.details = details;
  }
}

export class UserCSSInjector implements CSSInjector {
  private registry = new Map<string, CSSStyleSheet | HTMLStyleElement>();
  private injectionMethod:
    | "style-element"
    | "constructable-stylesheet"
    | "scripting-api";
  private batchQueue = new Map<
    string,
    { css: string; resolve: () => void; reject: (error: Error) => void }
  >();
  private batchTimer: number | null = null;
  private readonly BATCH_DELAY = 16; // ~60fps
  private readonly MAX_BATCH_TIME = 1000; // 1000ms budget (more lenient)

  constructor() {
    this.injectionMethod = this.detectBestMethod();
  }

  private detectBestMethod():
    | "style-element"
    | "constructable-stylesheet"
    | "scripting-api" {
    console.log("[ea-CSSInjector] Detecting best injection method...");

    // Prioritize style elements for better reliability and performance
    // Style elements are more compatible and have better CSS parsing support
    if (typeof globalThis.document !== "undefined" && globalThis.document) {
      console.log(
        "[ea-CSSInjector] Document available - using style-element method",
      );
      return "style-element";
    }

    // Check if chrome.scripting API is available (Chrome MV3) as secondary option
    try {
      if (
        browser &&
        browser.scripting?.insertCSS &&
        typeof browser.scripting.insertCSS === "function" &&
        browser.tabs?.query &&
        typeof browser.tabs.query === "function"
      ) {
        console.log(
          "[ea-CSSInjector] Chrome scripting API available - using scripting-api",
        );
        return "scripting-api";
      }
    } catch (error) {
      console.log("[ea-CSSInjector] Error checking scripting API:", error);
    }

    // Check if constructable stylesheets are supported as last resort
    try {
      if (
        typeof globalThis.document !== "undefined" &&
        globalThis.document &&
        "adoptedStyleSheets" in globalThis.document &&
        typeof CSSStyleSheet !== "undefined"
      ) {
        console.log(
          "[ea-CSSInjector] Constructable stylesheets supported - using constructable-stylesheet",
        );
        return "constructable-stylesheet";
      }
    } catch (error) {
      console.log(
        "[ea-CSSInjector] Error checking constructable stylesheets:",
        error,
      );
    }

    // Ultimate fallback to style element
    console.log("[ea-CSSInjector] Using fallback method: style-element");
    return "style-element";
  }

  getInjectionMethod():
    | "style-element"
    | "constructable-stylesheet"
    | "scripting-api" {
    return this.injectionMethod;
  }

  async inject(css: string, styleId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Add to batch queue
      this.batchQueue.set(styleId, { css, resolve, reject });

      // Schedule batch processing
      this.scheduleBatch();
    });
  }

  private scheduleBatch(): void {
    if (this.batchTimer) {
      // Already scheduled
      return;
    }

    this.batchTimer = window.setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);
  }

  private async processBatch(): Promise<void> {
    const startTime = performance.now();
    const batchItems = Array.from(this.batchQueue.entries());
    this.batchQueue.clear();
    this.batchTimer = null;

    try {
      // Process all items in the batch
      const promises = batchItems.map(
        async ([styleId, { css, resolve, reject }]) => {
          try {
            await this.injectImmediate(css, styleId);
            resolve();
          } catch (error) {
            reject(error as Error);
          }
        },
      );

      await Promise.all(promises);

      // Check performance budget
      const endTime = performance.now();
      const duration = endTime - startTime;

      if (duration > this.MAX_BATCH_TIME) {
        console.warn(
          `[ea-CSSInjector] CSS injection batch exceeded performance budget: ${duration.toFixed(2)}ms > ${this.MAX_BATCH_TIME}ms`,
        );
      }
    } catch (error) {
      // Handle batch-level errors
      console.error("[ea-CSSInjector] CSS injection batch failed:", error);
      // Still re-throw the error so it can be handled by the caller
      throw error;
    }
  }

  private async injectImmediate(css: string, styleId: string): Promise<void> {
    console.log(
      `[ea-CSSInjector] Injecting style ${styleId}, CSS length: ${css.length}`,
    );
    await this.injectWithCSPHandling(css, styleId);
    console.log(`[ea-CSSInjector] Successfully injected style ${styleId}`);
  }

  private async injectConstructable(
    css: string,
    styleId: string,
  ): Promise<void> {
    console.log(
      `[ea-CSSInjector] Injecting via constructable stylesheet for ${styleId}`,
    );
    if (!("adoptedStyleSheets" in globalThis.document)) {
      console.error(
        `[ea-CSSInjector] Constructable stylesheets not supported in this environment`,
      );
      throw new Error("Constructable stylesheets not supported");
    }

    const sheet = new CSSStyleSheet();
    console.log(`[ea-CSSInjector] Created CSSStyleSheet for ${styleId}`);
    sheet.replaceSync(css);
    console.log(
      `[ea-CSSInjector] Replaced CSS content for ${styleId}, length: ${css.length}`,
    );

    // Log current adoptedStyleSheets state
    const currentSheets = globalThis.document.adoptedStyleSheets || [];
    console.log(
      `[ea-CSSInjector] Current adoptedStyleSheets count: ${currentSheets.length}`,
    );

    // Append to adoptedStyleSheets without overwriting existing ones
    globalThis.document.adoptedStyleSheets = [...currentSheets, sheet];

    console.log(
      `[ea-CSSInjector] Added stylesheet to adoptedStyleSheets, new count: ${globalThis.document.adoptedStyleSheets.length}`,
    );
    this.registry.set(styleId, sheet);
  }

  private async injectStyleElement(
    css: string,
    styleId: string,
  ): Promise<void> {
    console.log(`[ea-CSSInjector] Injecting via style element for ${styleId}`);

    const style = globalThis.document.createElement("style");
    style.setAttribute("data-eastyles-id", styleId);
    style.setAttribute("type", "text/css");

    // Set CSS content
    style.textContent = css;
    console.log(
      `[ea-CSSInjector] Created style element with CSS length: ${css.length}`,
    );

    // Insert at the end of head to ensure proper cascade, but before any existing UserCSS styles
    const head =
      globalThis.document.head || globalThis.document.documentElement;

    // Find the last existing Eastyles style to maintain order
    const existingStyles = head.querySelectorAll("style[data-eastyles-id]");
    if (existingStyles.length > 0) {
      const lastStyle = existingStyles[existingStyles.length - 1];
      head.insertBefore(style, lastStyle.nextSibling);
    } else {
      head.appendChild(style);
    }

    console.log(`[ea-CSSInjector] Inserted style element into ${head.tagName}`);

    // Verify the style was added and is functional
    const addedStyle = head.querySelector(
      `style[data-eastyles-id="${styleId}"]`,
    ) as HTMLStyleElement;
    console.log(
      `[ea-CSSInjector] Style element added successfully: ${!!addedStyle}`,
    );

    if (addedStyle) {
      // Wait a moment for browser to parse CSS
      await new Promise((resolve) => setTimeout(resolve, 10));

      const sheet = addedStyle.sheet;
      if (sheet) {
        console.log(
          `[ea-CSSInjector] CSS rules parsed for ${styleId}:`,
          sheet.cssRules.length,
        );

        // Log first few rules for debugging
        const ruleCount = Math.min(sheet.cssRules.length, 3);
        for (let i = 0; i < ruleCount; i++) {
          const rule = sheet.cssRules[i];
          const ruleText =
            rule.cssText.length > 100
              ? rule.cssText.substring(0, 100) + "..."
              : rule.cssText;
          console.log(`[ea-CSSInjector] Rule ${i}:`, ruleText);
        }
      } else {
        console.warn(
          `[ea-CSSInjector] No CSS sheet found for ${styleId} - CSS may be invalid`,
        );
        console.warn(
          `[ea-CSSInjector] CSS content preview:`,
          css.substring(0, 200),
        );
      }
    }

    this.registry.set(styleId, style);
  }

  private async injectScriptingAPI(
    css: string,
    styleId: string,
  ): Promise<void> {
    if (!browser?.scripting?.insertCSS) {
      throw new Error("Chrome scripting API not available");
    }

    try {
      // For scripting API, we need to inject into the active tab
      // This is typically called from content script context
      const tabId = await this.getCurrentTabId();

      // Use type assertion to handle different browser API signatures
      const insertCSS = browser.scripting.insertCSS as (
        options: unknown,
      ) => Promise<void>;
      await insertCSS({
        target: { tabId },
        css,
      });

      // Store the CSS content for potential updates
      this.registry.set(
        styleId,
        css as unknown as CSSStyleSheet | HTMLStyleElement,
      );
    } catch (error) {
      throw new Error(
        `Failed to inject CSS via scripting API: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async getCurrentTabId(): Promise<number> {
    // In content script context, we can get tab ID from chrome.tabs
    if (browser?.tabs?.query) {
      try {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tabs && tabs.length > 0 && tabs[0]?.id) {
          return tabs[0].id;
        }
      } catch (error) {
        console.warn("[ea-CSSInjector] Failed to query tabs:", error);
        throw new Error("Failed to query tabs");
      }
    }
    throw new Error("Unable to determine current tab ID");
  }

  async remove(styleId: string): Promise<void> {
    const registered = this.registry.get(styleId);

    try {
      if (registered) {
        switch (this.injectionMethod) {
          case "constructable-stylesheet":
            await this.removeConstructable(
              styleId,
              registered as CSSStyleSheet,
            );
            break;
          case "scripting-api":
            await this.removeScriptingAPI(styleId);
            break;
          case "style-element":
          default:
            await this.removeStyleElement(registered as HTMLStyleElement);
            break;
        }
      } else {
        // Fallback: try to find and remove the style element directly
        const styleElement = globalThis.document.querySelector(
          `style[data-eastyles-id="${styleId}"]`,
        );
        if (styleElement && styleElement.parentNode) {
          styleElement.parentNode.removeChild(styleElement);
          console.log(
            `[ea-CSSInjector] Removed style element via direct lookup for ${styleId}`,
          );
        }
      }
    } finally {
      this.registry.delete(styleId);
    }
  }

  private async removeConstructable(
    _styleId: string,
    sheet: CSSStyleSheet,
  ): Promise<void> {
    if (!("adoptedStyleSheets" in globalThis.document)) {
      return;
    }

    const sheets = Array.from(globalThis.document.adoptedStyleSheets || []);
    const filteredSheets = sheets.filter((s) => s !== sheet);

    globalThis.document.adoptedStyleSheets = filteredSheets;
  }

  private async removeStyleElement(style: HTMLStyleElement): Promise<void> {
    if (style.parentNode) {
      style.parentNode.removeChild(style);
    } else {
      // Fallback: try to find and remove by ID selector
      const styleId = style.getAttribute("data-eastyles-id");
      if (styleId) {
        const fallbackStyle = globalThis.document.querySelector(
          `style[data-eastyles-id="${styleId}"]`,
        );
        if (fallbackStyle && fallbackStyle.parentNode) {
          fallbackStyle.parentNode.removeChild(fallbackStyle);
          console.log(
            `[ea-CSSInjector] Removed style element via fallback lookup for ${styleId}`,
          );
        }
      }
    }
  }

  private async removeScriptingAPI(_styleId: string): Promise<void> {
    if (!browser?.scripting?.removeCSS) {
      return;
    }

    try {
      const tabId = await this.getCurrentTabId();
      // Use type assertion for browser API compatibility
      const removeCSS = browser.scripting.removeCSS as (
        options: unknown,
      ) => Promise<void>;
      await removeCSS({
        target: { tabId },
        // Note: removeCSS requires the same target specification as insertCSS
      });
    } catch {
      // Ignore errors during removal - the CSS may already be gone
      console.warn("[ea-CSSInjector] Failed to remove CSS via scripting API");
    }
  }

  async update(styleId: string, css: string): Promise<void> {
    const registered = this.registry.get(styleId);
    if (!registered) {
      // Check if there's a pending injection for this styleId in the batch queue
      if (this.batchQueue.has(styleId)) {
        // Process the batch immediately to register the style
        await this.flushBatch();
      } else {
        // If not registered and not in batch queue, treat as new injection
        return this.inject(css, styleId);
      }
    }

    // For updates, we want immediate processing to avoid delays
    await this.flushBatch();

    try {
      switch (this.injectionMethod) {
        case "constructable-stylesheet":
          await this.updateConstructable(registered as CSSStyleSheet, css);
          break;
        case "scripting-api":
          // For scripting API, we need to remove and re-inject
          await this.remove(styleId);
          await this.injectImmediate(css, styleId);
          break;
        case "style-element":
        default:
          await this.updateStyleElement(registered as HTMLStyleElement, css);
          break;
      }
    } catch {
      // Fallback to remove and re-inject
      await this.remove(styleId);
      await this.injectImmediate(css, styleId);
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // If there are items in the batch queue, process them
    if (this.batchQueue.size > 0) {
      await this.processBatch();
    }
  }

  // Public method to flush pending batches (useful for testing)
  async flush(): Promise<void> {
    await this.flushBatch();
  }

  private detectCSPError(error: unknown): CSPError | null {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Common CSP error patterns - order matters for proper matching
    const cspPatterns = [
      {
        pattern:
          /refused to apply inline style.*violates.*content security policy directive.*style-src/i,
        directive: "style-src",
        reason: "Inline style application blocked",
        suggestion: {
          type: "scripting-api" as const,
          message: "Use chrome.scripting.insertCSS for style injection",
          action: "Switch to scripting API method",
        },
      },
      {
        pattern:
          /refused to execute inline script.*violates.*content security policy directive.*script-src/i,
        directive: "script-src",
        reason: "Inline script execution blocked",
        suggestion: {
          type: "scripting-api" as const,
          message: "Consider using chrome.scripting API for injection",
          action: "Use scripting API method",
        },
      },
      {
        pattern: /refused to load the stylesheet|violates.*style-src-elem/i,
        directive: "style-src-elem",
        reason: "External stylesheet loading blocked",
        suggestion: {
          type: "host-permission" as const,
          message: "Request host permission for the target domain",
          action: "Add host permission in manifest",
        },
      },
      {
        pattern: /violates.*csp.*directive.*style-src.*unsafe-inline/i,
        directive: "style-src",
        reason: "CSP requires nonce/hash for inline styles",
        suggestion: {
          type: "user-action" as const,
          message: "Site requires CSP nonce/hash for inline styles",
          action: "Contact site administrator for CSP configuration",
        },
      },
    ];

    for (const pattern of cspPatterns) {
      if (pattern.pattern.test(errorMessage)) {
        return new CSPError({
          reason: pattern.reason,
          directive: pattern.directive,
          violatedDirective: pattern.directive,
          suggestion: pattern.suggestion,
        });
      }
    }

    return null;
  }

  private async injectWithCSPHandling(
    css: string,
    styleId: string,
  ): Promise<void> {
    console.log(
      `[ea-CSSInjector] Starting injection for ${styleId} using method: ${this.injectionMethod}`,
    );
    const originalMethod = this.injectionMethod;

    try {
      // Try the current injection method
      switch (this.injectionMethod) {
        case "constructable-stylesheet":
          console.log(
            `[ea-CSSInjector] Using constructable stylesheet method for ${styleId}`,
          );
          await this.injectConstructable(css, styleId);
          break;
        case "scripting-api":
          console.log(
            `[ea-CSSInjector] Using scripting API method for ${styleId}`,
          );
          await this.injectScriptingAPI(css, styleId);
          break;
        case "style-element":
        default:
          console.log(
            `[ea-CSSInjector] Using style element method for ${styleId}`,
          );
          await this.injectStyleElement(css, styleId);
          break;
      }
    } catch (error) {
      // Check if this is a CSP-related error
      const cspError = this.detectCSPError(error);
      if (cspError) {
        // Log CSP error with suggestions
        console.warn(
          `[ea-CSSInjector] CSP Error detected: ${cspError.message}`,
          cspError.details,
        );

        // Try fallback methods for CSP errors
        try {
          await this.handleCSPFallback(css, styleId, cspError);
          return;
        } catch {
          // If fallback fails, restore original method and throw CSP error
          this.injectionMethod = originalMethod;
          throw cspError;
        }
      }

      // For non-CSP errors, try fallback methods
      try {
        await this.tryFallbackMethods(css, styleId, originalMethod);
        return; // If fallback succeeds, we're done
      } catch (fallbackError) {
        // Restore original method and throw the fallback error (which should be "All CSS injection methods failed")
        this.injectionMethod = originalMethod;
        throw fallbackError;
      }
    }
  }

  private async handleCSPFallback(
    css: string,
    styleId: string,
    cspError: CSPError,
  ): Promise<void> {
    const fallbackMethods = this.getCSPFallbackMethods(cspError);

    for (const method of fallbackMethods) {
      try {
        this.injectionMethod = method;
        await this.injectImmediate(css, styleId);
        console.info(`CSP fallback successful using ${method} method`);
        return;
      } catch (fallbackError) {
        // Continue to next fallback method
        console.debug(`CSP fallback ${method} failed:`, fallbackError);
      }
    }

    // If all fallbacks failed, throw the original CSP error
    throw cspError;
  }

  private getCSPFallbackMethods(
    cspError: CSPError,
  ): ("style-element" | "constructable-stylesheet" | "scripting-api")[] {
    switch (cspError.details.suggestion.type) {
      case "scripting-api":
        return ["scripting-api", "style-element", "constructable-stylesheet"];
      case "host-permission":
        return ["scripting-api", "constructable-stylesheet", "style-element"];
      case "user-action":
        return ["scripting-api", "constructable-stylesheet", "style-element"];
      default:
        return ["scripting-api", "constructable-stylesheet", "style-element"];
    }
  }

  private async updateConstructable(
    sheet: CSSStyleSheet,
    css: string,
  ): Promise<void> {
    sheet.replaceSync(css);
  }

  private async updateStyleElement(
    style: HTMLStyleElement,
    css: string,
  ): Promise<void> {
    style.textContent = css;
  }

  private async tryFallbackMethods(
    css: string,
    styleId: string,
    excludeMethod: string,
  ): Promise<void> {
    // Order fallback methods by likelihood of success
    const prioritizedMethods: (
      | "style-element"
      | "constructable-stylesheet"
      | "scripting-api"
    )[] = ["style-element", "scripting-api", "constructable-stylesheet"];

    const fallbackMethods = prioritizedMethods.filter(
      (method) => method !== excludeMethod,
    );

    const errors: Error[] = [];

    for (const method of fallbackMethods) {
      try {
        this.injectionMethod = method;
        switch (method) {
          case "constructable-stylesheet":
            await this.injectConstructable(css, styleId);
            break;
          case "scripting-api":
            await this.injectScriptingAPI(css, styleId);
            break;
          case "style-element":
            await this.injectStyleElement(css, styleId);
            break;
        }
        console.info(`Fallback successful using ${method} method`);
        return;
      } catch (fallbackError) {
        console.debug(`Fallback ${method} failed:`, fallbackError);
        errors.push(fallbackError as Error);
      }
    }

    // If we get here, all methods failed
    const error = new Error("All CSS injection methods failed");
    (error as Error & { errors: Error[] }).errors = errors; // Attach the underlying errors for debugging
    throw error;
  }
}

// Export singleton instance for use across the extension
export const cssInjector = new UserCSSInjector();
