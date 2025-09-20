/**
 * Content Controller for UserCSS Styles
 *
 * Manages the application of UserCSS styles in content scripts by:
 * - Querying active styles for the current URL
 * - Using DomainDetector to determine style applicability
 * - Coordinating with CSSInjector for style injection
 * - Handling style updates and removals
 */

import { domainDetector } from "./domain-detector";
import { UserCSSStyle } from "../storage/schema";
import { logger } from "../errors/logger";
import { ErrorSource } from "../errors/service";
import { cssInjector } from "./css-injector";
import { resolveVariables } from "./variables";
import { extractExternalUrls, ExternalAsset } from "./asset-processor";
import { browser } from "wxt/browser";

export interface ContentController {
  /**
   * Initialize the content controller for the current page
   */
  initialize(): Promise<void>;

  /**
   * Handle navigation to a new URL
   */
  onNavigation(url: string): Promise<void>;

  /**
   * Handle style updates from background
   */
  onStyleUpdate(styleId: string, style: UserCSSStyle): Promise<void>;

  /**
   * Handle style removal
   */
  onStyleRemove(styleId: string): Promise<void>;

  /**
   * Handle variable updates for a specific style
   */
  onVariablesUpdate(
    styleId: string,
    variables: Record<string, string>,
  ): Promise<void>;

  /**
   * Get currently applied styles
   */
  getAppliedStyles(): Map<string, UserCSSStyle>;
}

export class UserCSSContentController implements ContentController {
  private appliedStyles = new Map<string, UserCSSStyle>();
  private currentUrl = "";
  private debugEnabled = false;
  private retryCount = 0;
  private maxRetries = 3;
  public domainDetector = domainDetector; // Expose for testing

  constructor(debug = false) {
    this.debugEnabled = debug;
  }

