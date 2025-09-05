/**
 * Font Registry Service
 *
 * Manages built-in fonts from public/fonts folder and provides
 * font availability checking for custom user fonts.
 */

export interface BuiltInFont {
  name: string;
  file: string;
  category: "sans-serif" | "serif" | "monospace" | "display" | "handwriting";
  weight: string;
  style: "normal" | "italic";
  description?: string;
}

export interface CustomFont {
  name: string;
  isAvailable: boolean;
  sampleText?: string;
}

export interface FontApplication {
  fontName: string;
  fontType: "builtin" | "custom";
  targetElements: string;
  cssRule: string;
}

/**
 * Built-in fonts registry
 */
const BUILT_IN_FONTS: BuiltInFont[] = [
  {
    name: "Inter",
    file: "Inter.woff2",
    category: "sans-serif",
    weight: "400",
    style: "normal",
    description: "Clean, modern sans-serif font",
  },
  {
    name: "JetBrains Mono",
    file: "JetBrains Mono.woff2",
    category: "monospace",
    weight: "400",
    style: "normal",
    description: "Popular coding font",
  },
  {
    name: "Atkinson Hyperlegible",
    file: "Atkinson Hyperlegible.woff2",
    category: "sans-serif",
    weight: "400",
    style: "normal",
    description: "Highly readable font for accessibility",
  },
  {
    name: "Crimson Pro",
    file: "Crimson Pro.woff2",
    category: "serif",
    weight: "400",
    style: "normal",
    description: "Elegant serif font for reading",
  },
  {
    name: "Outfit",
    file: "Outfit.woff2",
    category: "sans-serif",
    weight: "400",
    style: "normal",
    description: "Modern geometric sans-serif",
  },
  {
    name: "Jost",
    file: "Jost.woff2",
    category: "sans-serif",
    weight: "400",
    style: "normal",
    description: "Clean, contemporary sans-serif",
  },
  {
    name: "Parkinsans",
    file: "Parkinsans.woff2",
    category: "sans-serif",
    weight: "400",
    style: "normal",
    description: "Friendly, approachable sans-serif",
  },
  {
    name: "SUSE",
    file: "SUSE.woff2",
    category: "sans-serif",
    weight: "400",
    style: "normal",
    description: "Professional corporate font",
  },
  {
    name: "Unbounded",
    file: "Unbounded.woff2",
    category: "display",
    weight: "400",
    style: "normal",
    description: "Bold, attention-grabbing display font",
  },
  {
    name: "Fraunces",
    file: "Fraunces.woff2",
    category: "serif",
    weight: "400",
    style: "normal",
    description: "Soft, warm serif font",
  },
  {
    name: "Faculty Glyphic",
    file: "Faculty Glyphic.woff2",
    category: "display",
    weight: "400",
    style: "normal",
    description: "Decorative display font",
  },
  {
    name: "Henny Penny",
    file: "Henny Penny.woff2",
    category: "display",
    weight: "400",
    style: "normal",
    description: "Playful, handwritten-style font",
  },
  {
    name: "Kode Mono",
    file: "Kode Mono.woff2",
    category: "monospace",
    weight: "400",
    style: "normal",
    description: "Modern monospace font",
  },
  {
    name: "Caveat",
    file: "Caveat.woff2",
    category: "handwriting",
    weight: "400",
    style: "normal",
    description: "Casual handwriting font",
  },
  {
    name: "Playwrite IN",
    file: "Playwrite IN.woff2",
    category: "handwriting",
    weight: "400",
    style: "normal",
    description: "Educational handwriting font",
  },
];

/**
 * Font Registry Service Class
 */
export class FontRegistryService {
  private builtInFonts: BuiltInFont[] = BUILT_IN_FONTS;
  private customFonts: Map<string, CustomFont> = new Map();

  /**
   * Get all built-in fonts
   */
  getBuiltInFonts(): BuiltInFont[] {
    return [...this.builtInFonts];
  }

  /**
   * Get built-in fonts by category
   */
  getBuiltInFontsByCategory(category: BuiltInFont["category"]): BuiltInFont[] {
    return this.builtInFonts.filter((font) => font.category === category);
  }

