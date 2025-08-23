/**
 * Font UserCSS Round-trip Integration Tests
 *
 * Tests the complete flow: generation → install → injection verification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FontUserCSSManager } from '../../../services/usercss/font-usercss-manager';
import { FontUserCSSGenerator } from '../../../services/usercss/font-usercss-generator';

describe('Font UserCSS Round-trip Integration', () => {
  let manager: FontUserCSSManager;
  let generator: FontUserCSSGenerator;

  beforeEach(() => {
    manager = new FontUserCSSManager();
    generator = new FontUserCSSGenerator();
    vi.clearAllMocks();
  });

  describe('Complete Font Style Lifecycle', () => {
    it('should complete full round-trip: generate → install → verify → remove', async () => {
      // Step 1: Generate UserCSS from font application
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const generatedUserCSS = generator.generateFontUserCSS({
        fontApplication,
        targetSelector: 'body',
        includeFallbacks: true,
        addComments: true
      });

      // Verify generation
      expect(generatedUserCSS.userCSS).toContain('/* ==UserStyle==');
      expect(generatedUserCSS.userCSS).toContain('@name        Eastyles Font: Inter');
      expect(generatedUserCSS.userCSS).toContain('@font-face');
      expect(generatedUserCSS.userCSS).toContain('font-family:');
      expect(generatedUserCSS.meta.name).toBe('Eastyles Font: Inter');
      expect(generatedUserCSS.meta.id).toMatch(/^font-builtin-inter-/);

      // Step 2: Install the font style
      const installation = await manager.installFontStyle(fontApplication);

      // Verify installation
      expect(installation.installationId).toMatch(/^font-builtin-inter-/);
      expect(installation.isActive).toBe(true);
      expect(installation.fontApplication).toEqual(fontApplication);
      expect(installation.generatedUserCSS.userCSS).toBe(generatedUserCSS.userCSS);

      // Verify it's in the manager
      const retrievedInstallation = manager.getFontStyleInstallation(installation.installationId);
      expect(retrievedInstallation).toEqual(installation);

      // Verify font is marked as installed
      expect(manager.isFontInstalled('Inter', 'builtin')).toBe(true);
      expect(manager.isFontInstalled('Inter', 'custom')).toBe(false);

      // Step 3: Verify UserCSS can be parsed back to font application
      const parsedApplication = manager.parseFontFromUserCSS(generatedUserCSS.userCSS);
      expect(parsedApplication).toEqual({
        fontName: 'Inter',
        fontType: 'builtin',
        targetElements: 'body',
        cssRule: generatedUserCSS.userCSS
      });

      // Step 4: Test updating the font style
      const updatedInstallation = await manager.updateFontStyle(installation.installationId, {
        targetElements: 'h1, h2, h3'
      });

      expect(updatedInstallation).not.toBeNull();
      expect(updatedInstallation?.fontApplication.targetElements).toBe('h1, h2, h3');
      expect(updatedInstallation?.generatedUserCSS.userCSS).toContain('h1, h2, h3 {');

      // Step 5: Remove the font style
      const removed = await manager.removeFontStyle(installation.installationId);
      expect(removed).toBe(true);

      // Verify removal
      const afterRemoval = manager.getFontStyleInstallation(installation.installationId);
      expect(afterRemoval).toBeUndefined();
      expect(manager.isFontInstalled('Inter', 'builtin')).toBe(false);

      // Verify stats are updated
      const stats = manager.getFontStyleStats();
      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
    });

    it('should handle multiple font styles simultaneously', async () => {
      const fontApplications = [
        {
          fontName: 'Inter',
          fontType: 'builtin' as const,
          targetElements: 'body',
          cssRule: ''
        },
        {
          fontName: 'JetBrains Mono',
          fontType: 'builtin' as const,
          targetElements: 'code, pre',
          cssRule: ''
        },
        {
          fontName: 'Arial',
          fontType: 'custom' as const,
          targetElements: 'p',
          cssRule: ''
        }
      ];

      // Install all fonts
      const installations = await Promise.all(
        fontApplications.map(app => manager.installFontStyle(app))
      );

      expect(installations).toHaveLength(3);

      // Verify all are installed
      const installedStyles = manager.getInstalledFontStyles();
      expect(installedStyles).toHaveLength(3);

      const fontNames = installedStyles.map(style => style.fontApplication.fontName);
      expect(fontNames).toContain('Inter');
      expect(fontNames).toContain('JetBrains Mono');
      expect(fontNames).toContain('Arial');

      // Verify stats
      const stats = manager.getFontStyleStats();
      expect(stats.total).toBe(3);
      expect(stats.active).toBe(3);
      expect(stats.builtin).toBe(2);
      expect(stats.custom).toBe(1);

      // Test individual font lookups
      expect(manager.isFontInstalled('Inter', 'builtin')).toBe(true);
      expect(manager.isFontInstalled('JetBrains Mono', 'builtin')).toBe(true);
      expect(manager.isFontInstalled('Arial', 'custom')).toBe(true);

      // Remove one font
      await manager.removeFontStyle(installations[0].installationId);

      // Verify updated state
      const updatedStats = manager.getFontStyleStats();
      expect(updatedStats.total).toBe(2);
      expect(updatedStats.builtin).toBe(1);
      expect(manager.isFontInstalled('Inter', 'builtin')).toBe(false);
      expect(manager.isFontInstalled('JetBrains Mono', 'builtin')).toBe(true);
    });

    it('should handle export and import of font styles', async () => {
      // Install some fonts
      const fontApplications = [
        {
          fontName: 'Inter',
          fontType: 'builtin' as const,
          targetElements: 'body',
          cssRule: ''
        },
        {
          fontName: 'Arial',
          fontType: 'custom' as const,
          targetElements: 'p',
          cssRule: ''
        }
      ];

      await Promise.all(
        fontApplications.map(app => manager.installFontStyle(app))
      );

      // Export font styles
      const exportedStyles = manager.exportFontStyles();
      expect(exportedStyles).toHaveLength(2);

      // Verify export structure
      exportedStyles.forEach(exportedStyle => {
        expect(exportedStyle).toHaveProperty('installationId');
        expect(exportedStyle).toHaveProperty('fontApplication');
        expect(exportedStyle).toHaveProperty('installedAt');
        expect(exportedStyle).toHaveProperty('isActive');
        expect(typeof exportedStyle.installedAt).toBe('string');
      });

      // Clear manager
      const installationIds = exportedStyles.map(style => style.installationId);
      await Promise.all(installationIds.map(id => manager.removeFontStyle(id)));

      // Verify cleared
      expect(manager.getInstalledFontStyles()).toHaveLength(0);

      // Import font styles
      await manager.importFontStyles(exportedStyles);

      // Verify imported
      const importedStyles = manager.getInstalledFontStyles();
      expect(importedStyles).toHaveLength(2);

      const importedFontNames = importedStyles.map(style => style.fontApplication.fontName);
      expect(importedFontNames).toContain('Inter');
      expect(importedFontNames).toContain('Arial');

      // Verify stats
      const stats = manager.getFontStyleStats();
      expect(stats.total).toBe(2);
      expect(stats.builtin).toBe(1);
      expect(stats.custom).toBe(1);
    });

    it('should handle font style updates with different configurations', async () => {
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const installation = await manager.installFontStyle(fontApplication);

      // Test various updates
      const updateScenarios = [
        { targetElements: 'h1, h2, h3' },
        { targetElements: '.content' },
        { targetElements: 'article, section' }
      ];

      for (const update of updateScenarios) {
        const updatedInstallation = await manager.updateFontStyle(installation.installationId, update);

        expect(updatedInstallation).not.toBeNull();
        expect(updatedInstallation?.fontApplication.targetElements).toBe(update.targetElements);
        expect(updatedInstallation?.generatedUserCSS.userCSS).toContain(`${update.targetElements} {`);
      }

      // Verify final state
      const finalInstallation = manager.getFontStyleInstallation(installation.installationId);
      expect(finalInstallation?.fontApplication.targetElements).toBe('article, section');
    });

    it('should generate valid UserCSS that can be processed by the UserCSS pipeline', async () => {
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const installation = await manager.installFontStyle(fontApplication);

      // The generated UserCSS should be valid and contain all necessary components
      const userCSS = installation.generatedUserCSS.userCSS;

      // Should contain UserCSS metadata
      expect(userCSS).toContain('/* ==UserStyle==');
      expect(userCSS).toContain('@name        Eastyles Font: Inter');
      expect(userCSS).toContain('@namespace   https://eastyles.app');
      expect(userCSS).toContain('@version     1.0.0');
      expect(userCSS).toContain('@author      Eastyles');
      expect(userCSS).toContain('==/UserStyle==');

      // Should contain @font-face for built-in fonts
      expect(userCSS).toContain('@font-face');
      expect(userCSS).toContain("font-family: 'Inter'");
      expect(userCSS).toContain('/assets/fonts/Inter.woff2');

      // Should contain CSS rules
      expect(userCSS).toContain('body {');
      expect(userCSS).toContain('font-family:');

      // Should be parseable back to font application
      const parsed = manager.parseFontFromUserCSS(userCSS);
      expect(parsed?.fontName).toBe('Inter');
      expect(parsed?.fontType).toBe('builtin');
      expect(parsed?.targetElements).toBe('body');
    });
  });
});