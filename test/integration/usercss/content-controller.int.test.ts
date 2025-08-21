/**
 * Integration tests for Content Controller
 * Tests the integration between DomainDetector and content script functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserCSSContentController } from '../../../services/usercss/content-controller';
import { UserCSSStyle } from '../../../services/storage/schema';

describe('Content Controller Integration', () => {
  let controller: UserCSSContentController;

  // Mock window.location
  const mockLocation = {
    href: 'https://example.com/page',
    hostname: 'example.com',
    pathname: '/page',
    search: '',
    hash: '',
  };

  beforeEach(() => {
    controller = new UserCSSContentController(true); // Enable debug

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
    });

    // Mock history methods
    vi.spyOn(history, 'pushState').mockImplementation(() => {});
    vi.spyOn(history, 'replaceState').mockImplementation(() => {});

    // Mock browser.runtime
    vi.mock('@wxt-dev/browser', () => ({
      browser: {
        runtime: {
          onMessage: {
            addListener: vi.fn(),
          },
        },
      },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(controller.initialize()).resolves.toBeUndefined();
      expect(controller.getAppliedStyles().size).toBe(0);
    });

    it('should set up navigation listeners', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      await controller.initialize();

      expect(addEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock window.location to throw error
      Object.defineProperty(window, 'location', {
        get: () => { throw new Error('Location error'); },
        set: () => {},
      });

      await expect(controller.initialize()).resolves.toBeUndefined();
    });
  });

  describe('Navigation Handling', () => {
    it('should handle navigation to new URL', async () => {
      await controller.initialize();

      const newUrl = 'https://test.com/newpage';
      mockLocation.href = newUrl;

      await controller.onNavigation(newUrl);

      // Should not throw
      expect(controller.getAppliedStyles().size).toBe(0);
    });

    it('should ignore navigation to same URL', async () => {
      await controller.initialize();

      const currentUrl = window.location.href;
      await controller.onNavigation(currentUrl);

      // Should not throw and should not change state
      expect(controller.getAppliedStyles().size).toBe(0);
    });

    it('should handle navigation errors gracefully', async () => {
      await controller.initialize();

      // Mock queryAndApplyStyles to throw error
      const originalQueryAndApplyStyles = (controller as any).queryAndApplyStyles;
      (controller as any).queryAndApplyStyles = vi.fn().mockRejectedValue(new Error('Query error'));

      await expect(controller.onNavigation('https://error.com')).resolves.toBeUndefined();

      // Restore original method
      (controller as any).queryAndApplyStyles = originalQueryAndApplyStyles;
    });
  });

  describe('Style Management', () => {
    const mockStyle: UserCSSStyle = {
      id: 'test-style',
      name: 'Test Style',
      namespace: 'test',
      version: '1.0.0',
      description: 'A test style',
      author: 'Test Author',
      sourceUrl: 'https://example.com/test.user.css',
      domains: [
        { kind: 'domain', pattern: 'example.com', include: true }
      ],
      compiledCss: 'body { color: red; }',
      variables: {},
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: '/* ==UserStyle==\n@name Test Style\n==/UserStyle== */\nbody { color: red; }',
    };

    it('should handle style updates for matching URL', async () => {
      await controller.initialize();

      // Mock current URL to match style domain
      mockLocation.href = 'https://example.com/page';
      await controller.onNavigation('https://example.com/page');

      // Mock domainDetector to return true for matching
      const matchesSpy = vi.spyOn(controller.domainDetector, 'matches').mockReturnValue(true);

      await controller.onStyleUpdate(mockStyle.id, mockStyle);

      // Style should be applied (though actual injection is mocked)
      expect(controller.getAppliedStyles().has(mockStyle.id)).toBe(true);
      expect(matchesSpy).toHaveBeenCalledWith('https://example.com/page', mockStyle.domains);

      matchesSpy.mockRestore();
    });

    it('should handle style updates for non-matching URL', async () => {
      await controller.initialize();

      // Mock current URL to not match style domain
      mockLocation.href = 'https://other.com/page';
      await controller.onNavigation('https://other.com/page');

      // Mock domainDetector to return false for non-matching
      const matchesSpy = vi.spyOn(controller.domainDetector, 'matches').mockReturnValue(false);

      await controller.onStyleUpdate(mockStyle.id, mockStyle);

      // Style should not be applied
      expect(controller.getAppliedStyles().has(mockStyle.id)).toBe(false);
      expect(matchesSpy).toHaveBeenCalledWith('https://other.com/page', mockStyle.domains);

      matchesSpy.mockRestore();
    });

    it('should handle style removal', async () => {
      await controller.initialize();

      // First add a style by mocking domainDetector
      mockLocation.href = 'https://example.com/page';
      const matchesSpy = vi.spyOn(controller.domainDetector, 'matches').mockReturnValue(true);
      await controller.onStyleUpdate(mockStyle.id, mockStyle);
      expect(controller.getAppliedStyles().has(mockStyle.id)).toBe(true);

      // Then remove it
      await controller.onStyleRemove(mockStyle.id);
      expect(controller.getAppliedStyles().has(mockStyle.id)).toBe(false);

      matchesSpy.mockRestore();
    });

    it('should handle style removal for non-existent style', async () => {
      await controller.initialize();

      await expect(controller.onStyleRemove('non-existent')).resolves.toBeUndefined();
    });

    it('should handle style update errors gracefully', async () => {
      await controller.initialize();

      // Mock domainDetector to throw error
      const matchesSpy = vi.spyOn(controller.domainDetector, 'matches').mockImplementation(() => {
        throw new Error('Domain detection error');
      });

      await expect(controller.onStyleUpdate(mockStyle.id, mockStyle)).resolves.toBeUndefined();

      matchesSpy.mockRestore();
    });
  });

  describe('Applied Styles Tracking', () => {
    it('should return copy of applied styles map', async () => {
      await controller.initialize();

      const appliedStyles = controller.getAppliedStyles();
      expect(appliedStyles).toBeInstanceOf(Map);
      expect(appliedStyles.size).toBe(0);

      // Modifying the returned map should not affect internal state
      appliedStyles.set('test', {} as UserCSSStyle);
      expect(controller.getAppliedStyles().size).toBe(0);
    });
  });

  describe('Event Listeners', () => {
    it('should handle popstate events', async () => {
      await controller.initialize();

      const onNavigationSpy = vi.spyOn(controller, 'onNavigation');

      // Simulate popstate event
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

      expect(onNavigationSpy).toHaveBeenCalledWith(window.location.href);
    });

    it('should handle hashchange events', async () => {
      await controller.initialize();

      const onNavigationSpy = vi.spyOn(controller, 'onNavigation');

      // Simulate hashchange event
      window.dispatchEvent(new HashChangeEvent('hashchange', {
        oldURL: 'https://example.com/page',
        newURL: 'https://example.com/page#newhash'
      }));

      expect(onNavigationSpy).toHaveBeenCalledWith(window.location.href);
    });

    it('should handle pushState calls', async () => {
      await controller.initialize();

      const onNavigationSpy = vi.spyOn(controller, 'onNavigation');

      // Simulate pushState call
      history.pushState({}, '', '/newpage');

      expect(onNavigationSpy).toHaveBeenCalledWith(window.location.href);
    });

    it('should handle replaceState calls', async () => {
      await controller.initialize();

      const onNavigationSpy = vi.spyOn(controller, 'onNavigation');

      // Simulate replaceState call
      history.replaceState({}, '', '/replaced');

      expect(onNavigationSpy).toHaveBeenCalledWith(window.location.href);
    });
  });
});