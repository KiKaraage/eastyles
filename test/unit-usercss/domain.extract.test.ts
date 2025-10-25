// @vitest-environment node

/**
 * UserCSS Domain Rule Extraction Tests
 *
 * Tests for extracting domain rules from @-moz-document directives
 */

import { extractDomains } from "@services/usercss/domains";
import { describe, expect, it } from "vitest";

describe("UserCSS Domain Rule Extraction", () => {
  describe("extractDomains", () => {
    it("should extract url() rules", () => {
      const css = `
        @-moz-document url("https://example.com") {
          body { color: red; }
        }
      `;

      const result = extractDomains(css);
      expect(result).toEqual([
        {
          kind: "url",
          pattern: "https://example.com",
          include: true,
        },
      ]);
    });

    it("should extract url-prefix() rules", () => {
      const css = `
        @-moz-document url-prefix("https://example.com/path") {
          body { color: red; }
        }
      `;

      const result = extractDomains(css);
      expect(result).toEqual([
        {
          kind: "url-prefix",
          pattern: "https://example.com/path",
          include: true,
        },
      ]);
    });

    it("should extract domain() rules", () => {
      const css = `
        @-moz-document domain("example.com") {
          body { color: red; }
        }
      `;

      const result = extractDomains(css);
      expect(result).toEqual([
        {
          kind: "domain",
          pattern: "example.com",
          include: true,
        },
      ]);
    });

    it("should extract regexp() rules", () => {
      const css = `
        @-moz-document regexp("https://.*\\.example\\.com/.*") {
          body { color: red; }
        }
      `;

      const result = extractDomains(css);
      expect(result).toEqual([
        {
          kind: "regexp",
          pattern: "https://.*\\.example\\.com/.*",
          include: true,
        },
      ]);
    });

    it("should extract mixed directives", () => {
      const css = `
        @-moz-document url("https://example.com"), domain("test.com") {
          body { color: red; }
        }
      `;

      const result = extractDomains(css);
      expect(result).toEqual([
        {
          kind: "url",
          pattern: "https://example.com",
          include: true,
        },
        {
          kind: "domain",
          pattern: "test.com",
          include: true,
        },
      ]);
    });

    it("should handle whitespace in patterns", () => {
      const css = `
        @-moz-document url(  "https://example.com"  ), domain(  "test.com"  ) {
          body { color: red; }
        }
      `;

      const result = extractDomains(css);
      expect(result).toEqual([
        {
          kind: "url",
          pattern: "https://example.com",
          include: true,
        },
        {
          kind: "domain",
          pattern: "test.com",
          include: true,
        },
      ]);
    });

    it("should skip invalid regex patterns with warning", () => {
      const css = `
        @-moz-document regexp("[invalid regex") {
          body { color: red; }
        }
      `;

      const result = extractDomains(css);
      // Should not throw but should not include the invalid regex
      expect(result).toEqual([]);
    });

    it("should handle multiple @-moz-document blocks", () => {
      const css = `
        @-moz-document url("https://example.com") {
          body { color: red; }
        }
        
        @-moz-document domain("test.com") {
          h1 { font-size: 20px; }
        }
      `;

      const result = extractDomains(css);
      expect(result).toEqual([
        {
          kind: "url",
          pattern: "https://example.com",
          include: true,
        },
        {
          kind: "domain",
          pattern: "test.com",
          include: true,
        },
      ]);
    });

    it("should return empty array for CSS without @-moz-document", () => {
      const css = `
        body {
          color: red;
        }
        
        h1 {
          font-size: 20px;
        }
      `;

      const result = extractDomains(css);
      expect(result).toEqual([]);
    });
  });
});
