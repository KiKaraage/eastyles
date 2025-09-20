/**
 * Font UserCSS Generator
 *
 * Generates UserCSS from font selections and integrates with the existing UserCSS pipeline.
 * This allows fonts to be managed as regular UserCSS styles with persistence and management.
 */

import { browser } from "wxt/browser";
import { FontApplication } from './font-registry';
import { StyleMeta, VariableDescriptor } from './types';

export interface FontUserCSSOptions {
  fontApplication: FontApplication;
  targetSelector?: string; // Default: 'body'
  includeFallbacks?: boolean; // Default: true
  addComments?: boolean; // Default: true
}

export interface GeneratedFontUserCSS {
  userCSS: string;
  meta: StyleMeta;
  variables: VariableDescriptor[];
  fontFaceRules: string[];
}

export class FontUserCSSGenerator {
  /**
   * Generate UserCSS from font application
   */
  generateFontUserCSS(options: FontUserCSSOptions): GeneratedFontUserCSS {
    const {
      fontApplication,
      targetSelector = 'body',
      includeFallbacks = true,
      addComments = true
    } = options;

    const { fontName, fontType, targetElements } = fontApplication;

    // Generate @font-face rules if using built-in font
    const fontFaceRules: string[] = [];
    if (fontType === 'builtin') {
      const fontFaceRule = this.generateFontFaceRule(fontName);
      if (fontFaceRule) {
        fontFaceRules.push(fontFaceRule);
      }
    }

    // Generate CSS rules for font application
    const cssRules = this.generateFontCSSRules({
      fontName,
      fontType,
      targetElements: targetElements || targetSelector,
      includeFallbacks
    });

    // Combine all CSS
    const allCSS = [
      ...fontFaceRules,
      cssRules
    ].join('\n\n');

    // Generate UserCSS with metadata
    const userCSS = this.wrapInUserCSS({
      fontName,
      fontType,
      css: allCSS,
      addComments
    });

    // Generate metadata
    const meta: StyleMeta = {
      id: this.generateFontStyleId(fontName, fontType),
      name: `Eastyles Font: ${fontName}`,
      namespace: 'https://eastyles.app',
      version: '1.0.0',
      description: `Apply ${fontName} font to ${targetElements || targetSelector}`,
      author: 'Eastyles',
      sourceUrl: `eastyles://font/${fontName}`,
      domains: [], // Empty for global font application
      compiledCss: allCSS,
      variables: {},
      assets: fontType === 'builtin' ? [{
        type: 'font',
        url: browser?.runtime?.getURL ?
          browser.runtime.getURL(`/fonts/${fontName}.woff2` as any) :
          `/fonts/${fontName}.woff2`,
        format: 'woff2'
      }] : []
    };

    // Generate variables (for future font customization)
    const variables: VariableDescriptor[] = [];

    return {
      userCSS,
      meta,
      variables,
      fontFaceRules
    };
  }

  /**
    * Generate @font-face rule for built-in font
    */
  private generateFontFaceRule(fontName: string): string | null {
    // This would typically come from the font registry
    // For now, we'll generate a basic @font-face rule
    const fontPath = `/fonts/${fontName}.woff2`;

    // Convert relative path to absolute extension URL
    const absoluteFontPath = browser?.runtime?.getURL ?
      browser.runtime.getURL(fontPath as any) :
      fontPath; // Fallback for non-extension environments

    return `@font-face {
  font-family: '${fontName}';
  src: url('${absoluteFontPath}') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`;
  }

  /**
   * Generate CSS rules for font application
   */
  private generateFontCSSRules(options: {
    fontName: string;
    fontType: 'builtin' | 'custom';
    targetElements: string;
    includeFallbacks: boolean;
  }): string {
    const { fontName, fontType, targetElements, includeFallbacks } = options;

    let fontFamilyValue: string;

    if (fontType === 'builtin') {
      // For built-in fonts, use the font name with appropriate fallbacks
      const fallbacks = includeFallbacks ? this.getFontFallbacks(fontName) : '';
      fontFamilyValue = fallbacks ? `'${fontName}', ${fallbacks}` : `'${fontName}'`;
    } else {
      // For custom fonts, assume they're available on the system
      fontFamilyValue = includeFallbacks ? `'${fontName}', sans-serif` : `'${fontName}'`;
    }

    return `${targetElements} {
  font-family: ${fontFamilyValue} !important;
}`;
  }

