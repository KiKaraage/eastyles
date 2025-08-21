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
    try {
      // Query active styles from background
      const activeStyles = await this.queryActiveStyles();

      // Remove styles that no longer match
      await this.removeNonMatchingStyles(activeStyles);

      // Apply new matching styles
      await this.applyMatchingStyles(activeStyles);

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
    // TODO: Implement message passing to background to get active styles
    // For now, return empty array
    this.debug('Querying active styles (TODO: implement message passing)');
    return [];
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
      // TODO: Implement CSS injection
      this.debug('Applying style (TODO: implement CSS injection):', style.id);

      // Mark as applied
      this.appliedStyles.set(style.id, style);

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
      // TODO: Implement CSS removal
      this.debug('Removing style (TODO: implement CSS removal):', styleId);

      // Remove from applied styles
      this.appliedStyles.delete(styleId);

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
}

// Default instance
export const contentController = new UserCSSContentController();