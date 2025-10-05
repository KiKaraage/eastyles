/**
 * Font UserCSS Manager Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FontUserCSSManager } from '../../../services/usercss/font-usercss-manager';

describe('FontUserCSSManager', () => {
  let manager: FontUserCSSManager;

  beforeEach(() => {
    manager = new FontUserCSSManager();
    vi.clearAllMocks();
  });

  describe('installFontStyle', () => {
    it('should install a built-in font style', async () => {
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const installation = await manager.installFontStyle(fontApplication);

      expect(installation.fontApplication).toEqual(fontApplication);
      expect(installation.installationId).toMatch(/^font-builtin-inter-/);
      expect(installation.isActive).toBe(true);
      expect(installation.installedAt).toBeInstanceOf(Date);

      // Check that UserCSS was generated
      expect(installation.generatedUserCSS.userCSS).toContain('Eastyles Font: Inter');
      expect(installation.generatedUserCSS.userCSS).toContain('@font-face');
      expect(installation.generatedUserCSS.userCSS).toContain('font-family:');

      // Check metadata
      expect(installation.generatedUserCSS.meta.name).toBe('Eastyles Font: Inter');
      expect(installation.generatedUserCSS.meta.assets).toHaveLength(1);
    });

    it('should install a custom font style', async () => {
      const fontApplication = {
        fontName: 'Arial',
        fontType: 'custom' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const installation = await manager.installFontStyle(fontApplication);

      expect(installation.fontApplication).toEqual(fontApplication);
      expect(installation.installationId).toMatch(/^font-custom-arial-/);
      expect(installation.isActive).toBe(true);

      // Check that UserCSS was generated without @font-face
      expect(installation.generatedUserCSS.userCSS).toContain('Eastyles Font: Arial');
      expect(installation.generatedUserCSS.userCSS).not.toContain('@font-face');
      expect(installation.generatedUserCSS.userCSS).toContain('font-family:');

      // Check metadata
      expect(installation.generatedUserCSS.meta.name).toBe('Eastyles Font: Arial');
      expect(installation.generatedUserCSS.meta.assets).toHaveLength(0);
    });

    it('should throw error for invalid font application', async () => {
      // Mock the generator to throw an error
      const originalGenerator = manager['generator'];
      manager['generator'] = {
        generateFontUserCSS: vi.fn().mockImplementation(() => {
          throw new Error('Font generation failed');
        })
      } as unknown as typeof manager['generator'];

      const fontApplication = {
        fontName: 'InvalidFont',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      await expect(manager.installFontStyle(fontApplication)).rejects.toThrow(
        'Failed to install font style for InvalidFont'
      );

      // Restore original generator
      manager['generator'] = originalGenerator;
    });
  });

  describe('removeFontStyle', () => {
    it('should remove an installed font style', async () => {
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const installation = await manager.installFontStyle(fontApplication);
      const removed = await manager.removeFontStyle(installation.installationId);

      expect(removed).toBe(true);

      // Verify it's no longer in the manager
      const retrieved = manager.getFontStyleInstallation(installation.installationId);
      expect(retrieved).toBeUndefined();
    });

    it('should return false for non-existent installation', async () => {
      const removed = await manager.removeFontStyle('non-existent-id');
      expect(removed).toBe(false);
    });
  });

  describe('getInstalledFontStyles', () => {
    it('should return all installed font styles', async () => {
      const fontApplication1 = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const fontApplication2 = {
        fontName: 'Arial',
        fontType: 'custom' as const,
        targetElements: 'body',
        cssRule: ''
      };

      await manager.installFontStyle(fontApplication1);
      await manager.installFontStyle(fontApplication2);

      const installedStyles = manager.getInstalledFontStyles();
      expect(installedStyles).toHaveLength(2);

      const fontNames = installedStyles.map(style => style.fontApplication.fontName);
      expect(fontNames).toContain('Inter');
      expect(fontNames).toContain('Arial');
    });

    it('should return empty array when no styles are installed', () => {
      const installedStyles = manager.getInstalledFontStyles();
      expect(installedStyles).toHaveLength(0);
    });
  });

  describe('isFontInstalled', () => {
    it('should return true for installed built-in font', async () => {
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      await manager.installFontStyle(fontApplication);

      expect(manager.isFontInstalled('Inter', 'builtin')).toBe(true);
      expect(manager.isFontInstalled('Inter', 'custom')).toBe(false);
      expect(manager.isFontInstalled('Arial', 'builtin')).toBe(false);
    });

    it('should return true for installed custom font', async () => {
      const fontApplication = {
        fontName: 'Arial',
        fontType: 'custom' as const,
        targetElements: 'body',
        cssRule: ''
      };

      await manager.installFontStyle(fontApplication);

      expect(manager.isFontInstalled('Arial', 'custom')).toBe(true);
      expect(manager.isFontInstalled('Arial', 'builtin')).toBe(false);
    });

    it('should return false for uninstalled fonts', () => {
      expect(manager.isFontInstalled('Inter', 'builtin')).toBe(false);
      expect(manager.isFontInstalled('Arial', 'custom')).toBe(false);
    });
  });

  describe('getFontInstallation', () => {
    it('should return installation for installed font', async () => {
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const installation = await manager.installFontStyle(fontApplication);
      const retrieved = manager.getFontInstallation('Inter', 'builtin');

      expect(retrieved).toEqual(installation);
    });

    it('should return undefined for uninstalled font', () => {
      const retrieved = manager.getFontInstallation('Inter', 'builtin');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('updateFontStyle', () => {
    it('should update an existing font style', async () => {
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const installation = await manager.installFontStyle(fontApplication);

      const updates = {
        targetElements: 'h1, h2, h3'
      };

      const updatedInstallation = await manager.updateFontStyle(installation.installationId, updates);

      expect(updatedInstallation).not.toBeNull();
      expect(updatedInstallation?.fontApplication.targetElements).toBe('h1, h2, h3');
      expect(updatedInstallation?.generatedUserCSS.userCSS).toContain('h1, h2, h3 {');
    });

    it('should return null for non-existent installation', async () => {
      const result = await manager.updateFontStyle('non-existent-id', {
        targetElements: 'body'
      });

      expect(result).toBeNull();
    });
  });

  describe('parseFontFromUserCSS', () => {
    it('should parse font information from UserCSS', () => {
      const userCSS = `/* ==UserStyle==
@name        Eastyles Font: Inter
@namespace   https://eastyles.app
@version     1.0.0
@description Apply Inter font to body
@author      Eastyles
==/UserStyle== */