  /**
   * Get appropriate fallback fonts for a given font
   */
  private getFontFallbacks(fontName: string): string {
    // This is a simplified fallback system
    // In a real implementation, this would be more sophisticated
    const fallbackMap: Record<string, string> = {
      'Inter': 'system-ui, -apple-system, sans-serif',
      'JetBrains Mono': 'Monaco, Consolas, monospace',
      'Crimson Pro': 'Georgia, serif',
      'default': 'sans-serif'
    };

    return fallbackMap[fontName] || fallbackMap.default;
  }

  /**
   * Wrap CSS in UserCSS format with metadata
   */
  private wrapInUserCSS(options: {
    fontName: string;
    fontType: 'builtin' | 'custom';
    css: string;
    addComments: boolean;
  }): string {
    const { fontName, fontType, css, addComments } = options;

    const metadata = [
      '/* ==UserStyle==',
      `@name        Eastyles Font: ${fontName}`,
      '@namespace   https://eastyles.app',
      '@version     1.0.0',
      `@description Apply ${fontName} font to selected elements`,
      '@author      Eastyles',
      '==/UserStyle== */'
    ].join('\n');

    const comments = addComments ? [
      '',
      '/*',
      ` * Font: ${fontName}`,
      ` * Type: ${fontType}`,
      ' * Generated by Eastyles Font Generator',
      ' */'
    ].join('\n') : '';

    return [metadata, comments, css].filter(Boolean).join('\n\n');
  }

  /**
   * Generate unique ID for font-based UserCSS style
   */
  private generateFontStyleId(fontName: string, fontType: 'builtin' | 'custom'): string {
    const timestamp = Date.now();
    const typePrefix = fontType === 'builtin' ? 'builtin' : 'custom';
    return `font-${typePrefix}-${fontName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}`;
  }

  /**
   * Parse existing UserCSS to extract font information
   */
  parseFontUserCSS(userCSS: string): FontApplication | null {
    // Extract font information from UserCSS
    const fontNameMatch = userCSS.match(/@name\s+Eastyles Font:\s*(.+)/i);
    if (!fontNameMatch) return null;

    const fontName = fontNameMatch[1].trim();

    // Determine font type from CSS content
    const fontType: 'builtin' | 'custom' = userCSS.includes('/fonts/') ? 'builtin' : 'custom';

    // Extract target elements - look for CSS rules that are NOT @font-face
    // Remove the UserCSS metadata block first
    const withoutMetadata = userCSS.replace(/\/\* ==UserStyle==[\s\S]*?==\/UserStyle== \*\/\s*/, '');

    // Find CSS rules that contain font-family but are not @font-face
    const cssRules = withoutMetadata.match(/([^{]+)\s*\{[^}]*font-family:[^}]*\}/g) || [];

    // Filter out @font-face rules and get the first actual CSS rule
    const nonFontFaceRules = cssRules.filter((rule: string) => !rule.includes('@font-face'));
    const targetElements = nonFontFaceRules.length > 0
      ? nonFontFaceRules[0].match(/([^{]+)\s*\{/)?.[1]?.trim() || 'body'
      : 'body';

    return {
      fontName,
      fontType,
      targetElements,
      cssRule: userCSS
    };
  }

  /**
   * Update existing font UserCSS with new options
   */
  updateFontUserCSS(existingUserCSS: string, newOptions: Partial<FontUserCSSOptions>): GeneratedFontUserCSS | null {
    const existingApplication = this.parseFontUserCSS(existingUserCSS);
    if (!existingApplication) return null;

    const updatedOptions: FontUserCSSOptions = {
      fontApplication: existingApplication,
      ...newOptions
    };

    return this.generateFontUserCSS(updatedOptions);
  }
}

// Export singleton instance
export const fontUserCSSGenerator = new FontUserCSSGenerator();