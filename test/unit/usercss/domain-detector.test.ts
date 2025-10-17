/**
 * Unit tests for DomainDetector
 * Tests URL matching against various domain rules including exact domains,
 * subdomains, URL prefixes, and regular expressions.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  DomainDetector,
  UserCSSDomainDetector,
} from "../../../services/usercss/domain-detector";
import { DomainRule } from "../../../services/usercss/types";

describe("DomainDetector", () => {
  let detector: DomainDetector;

  beforeEach(() => {
    detector = new UserCSSDomainDetector();
  });

  describe("URL normalization", () => {
    it("should normalize URLs correctly", () => {
      expect(detector.normalizeURL("example.com")).toBe("https://example.com");
      expect(detector.normalizeURL("http://example.com/")).toBe(
        "http://example.com",
      );
      expect(detector.normalizeURL("https://example.com:443/")).toBe(
        "https://example.com",
      );
      expect(detector.normalizeURL("HTTPS://EXAMPLE.COM/PATH")).toBe(
        "https://example.com/PATH",
      );
    });

    it("should handle invalid URLs gracefully", () => {
      // Note: URL constructor accepts many strings as valid hostnames
      // So 'not-a-url' becomes a valid hostname when prefixed with https://
      expect(detector.normalizeURL("not-a-url")).toBe("https://not-a-url");
      // Empty string remains empty as it's truly invalid
      expect(detector.normalizeURL("")).toBe("");
    });
  });

  describe("Domain extraction", () => {
    it("should extract domains from URLs", () => {
      expect(detector.extractDomain("https://example.com")).toBe("example.com");
      expect(detector.extractDomain("http://sub.example.com:8080/path")).toBe(
        "sub.example.com",
      );
      expect(detector.extractDomain("ftp://ftp.example.com/file")).toBe(
        "ftp.example.com",
      );
    });

    it("should handle invalid URLs in domain extraction", () => {
      expect(detector.extractDomain("not-a-url")).toBe("not-a-url");
      expect(detector.extractDomain("")).toBe("");
    });
  });

  describe("Domain rule matching", () => {
    it("should match exact domains", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "example.com", include: true },
      ];

      expect(detector.matches("https://example.com", rules)).toBe(true);
      expect(detector.matches("https://www.example.com", rules)).toBe(true); // www subdomain should match
      expect(detector.matches("https://other.com", rules)).toBe(false);
    });

    it("should match subdomains with wildcard", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "*.example.com", include: true },
      ];

      expect(detector.matches("https://example.com", rules)).toBe(true);
      expect(detector.matches("https://sub.example.com", rules)).toBe(true);
      expect(detector.matches("https://sub.sub.example.com", rules)).toBe(true);
      expect(detector.matches("https://other.com", rules)).toBe(false);
    });

    it("should match domains with trailing wildcard", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "old.reddit.com*", include: true },
      ];

      expect(detector.matches("https://old.reddit.com", rules)).toBe(true);
      expect(detector.matches("https://old.reddit.com/r/test", rules)).toBe(
        true,
      );
      expect(detector.matches("https://new.reddit.com", rules)).toBe(false);
      expect(detector.matches("https://reddit.com", rules)).toBe(false);
    });

    it("should handle exclude rules", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "example.com", include: false },
      ];

      expect(detector.matches("https://example.com", rules)).toBe(false);
      expect(detector.matches("https://other.com", rules)).toBe(true);
    });
  });

  describe("URL prefix matching", () => {
    it("should match URL prefixes", () => {
      const rules: DomainRule[] = [
        {
          kind: "url-prefix",
          pattern: "https://example.com/docs",
          include: true,
        },
      ];

      expect(detector.matches("https://example.com/docs", rules)).toBe(true);
      expect(detector.matches("https://example.com/docs/page1", rules)).toBe(
        true,
      );
      expect(detector.matches("https://example.com/blog", rules)).toBe(false);
      expect(detector.matches("http://example.com/docs", rules)).toBe(false);
    });
  });

  describe("Exact URL matching", () => {
    it("should match exact URLs", () => {
      const rules: DomainRule[] = [
        { kind: "url", pattern: "https://example.com/page", include: true },
      ];

      expect(detector.matches("https://example.com/page", rules)).toBe(true);
      expect(detector.matches("https://example.com/page?query=1", rules)).toBe(
        false,
      );
      expect(detector.matches("https://example.com/other", rules)).toBe(false);
    });
  });

  describe("Regular expression matching", () => {
    it("should match regular expressions", () => {
      const rules: DomainRule[] = [
        {
          kind: "regexp",
          pattern: "https://.*\\.example\\.com/.*",
          include: true,
        },
      ];

      expect(detector.matches("https://sub.example.com/page", rules)).toBe(
        true,
      );
      expect(detector.matches("https://example.com/page", rules)).toBe(false);
      expect(detector.matches("http://sub.example.com/page", rules)).toBe(
        false,
      );
    });

    it("should handle invalid regex patterns gracefully", () => {
      const rules: DomainRule[] = [
        { kind: "regexp", pattern: "[invalid regex", include: true },
      ];

      expect(detector.matches("https://example.com", rules)).toBe(false);
    });
  });

  describe("Multiple rules", () => {
    it("should match any rule in a list", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "example.com", include: true },
        { kind: "domain", pattern: "test.com", include: true },
      ];

      expect(detector.matches("https://example.com", rules)).toBe(true);
      expect(detector.matches("https://test.com", rules)).toBe(true);
      expect(detector.matches("https://other.com", rules)).toBe(false);
    });

    it("should handle mixed include/exclude rules", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "*.example.com", include: true },
        { kind: "domain", pattern: "blocked.example.com", include: false },
      ];

      expect(detector.matches("https://sub.example.com", rules)).toBe(true);
      expect(detector.matches("https://blocked.example.com", rules)).toBe(
        false,
      );
      expect(detector.matches("https://other.com", rules)).toBe(false);
    });
  });

  describe("No rules scenario", () => {
    it("should match all URLs when no rules are provided", () => {
      expect(detector.matches("https://example.com", [])).toBe(true);
      expect(detector.matches("https://any-site.com", [])).toBe(true);
    });
  });

  describe("Case sensitivity", () => {
    it("should handle case-insensitive matching", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "Example.COM", include: true },
      ];

      expect(detector.matches("https://EXAMPLE.com", rules)).toBe(true);
      expect(detector.matches("https://example.COM", rules)).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty patterns", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "", include: true },
      ];

      expect(detector.matches("https://example.com", rules)).toBe(false);
    });

    it("should handle malformed URLs", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "example.com", include: true },
      ];

      expect(detector.matches("not-a-valid-url", rules)).toBe(false);
    });

    it("should handle URLs with ports", () => {
      const rules: DomainRule[] = [
        { kind: "domain", pattern: "example.com", include: true },
      ];

      expect(detector.matches("https://example.com:8080", rules)).toBe(true);
    });
  });
});