@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}`;

      const result = manager.parseFontFromUserCSS(userCSS);

      expect(result).toEqual({
        fontName: 'Inter',
        fontType: 'builtin',
        targetElements: 'body',
        cssRule: userCSS
      });
    });

    it('should return null for non-font UserCSS', () => {
      const userCSS = `/* ==UserStyle==
@name        Some Other Style
@namespace   https://example.com
@version     1.0.0
@description Not a font style
@author      Someone
==/UserStyle== */

body {
  color: red;
}`;

      const result = manager.parseFontFromUserCSS(userCSS);
      expect(result).toBeNull();
    });
  });

  describe('generateFontUserCSS', () => {
    it('should generate UserCSS without installing', () => {
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const result = manager.generateFontUserCSS(fontApplication);

      expect(result.userCSS).toContain('Eastyles Font: Inter');
      expect(result.userCSS).toContain('@font-face');
      expect(result.userCSS).toContain('font-family:');
      expect(result.meta.name).toBe('Eastyles Font: Inter');
    });
  });

  describe('getFontStyleStats', () => {
    it('should return correct statistics', async () => {
      const fontApplication1 = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      const fontApplication2 = {
        fontName: 'Arial',
        fontType: 'custom' as const,
        targetElements: 'body',
        cssRule: ''
      };

      await manager.installFontStyle(fontApplication1);
      await manager.installFontStyle(fontApplication2);

      const stats = manager.getFontStyleStats();

      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.builtin).toBe(1);
      expect(stats.custom).toBe(1);
    });

    it('should return zero stats when no styles are installed', () => {
      const stats = manager.getFontStyleStats();

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.builtin).toBe(0);
      expect(stats.custom).toBe(0);
    });
  });

  describe('exportFontStyles and importFontStyles', () => {
    it('should export and import font styles correctly', async () => {
      const fontApplication = {
        fontName: 'Inter',
        fontType: 'builtin' as const,
        targetElements: 'body',
        cssRule: ''
      };

      await manager.installFontStyle(fontApplication);

      // Export font styles
      const exportedStyles = manager.exportFontStyles();
      expect(exportedStyles).toHaveLength(1);
      expect(exportedStyles[0].fontApplication.fontName).toBe('Inter');

      // Clear manager
      await manager.removeFontStyle(exportedStyles[0].installationId);

      // Verify it's cleared
      expect(manager.getInstalledFontStyles()).toHaveLength(0);

      // Import font styles
      await manager.importFontStyles(exportedStyles);

      // Verify it's imported
      const importedStyles = manager.getInstalledFontStyles();
      expect(importedStyles).toHaveLength(1);
      expect(importedStyles[0].fontApplication.fontName).toBe('Inter');
    });
  });
});