  private debug(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      console.log(`[ContentController] ${message}`, ...args);
    }
  }

  /**
   * Initialize the content controller
   */
  async initialize(): Promise<void> {
    this.debug("Initializing content controller");

    try {
      // Get current URL
      this.currentUrl = window.location.href;

      // Check CSP headers that might affect CSS injection
      this.checkCSPHeaders();

      // Query active styles for current URL
      await this.queryAndApplyStyles();

      // Set up navigation listener
      this.setupNavigationListener();

      this.debug("Content controller initialized successfully");
    } catch (error) {
      logger.error?.(
        ErrorSource.CONTENT,
        "Failed to initialize content controller",
        { error: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  /**
   * Set up navigation listener to handle SPA navigation
   */
  private setupNavigationListener(): void {
    // Listen for popstate events (browser back/forward)
    window.addEventListener("popstate", () => {
      this.onNavigation(window.location.href);
    });

    // Listen for pushstate/replacestate (SPA navigation)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.onNavigation(window.location.href);
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.onNavigation(window.location.href);
    };

    // Also listen for hash changes
    window.addEventListener("hashchange", () => {
      this.onNavigation(window.location.href);
    });
  }

  /**
   * Handle navigation to a new URL
   */
  async onNavigation(url: string): Promise<void> {
    if (url === this.currentUrl) {
      return; // No change
    }

    this.debug("Navigation detected:", url);
    this.currentUrl = url;

    try {
      await this.queryAndApplyStyles();
    } catch (error) {
      logger.error?.(ErrorSource.CONTENT, "Failed to handle navigation", {
        error: error instanceof Error ? error.message : String(error),
        url,
      });
    }
  }

  /**
   * Query active styles and apply matching ones
   */
  private async queryAndApplyStyles(): Promise<void> {
    const totalStartTime = performance.now();
    const performanceSpans: Array<{ operation: string; duration: number }> = [];

    try {
      // Query active styles from background with timeout
      const queryStartTime = performance.now();
      const queryPromise = this.queryActiveStyles();
      const timeoutPromise = new Promise<UserCSSStyle[]>((_, reject) => {
        setTimeout(() => reject(new Error("Query timeout")), 5000); // 5 second timeout
      });

      const activeStyles = await Promise.race([queryPromise, timeoutPromise]);
      const queryDuration = performance.now() - queryStartTime;
      performanceSpans.push({
        operation: "queryActiveStyles",
        duration: queryDuration,
      });

      // Remove styles that no longer match
      const removeStartTime = performance.now();
      await this.removeNonMatchingStyles(activeStyles);
      const removeDuration = performance.now() - removeStartTime;
      performanceSpans.push({
        operation: "removeNonMatchingStyles",
        duration: removeDuration,
      });

      // Apply new matching styles
      const applyStartTime = performance.now();
      await this.applyMatchingStyles(activeStyles);
      const applyDuration = performance.now() - applyStartTime;
      performanceSpans.push({
        operation: "applyMatchingStyles",
        duration: applyDuration,
      });

      // Log applied styles
      this.debug(
        `Applied ${this.appliedStyles.size} styles:`,
        Array.from(this.appliedStyles.keys()),
      );

      // Log performance with detailed spans
      const totalDuration = performance.now() - totalStartTime;
      const performanceData = {
        totalDuration: `${totalDuration.toFixed(2)}ms`,
        spans: performanceSpans.map(
          (s) => `${s.operation}: ${s.duration.toFixed(2)}ms`,
        ),
        budget: "1000ms",
        appliedStylesCount: this.appliedStyles.size,
      };

      if (totalDuration > 1000) {
        // Performance budget exceeded - log as warning via ErrorService
        logger.warn?.(
          ErrorSource.CONTENT,
          "Performance budget exceeded",
          performanceData,
        );
      } else {
        this.debug(
          `Performance: queryAndApplyStyles completed in ${totalDuration.toFixed(2)}ms`,
          performanceData,
        );
      }
    } catch (error) {
      const totalDuration = performance.now() - totalStartTime;
      logger.error?.(ErrorSource.CONTENT, "Failed to query and apply styles", {
        error: error instanceof Error ? error.message : String(error),
        duration: `${totalDuration.toFixed(2)}ms`,
        spans: performanceSpans,
      });
    }
  }

  /**
   * Query active styles from background script
   */
  private async queryActiveStyles(): Promise<UserCSSStyle[]> {
    try {
      this.debug(
        "Querying active styles from background for URL:",
        this.currentUrl,
      );

      // Check if background script is available first
      if (!browser.runtime?.id) {
        this.debug("Background script not available (no runtime.id)");
        return [];
      }

      // Send message to background script to get styles for current URL
      console.log("[ContentController] Sending QUERY_STYLES_FOR_URL message");
      const response = (await browser.runtime.sendMessage({
        type: "QUERY_STYLES_FOR_URL",
        payload: { url: this.currentUrl },
      })) as {
        success: boolean;
        error?: string;
        styles?: UserCSSStyle[];
      };

      console.log("[ContentController] Raw response received:", response);
      console.log("[ContentController] Response type:", typeof response);

      if (response && response.success && response.styles) {
        this.debug(
          `Received ${response.styles.length} styles from background:`,
          response.styles.map((s) => s.id),
        );
        this.retryCount = 0; // Reset retry count on success
        return response.styles;
      } else {
        this.debug("No styles received from background or query failed");
        return [];
      }
    } catch (error) {
      // Handle connection errors gracefully
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("Could not establish connection") ||
        errorMessage.includes("Receiving end does not exist") ||
        errorMessage.includes("Message timeout") ||
        errorMessage.includes("out of scope")
      ) {
        this.retryCount++;

        if (this.retryCount >= this.maxRetries) {
          logger.error?.(
            ErrorSource.CONTENT,
            `Background script not available after ${this.maxRetries} retries, giving up`,
            {
              error: errorMessage,
              url: this.currentUrl,
              retryCount: this.retryCount,
            },
          );
          this.retryCount = 0; // Reset for next attempt
          return [];
        }

        logger.error?.(
          ErrorSource.CONTENT,
          `Background script not available, retrying in 2 seconds (${this.retryCount}/${this.maxRetries})`,
          {
            error: errorMessage,
            url: this.currentUrl,
          },
        );
        // Retry after a delay
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.queryActiveStyles();
      } else {
        logger.error?.(
          ErrorSource.CONTENT,
          "Failed to query active styles from background",
          {
            error: errorMessage,
            url: this.currentUrl,
          },
        );
        return [];
      }
    }
  }

  /**
   * Remove styles that no longer match the current URL
   */
  private async removeNonMatchingStyles(
    activeStyles: UserCSSStyle[],
  ): Promise<void> {
    const activeStyleIds = new Set(activeStyles.map((style) => style.id));
    const stylesToRemove: string[] = [];

    for (const [styleId, style] of this.appliedStyles) {
      if (!activeStyleIds.has(styleId)) {
        // Style is no longer active
        stylesToRemove.push(styleId);
      } else {
        // Check if style still matches current URL
        const matches = domainDetector.matches(this.currentUrl, style.domains);
        if (!matches) {
          stylesToRemove.push(styleId);
        }
      }
    }

    // Remove non-matching styles
    for (const styleId of stylesToRemove) {
      await this.removeStyle(styleId);
    }

    if (stylesToRemove.length > 0) {
      this.debug("Removed non-matching styles:", stylesToRemove);
    }
  }

  /**
   * Apply styles that match the current URL
   */
  private async applyMatchingStyles(
    activeStyles: UserCSSStyle[],
  ): Promise<void> {
    const stylesToApply: UserCSSStyle[] = [];

    for (const style of activeStyles) {
      if (!this.appliedStyles.has(style.id)) {
        // Additional domain filtering safeguard - only apply enabled styles that match the domain
        if (!style.enabled) {
          this.debug(`Style ${style.id} is disabled, skipping application`);
          continue;
        }

        const matches = domainDetector.matches(this.currentUrl, style.domains);
        if (matches) {
          stylesToApply.push(style);
        } else {
          this.debug(
            `Style ${style.id} doesn't match current domain, skipping`,
          );
        }
      }
    }

    // Apply matching styles
    for (const style of stylesToApply) {
      await this.applyStyle(style);
    }

    if (stylesToApply.length > 0) {
      this.debug(
        "Applied matching styles:",
        stylesToApply.map((s) => s.id),
      );
    }
  }

  /**
   * Apply a single style
   */
  private async applyStyle(style: UserCSSStyle): Promise<void> {
    const styleStartTime = performance.now();
    try {
      this.debug(
        "Applying style:",
        style.id,
        "CSS length:",
        style.compiledCss.length,
      );

      this.debug(
        "Applying style:",
        style.id,
        "CSS length:",
        style.compiledCss.length,
      );

      // Resolve variables in the CSS
      let finalCss = style.compiledCss;
      if (style.variables && Object.keys(style.variables).length > 0) {
        // Create values object from variable descriptors
        const values: Record<string, string> = {};
        for (const [name, variable] of Object.entries(style.variables)) {
          let value = variable.value || variable.default || "";

          // For select variables, if the value is a display label, map it to CSS content
          if (variable.type === 'select' && variable.optionCss && variable.optionCss[value]) {
            value = variable.optionCss[value];
          }

          values[name] = value;
        }

        console.log(
          "[ContentController] Resolving variables for style:",
          style.id,
          "variables:",
          values,
        );
        // Resolve variables in CSS
        finalCss = resolveVariables(style.compiledCss, values);
        this.debug(
          "Variables resolved for style:",
          style.id,
          "final CSS length:",
          finalCss.length,
        );
        console.log(
          "[ContentController] Variables resolved, final CSS preview:",
          finalCss.substring(0, 200) + "...",
        );
      } else {
        console.log(
          "[ContentController] No variables to resolve for style:",
          style.id,
        );
      }

       // Process external assets (images, fonts) to work around CSP restrictions
       console.log("[ContentController] Processing external assets for style:", style.id);
       try {
         const assetProcessingStart = performance.now();
         const assetResult = await this.processExternalAssets(finalCss);
         finalCss = assetResult.css;

         const assetProcessingDuration = performance.now() - assetProcessingStart;
         const successfulAssets = assetResult.assets.filter(a => a.dataUrl).length;
         const totalAssets = assetResult.assets.length;

         console.log(
           `[ContentController] Asset processing completed in ${assetProcessingDuration.toFixed(2)}ms:`,
           `${successfulAssets}/${totalAssets} assets processed`
         );

         if (successfulAssets < totalAssets) {
           console.warn(
             `[ContentController] Some assets failed to load: ${totalAssets - successfulAssets} failed`
           );
           // Log failed assets
           assetResult.assets.filter(a => !a.dataUrl && a.error).forEach(asset => {
             console.warn(`[ContentController] Failed asset: ${asset.url} - ${asset.error}`);
           });
         }

         if (assetProcessingDuration > 500) {
           logger.warn?.(
             ErrorSource.CONTENT,
             `Asset processing exceeded threshold: ${assetProcessingDuration.toFixed(2)}ms`,
             {
               styleId: style.id,
               totalAssets,
               processedAssets: successfulAssets,
               duration: `${assetProcessingDuration.toFixed(2)}ms`,
             },
           );
         }
       } catch (error) {
         console.warn("[ContentController] Asset processing failed:", error);
         logger.error?.(
           ErrorSource.CONTENT,
           "Failed to process external assets",
           {
             error: error instanceof Error ? error.message : String(error),
             styleId: style.id,
           },
         );
         // Continue with original CSS if asset processing fails
       }

       // Preprocess CSS to fix browser compatibility issues
       finalCss = this.preprocessCSS(finalCss);

       // Inject the CSS using the CSS injector
       console.log(
         "[ContentController] Injecting CSS for style:",
         style.id,
         "final CSS length:",
         finalCss.length,
       );
       console.log(
         "[ContentController] Final CSS content preview:",
         finalCss.substring(0, 300) + (finalCss.length > 300 ? "..." : ""),
       );

      // Check if CSS contains valid selectors
      const selectorMatches = finalCss.match(/\{[^}]*\}/g);
      console.log(
        "[ContentController] CSS rule blocks found:",
        selectorMatches?.length || 0,
      );

      await cssInjector.inject(finalCss, style.id);
      console.log(
        "[ContentController] CSS injection completed for style:",
        style.id,
      );

      // Mark as applied
      this.appliedStyles.set(style.id, style);

      // Log performance for individual style application
      const styleDuration = performance.now() - styleStartTime;
      if (styleDuration > 300) {
        // Individual style taking too long - log as warning
        logger.warn?.(
          ErrorSource.CONTENT,
          `Individual style application exceeded threshold: ${styleDuration.toFixed(2)}ms`,
          {
            styleId: style.id,
            styleName: style.name,
            duration: `${styleDuration.toFixed(2)}ms`,
            threshold: "300ms",
            cssLength: style.compiledCss.length,
            hasVariables: !!(
              style.variables && Object.keys(style.variables).length > 0
            ),
          },
        );
      } else {
        this.debug(
          `Style ${style.id} applied in ${styleDuration.toFixed(2)}ms`,
        );
      }

      // Verify the style was actually applied by checking if it's in the DOM
      this.verifyStyleApplication(style.id);

      this.debug("Style applied successfully:", style.id);
    } catch (error) {
      const styleDuration = performance.now() - styleStartTime;
      console.error(
        "[ContentController] Failed to apply style:",
        style.id,
        error,
      );
      logger.error?.(ErrorSource.CONTENT, "Failed to apply style", {
        error: error instanceof Error ? error.message : String(error),
        styleId: style.id,
        duration: `${styleDuration.toFixed(2)}ms`,
        cssLength: style.compiledCss.length,
      });
    }
  }

  /**
   * Remove a single style
   */
  private async removeStyle(styleId: string): Promise<void> {
    try {
      this.debug("Removing style:", styleId);

      // Remove CSS using the CSS injector
      await cssInjector.remove(styleId);

      // Remove from applied styles
      this.appliedStyles.delete(styleId);

      this.debug("Style removed successfully:", styleId);
    } catch (error) {
      logger.error?.(ErrorSource.CONTENT, "Failed to remove style", {
        error: error instanceof Error ? error.message : String(error),
        styleId,
      });
    }
  }

  /**
   * Handle style updates from background
   */
  async onStyleUpdate(styleId: string, style: UserCSSStyle): Promise<void> {
    this.debug("Style update received:", styleId);

    try {
      // Check if style matches current URL
      const matches = domainDetector.matches(this.currentUrl, style.domains);

      if (matches) {
        // Update or apply the style
        await this.applyStyle(style);
      } else {
        // Remove if it was previously applied
        if (this.appliedStyles.has(styleId)) {
          await this.removeStyle(styleId);
        }
      }
    } catch (error) {
      logger.error?.(ErrorSource.CONTENT, "Failed to handle style update", {
        error: error instanceof Error ? error.message : String(error),
        styleId,
      });
    }
  }

  /**
   * Handle style removal
   */
  async onStyleRemove(styleId: string): Promise<void> {
    this.debug("Style removal received:", styleId);

    try {
      if (this.appliedStyles.has(styleId)) {
        await this.removeStyle(styleId);
      }
    } catch (error) {
      logger.error?.(ErrorSource.CONTENT, "Failed to handle style removal", {
        error: error instanceof Error ? error.message : String(error),
        styleId,
      });
    }
  }

  /**
   * Handle variable updates for a specific style
   */
  async onVariablesUpdate(
    styleId: string,
    variables: Record<string, string>,
  ): Promise<void> {
    try {
      const appliedStyle = this.appliedStyles.get(styleId);
      if (!appliedStyle) {
        this.debug("Style not applied, ignoring variable update:", styleId);
        return;
      }

      // Update the style's variables
      const updatedStyle = {
        ...appliedStyle,
        variables: { ...appliedStyle.variables },
      };

      // Update variable values
      for (const [varName, varValue] of Object.entries(variables)) {
        if (updatedStyle.variables[varName]) {
          updatedStyle.variables[varName] = {
            ...updatedStyle.variables[varName],
            value: varValue,
          };
        }
      }

      // Resolve variables in the CSS
      let finalCss = updatedStyle.compiledCss;
      if (updatedStyle.variables && Object.keys(updatedStyle.variables).length > 0) {
        const values: Record<string, string> = {};
        for (const [name, variable] of Object.entries(updatedStyle.variables)) {
          values[name] = variable.value;
        }
        finalCss = resolveVariables(updatedStyle.compiledCss, values);
      }

      // Process external assets
      const assetResult = await this.processExternalAssets(finalCss);
      finalCss = assetResult.css;

      // Preprocess CSS
      finalCss = this.preprocessCSS(finalCss);

      // Update the injected CSS instead of re-injecting
      await cssInjector.update(styleId, finalCss);

      // Update the applied style record
      this.appliedStyles.set(styleId, updatedStyle);

      this.debug("Variables updated and style re-applied:", styleId);
    } catch (error) {
      logger.error?.(ErrorSource.CONTENT, "Failed to handle variable update", {
        error: error instanceof Error ? error.message : String(error),
        styleId,
      });
    }
  }

  /**
   * Check Content Security Policy headers that might affect CSS injection
   */
  private checkCSPHeaders(): void {
    try {
      console.log("[ContentController] Checking CSP headers...");

      // Check meta tag CSP
      const cspMeta = document.querySelector(
        'meta[http-equiv="Content-Security-Policy"]',
      );
      if (cspMeta) {
        console.log(
          "[ContentController] Found CSP meta tag:",
          cspMeta.getAttribute("content"),
        );
      }

      // Try to detect CSP violations by attempting a simple style injection
      const testStyle = document.createElement("style");
      testStyle.textContent = "/* CSP test */";
      document.head.appendChild(testStyle);

      // Remove test style after a short delay
      setTimeout(() => {
        if (testStyle.parentNode) {
          testStyle.parentNode.removeChild(testStyle);
          console.log(
            "[ContentController] CSP test passed - style injection allowed",
          );
        } else {
          console.warn(
            "[ContentController] CSP test failed - style may be blocked",
          );
        }
      }, 100);

      // Check for CSP violation events
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error("[ContentController] CSP violation detected:", {
          violatedDirective: event.violatedDirective,
          blockedURI: event.blockedURI,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
        });
      });
    } catch (error) {
      console.error("[ContentController] Error checking CSP headers:", error);
    }
  }

  /**
   * Preprocess CSS to fix browser compatibility issues
   */
  private preprocessCSS(css: string): string {
    let processedCss = css;

    console.log("[ContentController] Original CSS length:", css.length);
    console.log(
      "[ContentController] Original CSS preview:",
      css.substring(0, 500),
    );

    // Remove @-moz-document rules and extract their content
    // This is crucial for content script CSS injection as @-moz-document is not supported
    let allExtractedContent = "";
    let hasExtractedContent = false;
    let extractionCount = 0;

    // Find all @-moz-document blocks and extract their content
    // Use a more robust regex that handles nested braces properly
    const mozDocumentRegex = /@-moz-document\s+[^{]*\{/g;
    const cssWithoutMozDocument = css;
    let match;

    while ((match = mozDocumentRegex.exec(cssWithoutMozDocument)) !== null) {
      const startIndex = match.index;
      const openBraceIndex = startIndex + match[0].length - 1;

      // Find the matching closing brace
      let braceCount = 1;
      const contentStartIndex = openBraceIndex + 1;
      let currentIndex = contentStartIndex;

      while (currentIndex < cssWithoutMozDocument.length && braceCount > 0) {
        const char = cssWithoutMozDocument[currentIndex];
        if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
        }
        currentIndex++;
      }

      if (braceCount === 0) {
        const content = cssWithoutMozDocument.substring(
          contentStartIndex,
          currentIndex - 1,
        );
        extractionCount++;

        console.log(
          `[ContentController] Extracting @-moz-document block ${extractionCount}`,
          {
            blockLength: content.length,
            preview: content.substring(0, 200),
            startIndex: contentStartIndex,
            endIndex: currentIndex - 1,
          },
        );

        // Clean up the extracted content
        const cleanContent = content.trim();

        // Add the extracted content
        allExtractedContent += cleanContent + "\n\n";
        hasExtractedContent = true;

        // Move past this block
        mozDocumentRegex.lastIndex = currentIndex;
      }
    }

    // If we extracted content, replace the CSS with all extracted content
    if (hasExtractedContent) {
      processedCss = allExtractedContent.trim();
      console.log(
        "[ContentController] Total extracted content length:",
        processedCss.length,
        "from",
        extractionCount,
        "blocks",
      );
      console.log(
        "[ContentController] Extracted content preview:",
        processedCss.substring(0, 500),
      );
    }

    // Fix IE-specific pseudo-selectors that Firefox doesn't understand
    processedCss = processedCss.replace(
      /-ms-input-placeholder/g,
      "::placeholder",
    );

    // Fix old CSS filter syntax (alpha() -> opacity)
    processedCss = processedCss.replace(
      /filter:\s*alpha\(opacity=([^)]+)\)/g,
      (_, opacity) => {
        const opacityValue = parseInt(opacity) / 100;
        return `opacity: ${opacityValue}`;
      },
    );

    // Remove -moz- prefixes that are no longer needed in modern Firefox
    processedCss = processedCss.replace(
      /-moz-(background-clip|box-shadow|border-radius|outline-style)/g,
      "$1",
    );

    // Final cleanup - remove any remaining artifacts
    processedCss = processedCss.replace(/^\s*\*\/\s*\n/, "");
    processedCss = processedCss.replace(/\n\s*\n/g, "\n"); // Remove excessive line breaks
    processedCss = processedCss.replace(/[^}]*{\s*}\s*/g, ""); // Remove empty rules

    console.log("[ContentController] CSS preprocessing completed");
    if (processedCss !== css) {
      console.log("[ContentController] CSS was modified during preprocessing");
      console.log(
        "[ContentController] Original length:",
        css.length,
        "Processed length:",
        processedCss.length,
      );
    }

    return processedCss.trim();
  }



  /**
   * Verify that a style was actually applied to the DOM
   */
   private verifyStyleApplication(styleId: string): void {
    try {
      // Check if style element exists in DOM
      const styleElement = document.querySelector(
        `style[data-eastyles-id="${styleId}"]`,
      );
      console.log(
        `[ContentController] Style ${styleId} found in DOM as style element:`,
        !!styleElement,
      );

      if (styleElement) {
        const sheet = (styleElement as HTMLStyleElement).sheet;
        console.log(
          `[ContentController] Style ${styleId} has CSS sheet:`,
          !!sheet,
        );

        if (sheet) {
          console.log(
            `[ContentController] Style ${styleId} has ${sheet.cssRules.length} CSS rules`,
          );
          // Log first few rules to see if they're valid
          for (let i = 0; i < Math.min(sheet.cssRules.length, 3); i++) {
            console.log(
              `[ContentController] Rule ${i}:`,
              sheet.cssRules[i].cssText,
            );
          }
        }
      }

      // Check if constructable stylesheet was used
      if (document.adoptedStyleSheets) {
        console.log(
          `[ContentController] AdoptedStyleSheets count: ${document.adoptedStyleSheets.length}`,
        );
      }

      // Check if any elements on the page have styles that might be from our CSS
      setTimeout(() => {
        console.log(
          `[ContentController] Page style verification for ${styleId}:`,
        );
        console.log(
          `- Body background:`,
          window.getComputedStyle(document.body).backgroundColor,
        );
        console.log(
          `- Body color:`,
          window.getComputedStyle(document.body).color,
        );

        // Look for common Discord elements that might be styled
        const discordElements = document.querySelectorAll(
          '[class*="header"], [class*="channel"], [class*="message"]',
        );
        if (discordElements.length > 0) {
          console.log(
            `[ContentController] Found ${discordElements.length} potential Discord elements`,
          );
          // Check first few elements
          for (let i = 0; i < Math.min(discordElements.length, 3); i++) {
            const el = discordElements[i] as HTMLElement;
            console.log(
              `[ContentController] Element ${i} classes:`,
              el.className,
            );
            console.log(
              `[ContentController] Element ${i} display:`,
              window.getComputedStyle(el).display,
            );
          }
        }
      }, 200);
    } catch (error) {
      console.error(
        `[ContentController] Error verifying style application for ${styleId}:`,
        error,
      );
    }
  }

  /**
   * Process external assets in CSS content
   */
  private async processExternalAssets(css: string): Promise<{ css: string; assets: ExternalAsset[] }> {
    // Extract external URLs from CSS
    const assets = extractExternalUrls(css);

    if (assets.length === 0) {
      return { css, assets: [] };
    }

    console.log(`[ContentController] Found ${assets.length} external assets to process`);

    // Check if background script is available
    if (!browser.runtime?.id) {
      console.warn("[ContentController] Background script not available for asset processing");
      return { css, assets };
    }

    try {
      // Send assets to background script for processing
      const response = await browser.runtime.sendMessage({
        type: "FETCH_ASSETS",
        payload: { assets },
      }) as {
        success: boolean;
        assets?: ExternalAsset[];
        error?: string;
      };

      if (response.success && response.assets) {
        console.log(`[ContentController] Background processed ${response.assets.filter((a: ExternalAsset) => a.dataUrl).length}/${response.assets.length} assets`);

        // Replace URLs in CSS with data URLs
        let processedCss = css;
        for (const asset of response.assets) {
          if (asset.dataUrl) {
            // Escape special regex characters in URL
            const escapedUrl = asset.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Replace the URL in CSS
            const urlRegex = new RegExp(`url\\(["']?${escapedUrl}["']?\\)`, 'g');
            processedCss = processedCss.replace(urlRegex, `url("${asset.dataUrl}")`);
          }
        }

        return { css: processedCss, assets: response.assets };
      } else {
        console.warn("[ContentController] Background asset processing failed:", response.error);
        return { css, assets };
      }
    } catch (error) {
      console.warn("[ContentController] Failed to communicate with background for asset processing:", error);
      return { css, assets };
    }
  }

  /**
   * Get currently applied styles
   */
  getAppliedStyles(): Map<string, UserCSSStyle> {
    return new Map(this.appliedStyles);
  }
}

// Default instance with debug enabled
export const contentController = new UserCSSContentController(true);
