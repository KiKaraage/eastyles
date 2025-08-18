/**
 * Unit Tests for UserCSS Metadata Parser
 *
 * Tests the metadata extraction functionality of the UserCSS processor
 * including various edge cases and error conditions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseUserCSS,
  getErrorPosition,
  extractMetadataBlock,
} from "../../../services/usercss/processor";

describe("UserCSS Metadata Parser", () => {
  describe("parseUserCSS", () => {
    describe("Full metadata", () => {
      const fullUserCSS = `/* ==UserStyle==
@name           Example Style
@namespace      example
@version        1.0.0
@description    A sample UserCSS style
@author         John Doe
@homepageURL    https://example.com
@supportURL     https://example.com/support
@updateURL      https://example.com/update
@domain         example.com,sub.example.com
==/UserStyle== */

body {
  color: red;
}`;

      it("should parse all metadata fields correctly", () => {
        const result = parseUserCSS(fullUserCSS);

        // The hash value will be different based on the actual implementation
        expect(result.meta.id).toBeTruthy();
        expect(result.meta.name).toBe("Example Style");
        expect(result.meta.namespace).toBe("example");
        expect(result.meta.version).toBe("1.0.0");
        expect(result.meta.description).toBe("A sample UserCSS style");
        expect(result.meta.author).toBe("John Doe");
        expect(result.meta.sourceUrl).toBe("https://example.com");
        expect(result.meta.domains).toEqual(["example.com", "sub.example.com"]);
        expect(result.css).toBe("body {\n  color: red;\n}");
        expect(result.warnings).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("Missing required fields", () => {
      const missingNameCSS = `/* ==UserStyle==
@namespace      example
@version        1.0.0
@description    A sample UserCSS style
==/UserStyle== */

body {
  color: red;
}`;

      it("should report missing @name as an error", () => {
        const result = parseUserCSS(missingNameCSS);

        expect(result.errors).toContain(
          "Missing required @name directive in metadata block",
        );
        expect(result.errors).toHaveLength(1);
      });

      const missingNamespaceCSS = `/* ==UserStyle==
@name           Example Style
@version        1.0.0
@description    A sample UserCSS style
==/UserStyle== */

body {
  color: red;
}`;

      it("should report missing @namespace as an error", () => {
        const result = parseUserCSS(missingNamespaceCSS);

        expect(result.errors).toContain(
          "Missing required @namespace directive in metadata block",
        );
      });

      const missingVersionCSS = `/* ==UserStyle==
@name           Example Style
@namespace      example
@description    A sample UserCSS style
==/UserStyle== */

body {
  color: red;
}`;

      it("should report missing @version as an error", () => {
        const result = parseUserCSS(missingVersionCSS);

        expect(result.errors).toContain(
          "Missing required @version directive in metadata block",
        );
      });
    });

    describe("Duplicate directives", () => {
      const duplicateCSS = `/* ==UserStyle==
@name           Example Style
@namespace      example
@version        1.0.0
@name           Duplicate Name
@description    A sample UserCSS style
==/UserStyle== */

body {
  color: red;
}`;

      it("should report duplicate directives as errors", () => {
        const result = parseUserCSS(duplicateCSS);

        expect(result.errors).toContain(
          "Duplicate @name directive found at line 4",
        );
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe("Invalid metadata block boundaries", () => {
      const malformedCSS = `/* ==UserStyle==
@name           Example Style
@namespace      example
@version        1.0.0
@description    A sample UserCSS style
/* ==/UserStyle== */

body {
  color: red;
}`;

      it("should handle malformed block boundaries", () => {
        const result = parseUserCSS(malformedCSS);

        expect(result.errors[0]).toBe(
          "Parsing error: No UserCSS metadata block found. Expected block between ==UserStyle== and ==/UserStyle==",
        );
      });

      const missingEndCSS = `/* ==UserStyle==
@name           Example Style
@namespace      example
@version        1.0.0
@description    A sample UserCSS style
==/UserStyle==

body {
  color: red;
}`;

      it("should handle missing end boundary", () => {
        const result = parseUserCSS(missingEndCSS);

        expect(result.errors).toHaveLength(0);
        expect(result.meta.name).toBe("Example Style");
        expect(result.css).toContain("body {");
      });
    });

    describe("Legacy -moz-document syntax", () => {
      const legacyCSS = `/* ==UserStyle==
@name           Legacy Style
@namespace      legacy
@version        1.0.0
@description    Using legacy syntax
-moz-document   url("https://example.com"), url-prefix("https://sub.example.com")
==/UserStyle== */

body {
  color: red;
}`;

      it("should handle legacy -moz-document syntax with warning", () => {
        const result = parseUserCSS(legacyCSS);

        expect(result.warnings).toContain(
          "Legacy -moz-document syntax detected. Consider using modern @domain directive",
        );
        expect(result.meta.domains).toEqual(["example.com", "sub.example.com"]);
      });
    });

    describe("Modern @domain directive", () => {
      const modernCSS = `/* ==UserStyle==
@name           Modern Style
@namespace      modern
@version        1.0.0
@domain         example.com, sub.example.org, localhost
==/UserStyle== */

