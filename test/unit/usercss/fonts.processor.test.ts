import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractFontFaces,
  injectFonts,
  resolveFontVariables,
} from "../../../services/usercss/fonts";

describe("Font Processing", () => {
  describe("extractFontFaces", () => {
    it("should extract @font-face rules from CSS", () => {
      const css = `
        @font-face {
          font-family: 'Inter';
          src: url('inter.woff2') format('woff2');
          font-weight: 400;
        }

        body {
          font-family: 'Inter', sans-serif;
        }

        @font-face {
          font-family: 'Roboto';
          src: url('roboto.woff2') format('woff2');
          font-weight: 700;
        }
      `;

      const result = extractFontFaces(css);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        family: "Inter",
        src: "url('inter.woff2') format('woff2')",
        weight: "400",
      });
      expect(result[1]).toMatchObject({
        family: "Roboto",
        src: "url('roboto.woff2') format('woff2')",
        weight: "700",
      });
    });

    it("should handle @font-face rules with multiple src declarations", () => {
      const css = `
        @font-face {
          font-family: 'Inter Variable';
          src: url('inter.woff2') format('woff2'),
               url('inter.woff') format('woff');
          font-weight: 100 900;
          font-style: normal;
        }
      `;

      const result = extractFontFaces(css);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        family: "Inter Variable",
        src: "url('inter.woff2') format('woff2'),\n               url('inter.woff') format('woff')",
        weight: "100 900",
        style: "normal",
      });
    });

    it("should return empty array when no @font-face rules are present", () => {
      const css = `
        body {
          font-family: Arial, sans-serif;
        }
      `;

      const result = extractFontFaces(css);
      expect(result).toEqual([]);
    });

    it("should handle malformed @font-face rules gracefully", () => {
      const css = `
        @font-face {
          font-family: 'Test';
          /* Missing src */
        }

        @font-face {
          /* Missing font-family */
          src: url('test.woff2');
        }
      `;

      const result = extractFontFaces(css);
      expect(result).toHaveLength(2);
      expect(result[0].family).toBe("Test");
      expect(result[1].family).toBeUndefined();
    });
  });

  describe("injectFonts", () => {
    let mockDocument: any;

    beforeEach(() => {
      mockDocument = {
        head: {
          appendChild: vi.fn(),
          querySelectorAll: vi.fn().mockReturnValue([]),
        } as any,
        createElement: vi.fn().mockImplementation((tag) => ({
          tagName: tag.toUpperCase(),
          textContent: "",
          setAttribute: vi.fn(),
          style: {},
        })),
      };

      global.document = mockDocument;
    });

    it("should inject @font-face rules before main CSS", () => {
      const fontFaces = [
        {
          family: "Inter",
          src: "url('inter.woff2') format('woff2')",
          weight: "400",
        },
      ];

      const mainCss = "body { font-family: Inter, sans-serif; }";

      injectFonts(fontFaces, mainCss);

      expect(mockDocument.createElement).toHaveBeenCalledWith("style");
      expect(mockDocument.head.appendChild).toHaveBeenCalled();

      const styleElement = (mockDocument.createElement as any).mock.results[0]
        .value;
      expect(styleElement.textContent).toContain("@font-face");
      expect(styleElement.textContent).toContain("font-family: Inter");
      expect(styleElement.textContent).toContain(mainCss);
    });

    it("should inject multiple @font-face rules in correct order", () => {
      const fontFaces = [
        {
          family: "Inter",
          src: "url('inter.woff2') format('woff2')",
          weight: "400",
        },
        {
          family: "Roboto",
          src: "url('roboto.woff2') format('woff2')",
          weight: "700",
        },
      ];

      const mainCss = "body { font-family: Inter, sans-serif; }";

      injectFonts(fontFaces, mainCss);

      const styleElement = (mockDocument.createElement as any).mock.results[0]
        .value;
      const fontFaceIndex = styleElement.textContent.indexOf("@font-face");
      const mainCssIndex = styleElement.textContent.indexOf("body {");

      expect(fontFaceIndex).toBeLessThan(mainCssIndex);
    });

    it("should handle empty font faces array", () => {
      const fontFaces: any[] = [];
      const mainCss = "body { font-family: Arial, sans-serif; }";

      injectFonts(fontFaces, mainCss);

      const styleElement = (mockDocument.createElement as any).mock.results[0]
        .value;
      expect(styleElement.textContent).toBe(mainCss);
      expect(styleElement.textContent).not.toContain("@font-face");
    });

    it("should set proper attributes on style element", () => {
      const fontFaces = [
        {
          family: "Test Font",
          src: "url('test.woff2') format('woff2')",
          weight: "400",
        },
      ];

      const mainCss = "body { color: red; }";

      injectFonts(fontFaces, mainCss);

      const styleElement = (mockDocument.createElement as any).mock.results[0]
        .value;
      expect(styleElement.setAttribute).toHaveBeenCalledWith(
        "data-eastyles-fonts",
        "true",
      );
    });
  });

  describe("resolveFontVariables", () => {
    it("should resolve --font-* variables in CSS", () => {
      const css = `
        :root {
          --font-primary: 'Inter', sans-serif;
          --font-secondary: 'Roboto', monospace;
        }

        body {
          font-family: var(--font-primary);
        }

        .header {
          font-family: var(--font-secondary);
        }
      `;

      const variables = {
        "--font-primary": "Open Sans, sans-serif",
        "--font-secondary": "Monaco, monospace",
      };

      const result = resolveFontVariables(css, variables);

      expect(result).toContain("font-family: 'Open Sans', sans-serif");
      expect(result).toContain("font-family: 'Monaco', monospace");
      expect(result).not.toContain("var(--font-primary)");
      expect(result).not.toContain("var(--font-secondary)");
    });

    it("should handle variables with fallback values", () => {
      const css = `
        body {
          font-family: var(--font-primary, 'Arial', sans-serif);
        }
      `;

      const variables = {
        "--font-primary": "Inter, sans-serif",
      };

      const result = resolveFontVariables(css, variables);

      expect(result).toContain("font-family: 'Inter', sans-serif");
      expect(result).not.toContain("var(--font-primary,");
    });

    it("should preserve CSS when no font variables are present", () => {
      const css = `
        body {
          color: red;
          font-size: 16px;
        }
      `;

      const variables = {};

      const result = resolveFontVariables(css, variables);

      expect(result).toBe(css);
    });

    it("should handle multiple font variables in same rule", () => {
      const css = `
        .element {
          font-family: var(--font-primary), var(--font-secondary), sans-serif;
        }
      `;

      const variables = {
        "--font-primary": "Inter",
        "--font-secondary": "Roboto",
      };

      const result = resolveFontVariables(css, variables);

      expect(result).toContain("font-family: 'Inter', 'Roboto', sans-serif");
      expect(result).not.toContain("var(--font-primary)");
      expect(result).not.toContain("var(--font-secondary)");
    });

    it("should handle font variables with quotes and special characters", () => {
      const css = `
        body {
          font-family: var(--font-special);
        }
      `;

      const variables = {
        "--font-special": '"Times New Roman", serif',
      };

      const result = resolveFontVariables(css, variables);

      expect(result).toContain('font-family: "Times New Roman", serif');
    });
  });
});
