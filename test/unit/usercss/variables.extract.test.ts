/**
 * UserCSS Variable Extraction Tests
 *
 * Tests for extracting variable descriptors from CSS content
 */

import {
  extractVariables,
  resolveVariables,
} from "@services/usercss/variables";
import { describe, expect, it } from "vitest";

describe("UserCSS Variable Extraction", () => {
  describe("extractVariables", () => {
    it("should extract basic variable with no annotations", () => {
      const css = `
        body {
          background-color: /*[[--bg-color]]*/ #ffffff;
        }
      `;

      const result = extractVariables(css);
      expect(result).toEqual([
        {
          name: "--bg-color",
          type: "text",
          default: "",
          value: "",
        },
      ]);
    });

    it("should extract variable with type annotation", () => {
      const css = `
        body {
          background-color: /*[[--accent-color|color]]*/ #ff0000;
        }
      `;

      const result = extractVariables(css);
      expect(result).toEqual([
        {
          name: "--accent-color",
          type: "color",
          default: "",
          value: "",
        },
      ]);
    });

    it("should extract variable with type and default", () => {
      const css = `
        body {
          font-size: /*[[--font-size|number|16]]*/ 16px;
        }
      `;

      const result = extractVariables(css);
      expect(result).toEqual([
        {
          name: "--font-size",
          type: "number",
          default: "16",
          value: "16",
        },
      ]);
    });

    it("should extract variable with number type and min/max constraints", () => {
      const css = `
        body {
          font-size: /*[[--font-size|number|16|12|24]]*/ 16px;
        }
      `;

      const result = extractVariables(css);
      expect(result).toEqual([
        {
          name: "--font-size",
          type: "number",
          default: "16",
          value: "16",
          min: 12,
          max: 24,
        },
      ]);
    });

    it("should extract variable with select type and options", () => {
      const css = `
        body {
          font-family: /*[[--font-family|select|Arial|options:Arial,Helvetica,sans-serif]]*/ Arial;
        }
      `;

      const result = extractVariables(css);
      expect(result).toEqual([
        {
          name: "--font-family",
          type: "select",
          default: "Arial",
          value: "Arial",
          options: ["Arial", "Helvetica", "sans-serif"],
        },
      ]);
    });

    it("should extract multiple variables", () => {
      const css = `
        body {
          background-color: /*[[--bg-color|color|#ffffff]]*/ #ffffff;
          color: /*[[--text-color|color|#000000]]*/ #000000;
          font-size: /*[[--font-size|number|16]]*/ 16px;
        }
      `;

      const result = extractVariables(css);
      expect(result).toEqual([
        {
          name: "--bg-color",
          type: "color",
          default: "#ffffff",
          value: "#ffffff",
        },
        {
          name: "--text-color",
          type: "color",
          default: "#000000",
          value: "#000000",
        },
        {
          name: "--font-size",
          type: "number",
          default: "16",
          value: "16",
        },
      ]);
    });

    it("should handle variables with unknown types", () => {
      const css = `
        body {
          custom-property: /*[[--custom-var|unknown-type|value]]*/ value;
        }
      `;

      const result = extractVariables(css);
      expect(result).toEqual([
        {
          name: "--custom-var",
          type: "unknown",
          default: "value",
          value: "value",
        },
      ]);
    });

    it("should skip invalid variable names (not starting with --)", () => {
      const css = `
        body {
          color: /*[[bg-color|color|#ffffff]]*/ #ffffff;
        }
      `;

      const result = extractVariables(css);
      expect(result).toEqual([]);
    });

    it("should handle CSS without variables", () => {
      const css = `
        body {
          color: red;
          font-size: 16px;
        }
      `;

      const result = extractVariables(css);
      expect(result).toEqual([]);
    });
  });

  describe("resolveVariables", () => {
    it("should resolve variables with provided values", () => {
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

      const result = resolveVariables(css, values);
      expect(result).toContain("#ff0000");
      expect(result).toContain("#ffffff");
    });

    it("should use default values when no value is provided", () => {
      const css = `
        body {
          font-size: /*[[--font-size|number|16]]*/ 16px;
        }
      `;

      const values = {};

      const result = resolveVariables(css, values);
      expect(result).toContain("16");
    });

    it("should preserve placeholder when no value or default is available", () => {
      const css = `
        body {
          background-color: /*[[--bg-color]]*/ #ffffff;
        }
      `;

      const values = {};

      const result = resolveVariables(css, values);
      expect(result).toContain("/*[[--bg-color]]*/");
    });
  });
});