body {
  color: red;
}`;

      it("should parse modern @domain directive correctly", () => {
        const result = parseUserCSS(modernCSS);

        expect(result.meta.domains).toEqual([
          "example.com",
          "sub.example.org",
          "localhost",
        ]);
        expect(result.warnings).toHaveLength(0);
      });

      const protocolInDomainCSS = `/* ==UserStyle==
@name           Invalid Style
@namespace      invalid
@version        1.0.0
@domain         https://example.com
==/UserStyle== */

body {
  color: red;
}`;

      it("should warn about protocol in domain", () => {
        const result = parseUserCSS(protocolInDomainCSS);

        expect(result.warnings).toContain(
          'Domain "https://example.com" includes protocol - should be hostname only',
        );
      });

      const pathInDomainCSS = `/* ==UserStyle==
@name           Invalid Style 2
@namespace      invalid
@version        1.0.0
@domain         example.com/path
==/UserStyle== */

body {
  color: red;
}`;

      it("should warn about path in domain", () => {
        const result = parseUserCSS(pathInDomainCSS);

        expect(result.warnings).toContain(
          'Domain "example.com/path" includes path or query - should be hostname only',
        );
      });
    });

    describe("URL validation", () => {
      const invalidURLCSS = `/* ==UserStyle==
@name           URL Test
@namespace      urltest
@version        1.0.0
@homepageURL    not-a-url
@supportURL     ftp://example.com
@updateURL      https://example.com
==/UserStyle== */

body {
  color: red;
}`;

      it("should validate URLs and report warnings for invalid ones", () => {
        const result = parseUserCSS(invalidURLCSS);

        expect(result.warnings).toContain(
          "Invalid @homepageURL format: not-a-url",
        );
      });
    });

    describe("Line/column positioning", () => {
      const multilineCSS = `/* ==UserStyle==
@name           Multiline
           Style
@namespace      multiline
@version        1.0.0
==/UserStyle== */

body {
  color: red;
}`;

      it("should handle multiline directives correctly", () => {
        const result = parseUserCSS(multilineCSS);

        expect(result.meta.name).toBe("Multiline\n           Style");
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("Empty metadata block", () => {
      const emptyCSS = `/* ==UserStyle==
==/UserStyle== */

body {
  color: red;
}`;

      it("should report errors for missing required fields", () => {
        const result = parseUserCSS(emptyCSS);

        expect(result.errors).toContain(
          "Missing required @name directive in metadata block",
        );
        expect(result.errors).toContain(
          "Missing required @namespace directive in metadata block",
        );
        expect(result.errors).toContain(
          "Missing required @version directive in metadata block",
        );
      });
    });

    describe("Malformed CSS with no metadata", () => {
      const noMetadataCSS = `body {
  color: red;
}`;

      it("should report error for missing metadata block", () => {
        const result = parseUserCSS(noMetadataCSS);

        expect(result.errors[0]).toBe(
          "Parsing error: No UserCSS metadata block found. Expected block between ==UserStyle== and ==/UserStyle==",
        );
      });
    });
  });

  describe("getErrorPosition", () => {
    it("should calculate correct line and column for single line text", () => {
      const text = "Hello World";
      const position = getErrorPosition(text, 6);

      expect(position).toEqual({ line: 1, column: 7 });
    });

    it("should calculate correct line and column for multiline text", () => {
      const text = `Line 1
Line 2
Line 3`;
      const position = getErrorPosition(text, 10); // 'L' in Line 2

      expect(position).toEqual({ line: 2, column: 4 });
    });

    it("should handle edge case at beginning of text", () => {
      const text = "Test";
      const position = getErrorPosition(text, 0);

      expect(position).toEqual({ line: 1, column: 1 });
    });

    it("should handle edge case at end of text", () => {
      const text = "Test";
      const position = getErrorPosition(text, 4);

      expect(position).toEqual({ line: 1, column: 5 });
    });
  });

  describe("extractMetadataBlock", () => {
    it("should extract metadata block with correct positions", () => {
      const css = `/* ==UserStyle==
@name           Test Style
==/UserStyle== */

body {
  color: red;
}`;

      const result = extractMetadataBlock(css);

      expect(result.block).not.toBeNull();
      expect(result.start).toBeGreaterThanOrEqual(0);
      expect(result.end).toBeGreaterThan(result.start);
      expect(result.block).toContain("@name           Test Style");
    });

    it("should return null when no metadata block found", () => {
      const css = "body { color: red; }";

      const result = extractMetadataBlock(css);

      expect(result.block).toBeNull();
      expect(result.start).toBe(-1);
      expect(result.end).toBe(-1);
    });

    it("should handle malformed metadata block", () => {
      const css = `/* ==UserStyle==
@name           Test Style
/* ==/UserStyle== */

body {
  color: red;
}`;

      const result = extractMetadataBlock(css);

      expect(result.block).toBeNull();
    });
  });
});
