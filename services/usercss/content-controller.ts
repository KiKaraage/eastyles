/**
 * Content Controller for UserCSS Styles
 *
 * Manages the application of UserCSS styles in content scripts by:
 * - Querying active styles for the current URL
 * - Using DomainDetector to determine style applicability
 * - Coordinating with CSSInjector for style injection
 * - Handling style updates and removals
 */

import { domainDetector } from './domain-detector';
import { UserCSSStyle } from '../storage/schema';
import { logger } from '../errors/logger';
import { ErrorSource } from '../errors/service';
import { cssInjector } from './css-injector';
import { resolveVariables } from './variables';
import { browser } from 'wxt/browser';

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
   * Get currently applied styles
   */
  getAppliedStyles(): Map<string, UserCSSStyle>;
}

export class UserCSSContentController implements ContentController {
   private appliedStyles = new Map<string, UserCSSStyle>();
   private currentUrl = '';
   private debugEnabled = false;
   private performanceEnabled = true;
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
    this.debug('Initializing content controller');

    try {
      // Get current URL
      this.currentUrl = window.location.href;

      // Query active styles for current URL
      await this.queryAndApplyStyles();

      // Set up navigation listener
      this.setupNavigationListener();

      this.debug('Content controller initialized successfully');
    } catch (error) {
      logger.error?.(
        ErrorSource.CONTENT,
        'Failed to initialize content controller',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Set up navigation listener to handle SPA navigation
   */
  private setupNavigationListener(): void {
    // Listen for popstate events (browser back/forward)
    window.addEventListener('popstate', () => {
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
    window.addEventListener('hashchange', () => {
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

    this.debug('Navigation detected:', url);
    this.currentUrl = url;

    try {
      await this.queryAndApplyStyles();
    } catch (error) {
      logger.error?.(
        ErrorSource.CONTENT,
        'Failed to handle navigation',
        {
          error: error instanceof Error ? error.message : String(error),
          url
        }
      );
    }
  }

  /**
   * Query active styles and apply matching ones
   */
   private async queryAndApplyStyles(): Promise<void> {
     const startTime = performance.now();

     try {
       // Query active styles from background
       const activeStyles = await this.queryActiveStyles();

       // Remove styles that no longer match
       await this.removeNonMatchingStyles(activeStyles);

       // Apply new matching styles
       await this.applyMatchingStyles(activeStyles);

       // Log performance
       this.logPerformance('queryAndApplyStyles', startTime);

     } catch (error) {
       logger.error?.(
         ErrorSource.CONTENT,
         'Failed to query and apply styles',
         { error: error instanceof Error ? error.message : String(error) }
       );
     }
   }

  /**
   * Query active styles from background script
   */
   private async queryActiveStyles(): Promise<UserCSSStyle[]> {
     try {
       this.debug('Querying active styles from background');

       // Send message to background script to get styles for current URL
       const response = await browser.runtime.sendMessage({
         type: 'QUERY_STYLES_FOR_URL',
         payload: { url: this.currentUrl }
       });

       if (response.success && response.styles) {
         this.debug(`Received ${response.styles.length} styles from background`);
         return response.styles as UserCSSStyle[];
       } else {
         this.debug('No styles received from background or query failed');
         return [];
       }
     } catch (error) {
       logger.error?.(
         ErrorSource.CONTENT,
         'Failed to query active styles from background',
         {
           error: error instanceof Error ? error.message : String(error),
           url: this.currentUrl
         }
       );
       return [];
     }
   }

  /**
   * Remove styles that no longer match the current URL
   */
  private async removeNonMatchingStyles(activeStyles: UserCSSStyle[]): Promise<void> {
    const activeStyleIds = new Set(activeStyles.map(style => style.id));
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
      this.debug('Removed non-matching styles:', stylesToRemove);
    }
  }

  /**
   * Apply styles that match the current URL
   */
  private async applyMatchingStyles(activeStyles: UserCSSStyle[]): Promise<void> {
    const stylesToApply: UserCSSStyle[] = [];

    for (const style of activeStyles) {
      if (!this.appliedStyles.has(style.id)) {
        // Style not yet applied, check if it matches
        const matches = domainDetector.matches(this.currentUrl, style.domains);
        if (matches) {
          stylesToApply.push(style);
        }
      }
    }

    // Apply matching styles
    for (const style of stylesToApply) {
      await this.applyStyle(style);
    }

    if (stylesToApply.length > 0) {
      this.debug('Applied matching styles:', stylesToApply.map(s => s.id));
    }
  }

  /**
   * Apply a single style
   */
   private async applyStyle(style: UserCSSStyle): Promise<void> {
     try {
       this.debug('Applying style:', style.id);

       // Resolve variables in the CSS
       let finalCss = style.compiledCss;
       if (style.variables && Object.keys(style.variables).length > 0) {
         // Create values object from variable descriptors
         const values: Record<string, string> = {};
         for (const [name, variable] of Object.entries(style.variables)) {
           // Use current value if set, otherwise use default
           values[name] = variable.value || variable.default || '';
         }

         // Resolve variables in CSS
         finalCss = resolveVariables(style.compiledCss, values);
         this.debug('Variables resolved for style:', style.id);
       }

       // Inject the CSS using the CSS injector
       await cssInjector.inject(finalCss, style.id);

       // Mark as applied
       this.appliedStyles.set(style.id, style);

       this.debug('Style applied successfully:', style.id);
     } catch (error) {
       logger.error?.(
         ErrorSource.CONTENT,
         'Failed to apply style',
         {
           error: error instanceof Error ? error.message : String(error),
           styleId: style.id
         }
       );
     }
   }

  /**
   * Remove a single style
   */
   private async removeStyle(styleId: string): Promise<void> {
     try {
       this.debug('Removing style:', styleId);

       // Remove CSS using the CSS injector
       await cssInjector.remove(styleId);

       // Remove from applied styles
       this.appliedStyles.delete(styleId);

       this.debug('Style removed successfully:', styleId);
     } catch (error) {
       logger.error?.(
         ErrorSource.CONTENT,
         'Failed to remove style',
         {
           error: error instanceof Error ? error.message : String(error),
           styleId
         }
       );
     }
   }

  /**
   * Handle style updates from background
   */
  async onStyleUpdate(styleId: string, style: UserCSSStyle): Promise<void> {
    this.debug('Style update received:', styleId);

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
      logger.error?.(
        ErrorSource.CONTENT,
        'Failed to handle style update',
        {
          error: error instanceof Error ? error.message : String(error),
          styleId
        }
      );
    }
  }

  /**
   * Handle style removal
   */
  async onStyleRemove(styleId: string): Promise<void> {
    this.debug('Style removal received:', styleId);

    try {
      if (this.appliedStyles.has(styleId)) {
        await this.removeStyle(styleId);
      }
    } catch (error) {
      logger.error?.(
        ErrorSource.CONTENT,
        'Failed to handle style removal',
        {
          error: error instanceof Error ? error.message : String(error),
          styleId
        }
      );
    }
  }

  /**
   * Get currently applied styles
   */
   getAppliedStyles(): Map<string, UserCSSStyle> {
     return new Map(this.appliedStyles);
   }

   /**
    * Log performance metrics
    */
   private logPerformance(operation: string, startTime: number): void {
     if (!this.performanceEnabled) {
       return;
     }

     const endTime = performance.now();
     const duration = endTime - startTime;

     // Log warning if operation exceeds 200ms budget
     if (duration > 200) {
       logger.error?.(
         ErrorSource.CONTENT,
         `Performance budget exceeded for ${operation}`,
         {
           operation,
           duration: `${duration.toFixed(2)}ms`,
           budget: '200ms'
         }
       );
     } else {
       this.debug(`Performance: ${operation} completed in ${duration.toFixed(2)}ms`);
     }
   }
 }

// Default instance
export const contentController = new UserCSSContentController();