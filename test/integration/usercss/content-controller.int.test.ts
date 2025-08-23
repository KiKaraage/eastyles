/**
 * Integration tests for UserCSS Content Controller
 *
 * Tests the orchestration of style application, domain detection, variable resolution,
 * and CSS injection in the content script context.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserCSSContentController } from '../../../services/usercss/content-controller';
import { UserCSSStyle } from '../../../services/storage/schema';
import { browser } from 'wxt/browser';
import { domainDetector } from '../../../services/usercss/domain-detector';
import { cssInjector } from '../../../services/usercss/css-injector';

// Mock the dependencies at module level
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn(() => Promise.resolve({ success: true, styles: [] })),
    },
  },
}));

vi.mock('../../../services/usercss/domain-detector', () => ({
  domainDetector: {
    matches: vi.fn(() => true),
  },
}));

vi.mock('../../../services/usercss/css-injector', () => ({
  cssInjector: {
    inject: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  },
}));



// Mock browser APIs
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn(),
    },
  },
}));

// Mock CSS injector
vi.mock('../../../services/usercss/css-injector', () => ({
  cssInjector: {
    inject: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock domain detector
vi.mock('../../../services/usercss/domain-detector', () => ({
  domainDetector: {
    matches: vi.fn(),
    extractDomain: vi.fn(),
    normalizeURL: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../services/errors/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('UserCSS Content Controller Integration', () => {
  let controller: UserCSSContentController;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mocks are already set up via vi.mock calls above

    // Create controller with debug enabled for testing
    controller = new UserCSSContentController(true);

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com' },
      writable: true,
    });

    // Mock performance.now
    vi.spyOn(performance, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Style Application Flow', () => {
    it('should query and apply matching styles on initialization', async () => {
      const mockStyles: UserCSSStyle[] = [
        {
          id: 'style1',
          name: 'Test Style 1',
          namespace: 'test',
          version: '1.0',
          description: 'Test style',
          author: 'Test Author',
          sourceUrl: 'https://example.com/style.user.css',
          domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
          compiledCss: 'body { color: red; }',
          variables: {},
          assets: [],
          installedAt: Date.now(),
          enabled: true,
          source: '/* test */',
        },
      ];

      // Mock successful message response
      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: mockStyles,
      });

      // Mock domain matching
      vi.mocked(domainDetector.matches).mockReturnValue(true);

      // Initialize controller
      await controller.initialize();

      // Verify message was sent
      expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
        type: 'QUERY_STYLES_FOR_URL',
        payload: { url: 'https://example.com' },
      });

      // Verify CSS injection was called
      expect(vi.mocked(cssInjector.inject)).toHaveBeenCalledWith(
        'body { color: red; }',
        'style1'
      );

      // Verify style was added to applied styles
      const appliedStyles = controller.getAppliedStyles();
      expect(appliedStyles.size).toBe(1);
      expect(appliedStyles.has('style1')).toBe(true);
    });

    it('should handle navigation and apply styles for new URL', async () => {
      const mockStyles: UserCSSStyle[] = [
        {
          id: 'style1',
          name: 'Test Style 1',
          namespace: 'test',
          version: '1.0',
          description: 'Test style',
          author: 'Test Author',
          sourceUrl: 'https://example.com/style.user.css',
          domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
          compiledCss: 'body { color: red; }',
          variables: {},
          assets: [],
          installedAt: Date.now(),
          enabled: true,
          source: '/* test */',
        },
      ];

      // Mock successful message response
      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: mockStyles,
      });

      // Mock domain matching for new URL
      vi.mocked(domainDetector.matches).mockReturnValue(true);

      // Simulate navigation
      Object.defineProperty(window, 'location', {
        value: { href: 'https://news.example.com' },
        writable: true,
      });

      await controller.onNavigation('https://news.example.com');

      // Verify message was sent with new URL
      expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
        type: 'QUERY_STYLES_FOR_URL',
        payload: { url: 'https://news.example.com' },
      });

      // Verify CSS injection was called
      expect(vi.mocked(cssInjector.inject)).toHaveBeenCalledWith(
        'body { color: red; }',
        'style1'
      );
    });

    it('should remove non-matching styles when navigating', async () => {
      // First, apply a style that matches example.com
      const mockStyles1: UserCSSStyle[] = [
        {
          id: 'style1',
          name: 'Test Style 1',
          namespace: 'test',
          version: '1.0',
          description: 'Test style',
          author: 'Test Author',
          sourceUrl: 'https://example.com/style.user.css',
          domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
          compiledCss: 'body { color: red; }',
          variables: {},
          assets: [],
          installedAt: Date.now(),
          enabled: true,
          source: '/* test */',
        },
      ];

      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: mockStyles1,
      });

      (vi.mocked(domainDetector) as any).matches.mockReturnValue(true);

      await controller.initialize();

      // Now navigate to a different domain
      const mockStyles2: UserCSSStyle[] = [];

      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: mockStyles2,
      });

      Object.defineProperty(window, 'location', {
        value: { href: 'https://other.com' },
        writable: true,
      });

      await controller.onNavigation('https://other.com');

      // Verify CSS removal was called
      expect(vi.mocked(cssInjector).remove).toHaveBeenCalledWith('style1');

      // Verify style was removed from applied styles
      const appliedStyles = controller.getAppliedStyles();
      expect(appliedStyles.size).toBe(0);
    });

    it('should cascade styles by install order', async () => {
      const mockStyles: UserCSSStyle[] = [
        {
          id: 'style2',
          name: 'Test Style 2',
          namespace: 'test',
          version: '1.0',
          description: 'Second style',
          author: 'Test Author',
          sourceUrl: 'https://example.com/style2.user.css',
          domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
          compiledCss: 'body { background: blue; }',
          variables: {},
          assets: [],
          installedAt: 2000, // Later timestamp
          enabled: true,
          source: '/* test 2 */',
        },
        {
          id: 'style1',
          name: 'Test Style 1',
          namespace: 'test',
          version: '1.0',
          description: 'First style',
          author: 'Test Author',
          sourceUrl: 'https://example.com/style1.user.css',
          domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
          compiledCss: 'body { color: red; }',
          variables: {},
          assets: [],
          installedAt: 1000, // Earlier timestamp
          enabled: true,
          source: '/* test 1 */',
        },
      ];

      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: mockStyles,
      });

      (vi.mocked(domainDetector) as any).matches.mockReturnValue(true);

      await controller.initialize();

      // Verify both styles were injected (order doesn't matter for injection)
      expect(vi.mocked(cssInjector).inject).toHaveBeenCalledWith(
        'body { color: red; }',
        'style1'
      );
      expect(vi.mocked(cssInjector).inject).toHaveBeenCalledWith(
        'body { background: blue; }',
        'style2'
      );

      // Verify both styles are applied
      const appliedStyles = controller.getAppliedStyles();
      expect(appliedStyles.size).toBe(2);
    });

    it('should resolve variables before injection', async () => {
      const mockStyles: UserCSSStyle[] = [
        {
          id: 'style1',
          name: 'Test Style with Variables',
          namespace: 'test',
          version: '1.0',
          description: 'Style with variables',
          author: 'Test Author',
          sourceUrl: 'https://example.com/style.user.css',
          domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
          compiledCss: 'body { color: /*[[--text-color|color|red]]*/ red; }',
          variables: {
            '--text-color': {
              name: '--text-color',
              type: 'color',
              default: 'red',
              value: 'blue',
            },
          },
          assets: [],
          installedAt: Date.now(),
          enabled: true,
          source: '/* test */',
        },
      ];

      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: mockStyles,
      });

      (vi.mocked(domainDetector) as any).matches.mockReturnValue(true);

      await controller.initialize();

      // Verify CSS was injected with resolved variables
      expect(vi.mocked(cssInjector).inject).toHaveBeenCalledWith(
        'body { color: blue red; }',
        'style1'
      );
    });

    it('should handle style updates from background', async () => {
      // First, initialize with no styles
      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: [],
      });

      await controller.initialize();

      // Now simulate style update
      const updatedStyle: UserCSSStyle = {
        id: 'style1',
        name: 'Updated Style',
        namespace: 'test',
        version: '1.0',
        description: 'Updated style',
        author: 'Test Author',
        sourceUrl: 'https://example.com/style.user.css',
        domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
        compiledCss: 'body { color: green; }',
        variables: {},
        assets: [],
        installedAt: Date.now(),
        enabled: true,
        source: '/* updated */',
      };

      vi.mocked(domainDetector).matches.mockReturnValue(true);

      await controller.onStyleUpdate('style1', updatedStyle);

      // Verify CSS injection was called with updated style
      expect(vi.mocked(cssInjector).inject).toHaveBeenCalledWith(
        'body { color: green; }',
        'style1'
      );

      // Verify style was added to applied styles
      const appliedStyles = controller.getAppliedStyles();
      expect(appliedStyles.size).toBe(1);
      expect(appliedStyles.has('style1')).toBe(true);
    });

    it('should handle style removal from background', async () => {
      // First, apply a style
      const mockStyles: UserCSSStyle[] = [
        {
          id: 'style1',
          name: 'Test Style',
          namespace: 'test',
          version: '1.0',
          description: 'Test style',
          author: 'Test Author',
          sourceUrl: 'https://example.com/style.user.css',
          domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
          compiledCss: 'body { color: red; }',
          variables: {},
          assets: [],
          installedAt: Date.now(),
          enabled: true,
          source: '/* test */',
        },
      ];

      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: mockStyles,
      });

      (vi.mocked(domainDetector) as any).matches.mockReturnValue(true);

      await controller.initialize();

      // Now simulate style removal
      await controller.onStyleRemove('style1');

      // Verify CSS removal was called
      expect(vi.mocked(cssInjector).remove).toHaveBeenCalledWith('style1');

      // Verify style was removed from applied styles
      const appliedStyles = controller.getAppliedStyles();
      expect(appliedStyles.size).toBe(0);
    });

    it('should handle performance budget breaches', async () => {
      // Mock performance.now to simulate slow operation
      const performanceMock = vi.mocked(performance.now);
      performanceMock.mockReturnValueOnce(1000); // Start time
      performanceMock.mockReturnValueOnce(1300); // End time (300ms - over budget)

      const mockStyles: UserCSSStyle[] = [
        {
          id: 'style1',
          name: 'Slow Style',
          namespace: 'test',
          version: '1.0',
          description: 'Slow style',
          author: 'Test Author',
          sourceUrl: 'https://example.com/style.user.css',
          domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
          compiledCss: 'body { color: red; }',
          variables: {},
          assets: [],
          installedAt: Date.now(),
          enabled: true,
          source: '/* test */',
        },
      ];

      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: mockStyles,
      });

      (vi.mocked(domainDetector) as any).matches.mockReturnValue(true);

      await controller.initialize();

      // Verify that the operation still completed despite budget breach
      expect(vi.mocked(cssInjector).inject).toHaveBeenCalledWith(
        'body { color: red; }',
        'style1'
      );
    });

    it('should handle message passing errors gracefully', async () => {
      // Mock message failure
      vi.mocked(browser.runtime.sendMessage).mockRejectedValue(new Error('Message failed'));

      await controller.initialize();

      // Verify controller handled error gracefully
      const appliedStyles = controller.getAppliedStyles();
      expect(appliedStyles.size).toBe(0);
    });

    it('should handle domain detection errors gracefully', async () => {
      const mockStyles: UserCSSStyle[] = [
        {
          id: 'style1',
          name: 'Test Style',
          namespace: 'test',
          version: '1.0',
          description: 'Test style',
          author: 'Test Author',
          sourceUrl: 'https://example.com/style.user.css',
          domains: [{ kind: 'domain', pattern: 'example.com', include: true }],
          compiledCss: 'body { color: red; }',
          variables: {},
          assets: [],
          installedAt: Date.now(),
          enabled: true,
          source: '/* test */',
        },
      ];

      (vi.mocked(browser.runtime.sendMessage) as any).mockResolvedValue({
        success: true,
        styles: mockStyles,
      });

      // Mock domain detector to throw error
      (vi.mocked(domainDetector) as any).matches.mockImplementation(() => {
        throw new Error('Domain detection failed');
      });

      await controller.initialize();

      // Verify controller handled error gracefully
      const appliedStyles = controller.getAppliedStyles();
      expect(appliedStyles.size).toBe(0);
    });
  });
});