  /**
   * Get font file path for built-in font
   */
  getFontFilePath(fontName: string): string | null {
    const font = this.builtInFonts.find((f) => f.name === fontName);
    return font ? `/fonts/${font.file}` : null;
  }

  /**
   * Check if a custom font is available
   */
  async checkFontAvailability(fontName: string): Promise<boolean> {
    if (typeof document === "undefined" || typeof window === "undefined") {
      console.debug(
        "Font detection: Document or window not available, returning false",
      );
      return false;
    }

    try {
      // Create a temporary element to test font loading
      const testElement = document.createElement("span");
      testElement.style.fontFamily = `'${fontName}', monospace`;
      testElement.style.fontSize = "12px";
      testElement.style.position = "absolute";
      testElement.style.left = "-9999px";
      testElement.style.top = "-9999px";
      testElement.textContent = "Test";
      testElement.setAttribute("aria-hidden", "true");

      document.body.appendChild(testElement);

      // Use canvas to measure text width with the font
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.debug("Font detection: Canvas context not available");
        document.body.removeChild(testElement);
        return false;
      }

      // Measure width with the test font
      ctx.font = `12px '${fontName}', monospace`;
      const widthWithFont = ctx.measureText("Test").width;

      // Measure width with fallback font
      ctx.font = "12px monospace";
      const widthWithFallback = ctx.measureText("Test").width;

      document.body.removeChild(testElement);

      // If widths are different, the font is likely available
      const isAvailable = Math.abs(widthWithFont - widthWithFallback) > 0.1;
      console.debug(`Font detection result for "${fontName}": ${isAvailable}`);
      return isAvailable;
    } catch (error) {
      console.warn(`Font availability check failed for "${fontName}":`, error);
      return false;
    }
  }

  /**
   * Add a custom font to the registry
   */
  async addCustomFont(fontName: string): Promise<CustomFont> {
    const isAvailable = await this.checkFontAvailability(fontName);
    const customFont: CustomFont = {
      name: fontName,
      isAvailable,
      sampleText: isAvailable ? fontName : undefined,
    };

    this.customFonts.set(fontName, customFont);
    return customFont;
  }

  /**
   * Get a custom font from the registry
   */
  getCustomFont(fontName: string): CustomFont | undefined {
    return this.customFonts.get(fontName);
  }

  /**
   * Remove a custom font from the registry
   */
  removeCustomFont(fontName: string): boolean {
    return this.customFonts.delete(fontName);
  }

  /**
   * Generate UserCSS for font application
   */
  generateFontUserCSS(application: FontApplication): string {
    const { fontName, fontType, targetElements } = application;

    let fontFaceRule = "";
    let fontFamilyRule = "";

    if (fontType === "builtin") {
      const font = this.builtInFonts.find((f) => f.name === fontName);
      if (!font) {
        throw new Error(`Built-in font "${fontName}" not found`);
      }

      const fontPath = this.getFontFilePath(fontName);
      if (!fontPath) {
        throw new Error(`Font file path not found for "${fontName}"`);
      }

      fontFaceRule = `
@font-face {
  font-family: '${fontName}';
  src: url('${fontPath}') format('woff2');
  font-weight: ${font.weight};
  font-style: ${font.style};
  font-display: swap;
}`;

      fontFamilyRule = `
${targetElements} {
  font-family: '${fontName}', ${font.category};
}`;
    } else {
      // Custom font - assume it's already available on the system
      fontFamilyRule = `
${targetElements} {
  font-family: '${fontName}', sans-serif;
}`;
    }

    return `/* ==UserStyle==
@name        Eastyles Font: ${fontName}
@namespace   https://eastyles.app
@version     1.0.0
@description Apply ${fontName} font to ${targetElements}
@author      Eastyles
==/UserStyle== */

${fontFaceRule}
${fontFamilyRule}`;
  }

  /**
   * Get font categories for UI organization
   */
  getFontCategories(): BuiltInFont["category"][] {
    return ["sans-serif", "serif", "monospace", "display", "handwriting"];
  }

  /**
   * Get sample text for font preview
   */
  getSampleText(): string {
    return "Aa";
  }
}

// Export singleton instance
export const fontRegistry = new FontRegistryService();
