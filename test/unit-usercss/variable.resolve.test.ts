/**
 * UserCSS Variable Resolution Tests
 *
 * Tests for resolving variables in CSS content
 */

import { resolveVariables } from "@services/usercss/variables";
import { describe, expect, it } from "vitest";

describe("UserCSS Variable Resolution", () => {
  describe("resolveVariables", () => {
    it("should resolve variables with provided values", async () => {
      const css = `
        body {
          background-color: /*[[--bg-color]]*/ #ffffff;
          color: /*[[--text-color]]*/ #000000;
        }
      `;

      const values = {
        "--bg-color": "#ff0000",
        "--text-color": "#ffffff",
      };

      const result = await resolveVariables(css, values);
      expect(result).not.toContain("/*[[");
      expect(result).toContain("#ff0000");
      expect(result).toContain("#ffffff");
    });

    it("should use default values from annotations when no value is provided", async () => {
      const css = `
        body {
          font-size: /*[[--font-size|number|16]]*/ 16px;
        }
      `;

      const values = {};

      const result = await resolveVariables(css, values);
      expect(result).toContain("16");
      expect(result).not.toContain("/*[[");
    });

    it("should preserve placeholder when no value or default is available", async () => {
      const css = `
        body {
          background-color: /*[[--bg-color]]*/ #ffffff;
        }
      `;

      const values = {};

      const result = await resolveVariables(css, values);
      expect(result).toContain("/*[[--bg-color]]*/");
    });

    it("should handle multiple occurrences of the same variable", async () => {
      const css = `
        body {
          background-color: /*[[--primary-color]]*/ #ffffff;
          border-color: /*[[--primary-color]]*/ #000000;
        }
      `;

      const values = {
        "--primary-color": "#ff0000",
      };

      const result = await resolveVariables(css, values);
      const occurrences = (result.match(/#ff0000/g) || []).length;
      expect(occurrences).toBe(2);
    });

    it("should be idempotent (calling multiple times produces same result)", async () => {
      const css = `
        body {
          background-color: /*[[--bg-color|color|#ffffff]]*/ #ffffff;
        }
      `;

      const values = {
        "--bg-color": "#ff0000",
      };

      const result1 = await resolveVariables(css, values);
      const result2 = await resolveVariables(result1, values);

      expect(result1).toEqual(result2);
    });

    it("should only replace touched variables when doing scoped regeneration", async () => {
      // This test verifies that we could implement efficient partial updates
      const css = `
        body {
          background-color: /*[[--bg-color]]*/ #ffffff;
          color: /*[[--text-color]]*/ #000000;
        }
      `;

      // Simulate updating only one variable
      const values = {
        "--bg-color": "#ff0000",
        // --text-color not provided, should remain as placeholder
      };

      const result = await resolveVariables(css, values);
      expect(result).toContain("#ff0000");
      expect(result).toContain("/*[[--text-color]]*/");
    });
  });
});
