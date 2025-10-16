/**
 * Unit tests for UserCSS type validation
 *
 * These tests validate that the zod schemas correctly validate UserCSS data structures
 * and provide informative error messages when validation fails.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AssetSchema,
  DomainRuleSchema,
  ExtensionErrorPayloadSchema,
  formatZodError,
  ParseResultSchema,
  StyleMetaSchema,
  UserCSSOptionsSchema,
  VariableDescriptorSchema,
  validateDomainRules,
  validateStyleMeta,
  validateVariables,
} from "../../../services/usercss/validators";

describe("UserCSS Type Validation", () => {
  describe("StyleMetaSchema", () => {
    it("should validate a valid StyleMeta object", () => {
      const validStyleMeta = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "Test Style",
        namespace: "test",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://example.com/style.css",
        domains: ["example.com", "*.example.com"],
        compiledCss: "body { color: red; }",
        variables: {
          "--accent-color": {
            name: "--accent-color",
            type: "color" as const,
            default: "#ff0000",
            value: "#00ff00",
          },
        },
        assets: [
          {
            type: "font" as const,
            url: "https://example.com/font.woff2",
            format: "woff2",
            weight: "400",
            style: "normal",
            display: "swap",
          },
        ],
      };

      const result = StyleMetaSchema.safeParse(validStyleMeta);
      expect(result.success).toBe(true);
    });

    it("should reject StyleMeta with invalid UUID", () => {
      const invalidStyleMeta = {
        id: "invalid-uuid",
        name: "Test Style",
        namespace: "test",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://example.com/style.css",
        domains: ["example.com"],
        compiledCss: "body { color: red; }",
      };

      const result = StyleMetaSchema.safeParse(invalidStyleMeta);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Style ID must be a valid UUID",
        );
      }
    });

    it("should reject StyleMeta with empty name", () => {
      const invalidStyleMeta = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "",
        namespace: "test",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://example.com/style.css",
        domains: ["example.com"],
        compiledCss: "body { color: red; }",
      };

      const result = StyleMetaSchema.safeParse(invalidStyleMeta);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Style name cannot be empty",
        );
      }
    });

    it("should reject StyleMeta with invalid source URL", () => {
      const invalidStyleMeta = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "Test Style",
        namespace: "test",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "invalid-url",
        domains: ["example.com"],
        compiledCss: "body { color: red; }",
      };

      const result = StyleMetaSchema.safeParse(invalidStyleMeta);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Source URL must be a valid URL",
        );
      }
    });

    it("should reject StyleMeta with empty domains array", () => {
      const invalidStyleMeta = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "Test Style",
        namespace: "test",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://example.com/style.css",
        domains: [],
        compiledCss: "body { color: red; }",
      };

      const result = StyleMetaSchema.safeParse(invalidStyleMeta);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "At least one domain must be specified",
        );
      }
    });
  });

  describe("VariableDescriptorSchema", () => {
    it("should validate a valid VariableDescriptor", () => {
      const validVariable = {
        name: "--accent-color",
        type: "color" as const,
        default: "#ff0000",
        value: "#00ff00",
      };

      const result = VariableDescriptorSchema.safeParse(validVariable);
      expect(result.success).toBe(true);
    });

    it("should reject VariableDescriptor with name not starting with --", () => {
      const invalidVariable = {
        name: "accent-color",
        type: "color" as const,
        default: "#ff0000",
        value: "#00ff00",
      };

      const result = VariableDescriptorSchema.safeParse(invalidVariable);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Variable names must start with --",
        );
      }
    });

    it("should reject VariableDescriptor with empty default value", () => {
      const invalidVariable = {
        name: "--accent-color",
        type: "color" as const,
        default: "",
        value: "#00ff00",
      };

      const result = VariableDescriptorSchema.safeParse(invalidVariable);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Default value cannot be empty",
        );
      }
    });

    it("should validate VariableDescriptor with min/max constraints", () => {
      const validVariable = {
        name: "--font-size",
        type: "number" as const,
        default: "16",
        value: "18",
        min: 12,
        max: 24,
      };

      const result = VariableDescriptorSchema.safeParse(validVariable);
      expect(result.success).toBe(true);
    });

    it("should validate VariableDescriptor with select options", () => {
      const validVariable = {
        name: "--theme",
        type: "select" as const,
        default: "light",
        value: "dark",
        options: ["light", "dark", "auto"],
      };

      const result = VariableDescriptorSchema.safeParse(validVariable);
      expect(result.success).toBe(true);
    });
  });

  describe("DomainRuleSchema", () => {
    it("should validate a valid DomainRule", () => {
      const validRule = {
        kind: "domain" as const,
        pattern: "example.com",
        include: true,
      };

      const result = DomainRuleSchema.safeParse(validRule);
      expect(result.success).toBe(true);
    });

    it("should reject DomainRule with empty pattern", () => {
      const invalidRule = {
        kind: "domain" as const,
        pattern: "",
        include: true,
      };

      const result = DomainRuleSchema.safeParse(invalidRule);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Domain pattern cannot be empty",
        );
      }
    });

    it("should validate DomainRule with different kinds", () => {
      const validRules = [
        {
          kind: "url" as const,
          pattern: "https://example.com/page",
          include: true,
        },
        {
          kind: "url-prefix" as const,
          pattern: "https://example.com/",
          include: true,
        },
        {
          kind: "domain" as const,
          pattern: "example.com",
          include: true,
        },
        {
          kind: "regexp" as const,
          pattern: ".*\\.example\\.com",
          include: true,
        },
      ];

      validRules.forEach((rule) => {
        const result = DomainRuleSchema.safeParse(rule);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("AssetSchema", () => {
    it("should validate a valid Asset", () => {
      const validAsset = {
        type: "font" as const,
        url: "https://example.com/font.woff2",
        format: "woff2",
        weight: "400",
        style: "normal",
        display: "swap",
      };

      const result = AssetSchema.safeParse(validAsset);
      expect(result.success).toBe(true);
    });

    it("should reject Asset with invalid URL", () => {
      const invalidAsset = {
        type: "font" as const,
        url: "invalid-url",
      };

      const result = AssetSchema.safeParse(invalidAsset);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Asset URL must be a valid URL",
        );
      }
    });
  });

  describe("ParseResultSchema", () => {
    it("should validate a valid ParseResult", () => {
      const validParseResult = {
        meta: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          name: "Test Style",
          namespace: "test",
          version: "1.0.0",
          description: "A test style",
          author: "Test Author",
          domains: ["example.com"],
          compiledCss: "body { color: red; }",
        },
        css: "body { color: red; }",
        warnings: ["This is a warning"],
        errors: [],
      };

      const result = ParseResultSchema.safeParse(validParseResult);
      expect(result.success).toBe(true);
    });

    it("should reject ParseResult with empty CSS", () => {
      const invalidParseResult = {
        meta: {
          id: "123e4567-e89b-12d3-a456-426614174000",
          name: "Test Style",
          namespace: "test",
          version: "1.0.0",
          description: "A test style",
          author: "Test Author",
          domains: ["example.com"],
          compiledCss: "body { color: red; }",
        },
        css: "",
        warnings: [],
        errors: [],
      };

      const result = ParseResultSchema.safeParse(invalidParseResult);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "CSS content cannot be empty",
        );
      }
    });
  });

  describe("ExtensionErrorPayloadSchema", () => {
    it("should validate a valid ExtensionErrorPayload", () => {
      const validErrorPayload = {
        code: "ERR_PARSE_METADATA",
        message: "Failed to parse metadata",
        context: { line: 10, column: 5 },
        line: 10,
        column: 5,
      };

      const result = ExtensionErrorPayloadSchema.safeParse(validErrorPayload);
      expect(result.success).toBe(true);
    });

    it("should validate ExtensionErrorPayload without optional fields", () => {
      const validErrorPayload = {
        code: "ERR_PARSE_METADATA",
        message: "Failed to parse metadata",
      };

      const result = ExtensionErrorPayloadSchema.safeParse(validErrorPayload);
      expect(result.success).toBe(true);
    });

    it("should accept ExtensionErrorPayload with empty code", () => {
      const emptyCodeErrorPayload = {
        code: "",
        message: "Failed to parse metadata",
      };

      const result = ExtensionErrorPayloadSchema.safeParse(
        emptyCodeErrorPayload,
      );
      expect(result.success).toBe(true);
    });
  });

  describe("UserCSSOptionsSchema", () => {
    it("should validate valid UserCSSOptions with defaults", () => {
      const validOptions = {};

      const result = UserCSSOptionsSchema.safeParse(validOptions);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enablePreprocessors).toBe(true);
        expect(result.data.validateSyntax).toBe(true);
        expect(result.data.maxFileSize).toBe(1024 * 1024);
        expect(result.data.preprocessTimeout).toBe(10000);
      }
    });

    it("should validate UserCSSOptions with custom values", () => {
      const validOptions = {
        enablePreprocessors: false,
        validateSyntax: false,
        maxFileSize: 2048 * 1024,
        preprocessTimeout: 5000,
      };

      const result = UserCSSOptionsSchema.safeParse(validOptions);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enablePreprocessors).toBe(false);
        expect(result.data.validateSyntax).toBe(false);
        expect(result.data.maxFileSize).toBe(2048 * 1024);
        expect(result.data.preprocessTimeout).toBe(5000);
      }
    });

    it("should reject UserCSSOptions with negative maxFileSize", () => {
      const invalidOptions = {
        maxFileSize: -1,
      };

      const result = UserCSSOptionsSchema.safeParse(invalidOptions);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "Max file size must be positive",
        );
      }
    });
  });

  describe("Utility Functions", () => {
    describe("validateStyleMeta", () => {
      it("should return success for valid data", () => {
        const validData = {
          id: "123e4567-e89b-12d3-a456-426614174000",
          name: "Test Style",
          namespace: "test",
          version: "1.0.0",
          description: "A test style",
          author: "Test Author",
          domains: ["example.com"],
          compiledCss: "body { color: red; }",
        };

        const result = validateStyleMeta(validData);
        expect(result.success).toBe(true);
      });

      it("should return failure for invalid data", () => {
        const invalidData = {
          id: "invalid-uuid",
          name: "Test Style",
          namespace: "test",
          version: "1.0.0",
          description: "A test style",
          author: "Test Author",
          domains: ["example.com"],
          compiledCss: "body { color: red; }",
        };

        const result = validateStyleMeta(invalidData);
        expect(result.success).toBe(false);
        expect("error" in result && result.error).toBeDefined();
      });
    });

    describe("validateDomainRules", () => {
      it("should validate valid domain rules", () => {
        const validRules = [
          { kind: "domain" as const, pattern: "example.com", include: true },
          {
            kind: "url" as const,
            pattern: "https://example.com/page",
            include: false,
          },
        ];

        const result = validateDomainRules(validRules);
        expect(result.success).toBe(true);
        expect("rules" in result && result.rules).toHaveLength(2);
      });

      it("should reject invalid domain rules", () => {
        const invalidRules = [
          { type: "domain" as const, pattern: "example.com", include: true },
          { type: "invalid-type", pattern: "example.com", include: true },
        ];

        const result = validateDomainRules(invalidRules);
        expect(result.success).toBe(false);
        expect("error" in result && result.error).toBeDefined();
      });
    });

    describe("validateVariables", () => {
      it("should validate valid variables", () => {
        const validVariables = {
          "--accent-color": {
            name: "--accent-color",
            type: "color" as const,
            default: "#ff0000",
            value: "#00ff00",
          },
        };

        const result = validateVariables(validVariables);
        expect(result.success).toBe(true);
        expect("variables" in result && result.variables).toBeDefined();
      });

      it("should reject invalid variables", () => {
        const invalidVariables = {
          "invalid-name": {
            name: "invalid-name",
            type: "color" as const,
            default: "#ff0000",
            value: "#00ff00",
          },
        };

        const result = validateVariables(invalidVariables);
        expect(result.success).toBe(false);
        expect("error" in result && result.error).toBeDefined();
      });
    });

    describe("formatZodError", () => {
      it("should format ZodError into human-readable message", () => {
        const error = {
          issues: [
            {
              code: "too_small",
              message: "Style name cannot be empty",
              path: ["name"],
            },
            {
              code: "invalid_type",
              message: "Expected string, received number",
              path: ["version"],
            },
          ],
        } as unknown as z.ZodError;

        const formatted = formatZodError(error);
        expect(formatted).toContain(
          "too_small: Style name cannot be empty (path: name)",
        );
        expect(formatted).toContain(
          "invalid_type: Expected string, received number (path: version)",
        );
      });

      it("should handle error without path", () => {
        const error = {
          issues: [
            {
              code: "invalid_type",
              message: "Expected string, received number",
            },
          ],
        } as unknown as z.ZodError;

        const formatted = formatZodError(error);
        expect(formatted).toContain(
          "invalid_type: Expected string, received number",
        );
      });
    });
  });
});
