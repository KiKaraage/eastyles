/**
 * Domain Rule Shape Validation Tests
 *
 * Tests for validating DomainRule shape and ensuring validators catch empty/invalid patterns
 */

import {
  DomainRuleSchema,
  validateDomainRules,
} from "@services/usercss/validators";
import { describe, expect, it } from "vitest";

describe("Domain Rule Shape Validation", () => {
  describe("DomainRuleSchema", () => {
    it("should validate a valid DomainRule with all required fields", () => {
      const validRule = {
        kind: "domain",
        pattern: "example.com",
        include: true,
      };

      const result = DomainRuleSchema.safeParse(validRule);
      expect(result.success).toBe(true);
    });

    it("should reject DomainRule with empty pattern", () => {
      const invalidRule = {
        kind: "domain",
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

    it("should reject DomainRule with invalid kind", () => {
      const invalidRule = {
        kind: "invalid-kind",
        pattern: "example.com",
        include: true,
      };

      const result = DomainRuleSchema.safeParse(invalidRule);
      expect(result.success).toBe(false);
    });

    it("should validate all valid kinds", () => {
      const validKinds = ["url", "url-prefix", "domain", "regexp"];

      validKinds.forEach((kind) => {
        const validRule = {
          kind,
          pattern: "example.com",
          include: true,
        };

        const result = DomainRuleSchema.safeParse(validRule);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("validateDomainRules utility", () => {
    it("should validate array of valid domain rules", () => {
      const validRules = [
        { kind: "domain", pattern: "example.com", include: true },
        { kind: "url", pattern: "https://test.com/page", include: false },
      ];

      const result = validateDomainRules(validRules);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.rules).toHaveLength(2);
      }
    });

    it("should reject array with invalid domain rules", () => {
      const invalidRules = [
        { kind: "domain", pattern: "example.com", include: true },
        { kind: "domain", pattern: "", include: true }, // Empty pattern
      ];

      const result = validateDomainRules(invalidRules);
      expect(result.success).toBe(false);
    });
  });
});
