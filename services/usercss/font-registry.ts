/**
 * Font Registry Service
 *
 * Manages built-in fonts from public/fonts folder and provides
 * font availability checking for custom user fonts.
 */

import { browser, type PublicPath } from "wxt/browser";

export interface BuiltInFont {
  name: string;
  file: string;
  category: "sans" | "serif" | "techno" | "playful" | "custom";
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
  domain?: string;
}

/**
 * Built-in fonts registry
 */
const BUILT_IN_FONTS: BuiltInFont[] = [
  {
    name: "Alan Sans",
    file: "Alan Sans.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Clean, modern sans-serif font",
  },
  {
    name: "Atkinson Hyperlegible Mono",
    file: "Atkinson Hyperlegible Mono.woff2",
    category: "techno",
    weight: "400",
    style: "normal",
    description: "Highly readable monospace font for accessibility",
  },
  {
    name: "Atkinson Hyperlegible Next",
    file: "Atkinson Hyperlegible Next.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Highly readable font for accessibility",
  },
  {
    name: "Cairo",
    file: "Cairo.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Contemporary sans-serif with Arabic support",
  },
  {
    name: "Chivo",
    file: "Chivo.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Humanist sans-serif with distinctive character",
  },
  {
    name: "Cormorant Garamond",
    file: "Cormorant Garamond.woff2",
    category: "serif",
    weight: "400",
    style: "normal",
    description: "Elegant serif font inspired by Garamond",
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
    name: "Faculty Glyphic",
    file: "Faculty Glyphic.woff2",
    category: "serif",
    weight: "400",
    style: "normal",
    description: "Decorative display font",
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
    name: "Grandstander",
    file: "Grandstander.woff2",
    category: "playful",
    weight: "400",
    style: "normal",
    description: "Bold, playful display font",
  },
  {
    name: "Handjet",
    file: "Handjet.woff2",
    category: "techno",
    weight: "400",
    style: "normal",
    description: "Handwritten-style monospace font",
  },
  {
    name: "Henny Penny",
    file: "Henny Penny.woff2",
    category: "playful",
    weight: "400",
    style: "normal",
    description: "Playful, handwritten-style font",
  },
  {
    name: "Instrument Sans",
    file: "Instrument Sans.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Geometric sans-serif with technical feel",
  },
  {
    name: "JetBrains Mono",
    file: "JetBrains Mono.woff2",
    category: "techno",
    weight: "400",
    style: "normal",
    description: "Popular coding font",
  },
  {
    name: "Jost",
    file: "Jost.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Clean, contemporary sans-serif",
  },
  {
    name: "Kode Mono",
    file: "Kode Mono.woff2",
    category: "techno",
    weight: "400",
    style: "normal",
    description: "Modern monospace font",
  },
  {
    name: "Merriweather",
    file: "Merriweather.woff2",
    category: "serif",
    weight: "400",
    style: "normal",
    description: "Classic serif font for reading",
  },
  {
    name: "MuseoModerno",
    file: "MuseoModerno.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Modern geometric sans-serif",
  },
  {
    name: "OpenDyslexic",
    file: "OpenDyslexic.woff2",
    category: "playful",
    weight: "400",
    style: "normal",
    description: "Font designed for dyslexia accessibility",
  },
  {
    name: "Outfit",
    file: "Outfit.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Modern geometric sans-serif",
  },
  {
    name: "Parkinsans",
    file: "Parkinsans.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Friendly, approachable sans-serif",
  },
  {
    name: "Playpen Sans",
    file: "Playpen Sans.woff2",
    category: "playful",
    weight: "400",
    style: "normal",
    description: "Playful handwriting font",
  },
  {
    name: "Playwrite IN",
    file: "Playwrite IN.woff2",
    category: "playful",
    weight: "400",
    style: "normal",
    description: "Educational handwriting font",
  },
  {
    name: "Shantell Sans",
    file: "Shantell Sans.woff2",
    category: "playful",
    weight: "400",
    style: "normal",
    description: "Warm, handwritten sans-serif",
  },
  {
    name: "SUSE",
    file: "SUSE.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Professional corporate font",
  },
  {
    name: "Unbounded",
    file: "Unbounded.woff2",
    category: "sans",
    weight: "400",
    style: "normal",
    description: "Bold, attention-grabbing display font",
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
    // Check if we're in a browser extension context with DOM access
    // Background scripts don't have window/document, so we can't check font availability there
    let hasDocument = false;
    let hasWindow = false;
    try {
      hasDocument = typeof globalThis.document !== "undefined";
      hasWindow = typeof globalThis.window !== "undefined";
    } catch {
      console.debug(
        "Font detection: DOM not available (likely background context), returning false",
      );
      return false;
    }

    if (!hasDocument || !hasWindow) {
      console.debug(
        "Font detection: DOM not available (likely background context), returning false",
      );
      return false;
    }

    // Additional checks for window and document objects
    if (!globalThis.window || !globalThis.document) {
      console.debug(
        "Font detection: window or document not available, returning false",
      );
      return false;
    }

    // Check if document is fully initialized
    if (!globalThis.document.body || !globalThis.document.head) {
      console.debug(
        "Font detection: document not fully initialized, returning false",
      );
      return false;
    }

    try {
      // Use document.fonts.check if available (modern browsers)
      if (
        globalThis.document.fonts &&
        typeof globalThis.document.fonts.check === "function"
      ) {
        const isAvailable = globalThis.document.fonts.check(
          `12px "${fontName}"`,
        );
        console.debug(
          `Font detection result for "${fontName}" using document.fonts.check: ${isAvailable}`,
        );
        return isAvailable;
      }

      // Fallback to canvas-based detection
      // Check if DOM methods are available
      if (typeof globalThis.document.createElement !== "function") {
        console.debug("Font detection: document.createElement not available");
        return false;
      }

      // Create a temporary element to test font loading
      const testElement = globalThis.document.createElement("span");
      testElement.style.fontFamily = `'${fontName}', monospace`;
      testElement.style.fontSize = "12px";
      testElement.style.position = "absolute";
      testElement.style.left = "-9999px";
      testElement.style.top = "-9999px";
      testElement.textContent = "Test";
      testElement.setAttribute("aria-hidden", "true");

      // Double-check document.body exists before using it
      if (
        !globalThis.document.body ||
        typeof globalThis.document.body.appendChild !== "function"
      ) {
        console.debug(
          "Font detection: document.body or appendChild not available",
        );
        return false;
      }

      globalThis.document.body.appendChild(testElement);

      // Use canvas to measure text width with the font
      const canvas = globalThis.document.createElement("canvas");
      if (typeof canvas.getContext !== "function") {
        console.debug("Font detection: canvas.getContext not available");
        if (
          globalThis.document.body &&
          typeof globalThis.document.body.removeChild === "function"
        ) {
          globalThis.document.body.removeChild(testElement);
        }
        return false;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.debug("Font detection: Canvas context not available");
        if (
          globalThis.document.body &&
          typeof globalThis.document.body.removeChild === "function"
        ) {
          globalThis.document.body.removeChild(testElement);
        }
        return false;
      }

      // Wait a bit for font to load
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Measure width with the test font
      ctx.font = `12px '${fontName}', monospace`;
      const widthWithFont = ctx.measureText(
        "The quick brown fox jumps over the lazy dog",
      ).width;

      // Measure width with fallback font
      ctx.font = "12px monospace";
      const widthWithFallback = ctx.measureText(
        "The quick brown fox jumps over the lazy dog",
      ).width;

      if (
        globalThis.document.body &&
        typeof globalThis.document.body.removeChild === "function"
      ) {
        globalThis.document.body.removeChild(testElement);
      }

      // If widths are different, the font is likely available
      const isAvailable = Math.abs(widthWithFont - widthWithFallback) > 1.0; // Higher threshold
      console.debug(
        `Font detection result for "${fontName}": ${isAvailable} (widths: ${widthWithFont.toFixed(2)} vs ${widthWithFallback.toFixed(2)}, diff: ${Math.abs(widthWithFont - widthWithFallback).toFixed(2)})`,
      );

      // Additional check: try to detect if the font is actually loaded
      if (isAvailable) {
        // Check if the computed font family includes our font
        const computedFont =
          globalThis.window.getComputedStyle &&
          typeof globalThis.window.getComputedStyle === "function"
            ? globalThis.window.getComputedStyle(testElement).fontFamily
            : "";
        const fontLoaded =
          computedFont.includes(fontName) ||
          computedFont.includes(fontName.replace(/\s+/g, ""));
        console.debug(
          `Font loading check for "${fontName}": computed font family = "${computedFont}", font loaded = ${fontLoaded}`,
        );
        if (
          globalThis.document.body &&
          typeof globalThis.document.body.removeChild === "function"
        ) {
          globalThis.document.body.removeChild(testElement);
        }
        return fontLoaded;
      }

      if (
        globalThis.document.body &&
        typeof globalThis.document.body.removeChild === "function"
      ) {
        globalThis.document.body.removeChild(testElement);
      }
      return false;
    } catch (error) {
      console.warn(
        `[ea-FontRegistry] Font availability check failed for "${fontName}":`,
        error,
      );
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
    const { fontName, fontType, targetElements, domain } = application;

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

      // Convert relative path to absolute extension URL
      const absoluteFontPath = browser?.runtime?.getURL
        ? browser.runtime.getURL(fontPath as PublicPath)
        : fontPath; // Fallback for non-extension environments

      fontFaceRule = `
 @font-face {
   font-family: '${fontName}';
   src: url('${absoluteFontPath}') format('woff2');
   font-weight: ${font.weight};
   font-style: ${font.style};
   font-display: swap;
 }`;

      fontFamilyRule = `
  ${targetElements} {
    font-family: '${fontName}', sans-serif;
  }`;
    } else {
      // Custom font - assume it's already available on the system
      fontFamilyRule = `
 ${targetElements} {
   font-family: '${fontName}', sans-serif;
 }`;
    }

    // Process domain for title
    const titleDomain = domain
      ? domain
          .replace(/\.(com|org|net|edu)$/, "")
          .replace(/\./g, " ")
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
      : "";
    const name = domain
      ? `${fontName} in ${titleDomain}`
      : `Eastyles Font: ${fontName}`;
    const matchRule = domain ? `@match *://${domain}/*` : "";

    return `/* ==UserStyle==
 @name ${name}
 @namespace github.com/KiKaraage/Eastyles
 @version 1.0.0
 @description Apply ${fontName} font to ${domain || "all sites"}
 @author Eastyles
 ${matchRule}
 ==/UserStyle== */

 ${fontFaceRule}
 ${fontFamilyRule}`;
  }

  /**
   * Get font categories for UI organization
   */
  getFontCategories(): BuiltInFont["category"][] {
    return ["sans", "serif", "techno", "playful", "custom"];
  }

  /**
   * Generate CSS for font injection (without UserCSS metadata)
   */
  generateFontCSS(application: FontApplication): string {
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

      // Convert relative path to absolute extension URL
      const absoluteFontPath = browser?.runtime?.getURL
        ? browser.runtime.getURL(fontPath as PublicPath)
        : fontPath; // Fallback for non-extension environments

      fontFaceRule = `@font-face {
  font-family: '${fontName}';
  src: url('${absoluteFontPath}') format('woff2');
  font-weight: ${font.weight};
  font-style: ${font.style};
  font-display: swap;
}`;
    }

    // Apply font family to target elements
    fontFamilyRule = `${targetElements} {
  font-family: '${fontName}', sans-serif !important;
}`;

    return `${fontFaceRule}\n${fontFamilyRule}`.trim();
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
