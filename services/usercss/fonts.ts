/**
 * Font Processing Module
 *
 * Handles detection, extraction, and injection of @font-face rules
 * and resolution of --font-* CSS variables for UserCSS styles.
 */

export type FontFace = {
  family?: string;
  src?: string;
  weight?: string;
  style?: string;
  display?: string;
  // Allow additional properties
  [_key: string]: unknown;
};

/**
 * Extracts @font-face rules from CSS content
 */
export function extractFontFaces(css: string): FontFace[] {
  const fontFaces: FontFace[] = [];
  const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
  let match;

  while ((match = fontFaceRegex.exec(css)) !== null) {
    const fontFaceContent = match[1];
    const fontFace: FontFace = {};

    // Extract properties from @font-face rule
    const propertyRegex = /([a-zA-Z-]+)\s*:\s*([^;]+);?/gi;
    let propertyMatch;

    while ((propertyMatch = propertyRegex.exec(fontFaceContent)) !== null) {
      const property = propertyMatch[1].trim();
      const value = propertyMatch[2].trim();

      // Map CSS properties to our expected property names
      let mappedProperty: string;
      switch (property) {
        case 'font-family':
          mappedProperty = 'family';
          break;
        case 'font-weight':
          mappedProperty = 'weight';
          break;
        case 'font-style':
          mappedProperty = 'style';
          break;
        case 'font-display':
          mappedProperty = 'display';
          break;
        case 'src':
          mappedProperty = 'src';
          break;
        default:
          // For other properties, convert to camelCase
          mappedProperty = property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      }

      // Strip quotes from font-family values
      let processedValue = value;
      if (mappedProperty === 'family') {
        processedValue = value.replace(/^["']|["']$/g, '');
      }

       
      (fontFace as Record<string, unknown>)[mappedProperty] = processedValue;
    }

    if (Object.keys(fontFace).length > 0) {
      fontFaces.push(fontFace);
    }
  }

  return fontFaces;
}

/**
 * Injects @font-face rules before main CSS content
 */
export function injectFonts(fontFaces: FontFace[], mainCss: string): void {
  if (fontFaces.length === 0) {
    // No fonts to inject, just inject main CSS
    injectStyleElement(mainCss, false);
    return;
  }

  // Build @font-face CSS
  const fontFaceCss = fontFaces
    .map(face => {
      const properties = Object.entries(face)
        .filter(([_key, value]) => value !== undefined)
        .map(([key, value]) => {
          // Convert camelCase back to kebab-case
          const cssProperty = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
          return `  ${cssProperty}: ${value};`;
        })
        .join('\n');

      return `@font-face {\n${properties}\n}`;
    })
    .join('\n\n');

  // Combine fonts and main CSS
  const combinedCss = `${fontFaceCss}\n\n${mainCss}`;

  // Inject as a single style element
  injectStyleElement(combinedCss, true);
}

/**
 * Resolves --font-* variables in CSS with provided values
 */
export function resolveFontVariables(css: string, variables: Record<string, string>): string {
  let resolvedCss = css;

  // Find all --font-* variable usages with more flexible regex
  const fontVarRegex = /var\((--font-[^),]+)(?:,\s*([^)]*))?\)/g;

  resolvedCss = resolvedCss.replace(fontVarRegex, (match, varName: string, fallback?: string) => {
    const value = variables[varName.trim()];

    if (value) {
      // Use the provided variable value, ensuring proper quoting
      return ensureFontFamilyQuotes(value);
    } else if (fallback && fallback.trim()) {
      // Use the fallback value, ensuring proper quoting
      return ensureFontFamilyQuotes(fallback.trim());
    } else {
      // Keep the original var() if no value or fallback
      return match;
    }
  });

  return resolvedCss;
}

/**
 * Ensures font-family values have proper quotes for single font names
 */
function ensureFontFamilyQuotes(value: string): string {
  // If it's already quoted, return as-is
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value;
  }

  // If it's a font stack with multiple fonts, add quotes to each font name
  if (value.includes(',')) {
    const fonts = value.split(',').map(font => font.trim());
    const quotedFonts = fonts.map(font => {
      // Skip generic font families (serif, sans-serif, monospace, etc.)
      const genericFamilies = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'];
      if (genericFamilies.includes(font.toLowerCase())) {
        return font;
      }
      // Add quotes to font names that don't have them
      if (!((font.startsWith('"') && font.endsWith('"')) ||
            (font.startsWith("'") && font.endsWith("'")))) {
        return `'${font}'`;
      }
      return font;
    });
    return quotedFonts.join(', ');
  }

  // Add single quotes for single font names
  return `'${value}'`;
}

/**
 * Helper function to inject CSS as a style element
 */
function injectStyleElement(css: string, isFontStyle: boolean): void {
  if (typeof globalThis.document === 'undefined') {
    // Not in browser environment
    return;
  }

  const style = globalThis.document.createElement('style');
  style.textContent = css;

  if (isFontStyle) {
    style.setAttribute('data-eastyles-fonts', 'true');
  }

  // Insert at the beginning of head to ensure fonts load before other styles
  const head = globalThis.document.head;
  if (head.firstChild) {
    head.insertBefore(style, head.firstChild);
  } else {
    head.appendChild(style);
  }
}