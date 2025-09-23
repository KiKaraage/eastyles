/**
 * Domain Detection System for UserCSS Styles
 *
 * This module provides functionality to match URLs against domain rules
 * defined in UserCSS styles, supporting various matching patterns including
 * exact domains, subdomains, URL prefixes, and regular expressions.
 */

import { DomainRule } from "./types";

/**
 * Interface for the domain detector
 */
export interface DomainDetector {
  /**
   * Check if a URL matches any of the provided domain rules
   * @param url The URL to test
   * @param rules Array of domain rules to match against
   * @returns true if the URL matches any rule, false otherwise
   */
  matches(url: string, rules: DomainRule[]): boolean;

  /**
   * Extract the domain from a URL
   * @param url The URL to extract domain from
   * @returns The domain string
   */
  extractDomain(url: string): string;

  /**
   * Normalize a URL for consistent processing
   * @param url The URL to normalize
   * @returns Normalized URL string
   */
  normalizeURL(url: string): string;
}

/**
 * Implementation of the domain detector
 */
export class UserCSSDomainDetector implements DomainDetector {
  private debugEnabled = true; // Enable debugging

  constructor(debug = true) {
    this.debugEnabled = debug;
  }

  private debug(message: string, ...args: unknown[]): void {
    if (this.debugEnabled) {
      console.log(`[DomainDetector] ${message}`, ...args);
    }
  }

  /**
   * Check if a URL matches any of the provided domain rules
   */
  matches(url: string, rules: DomainRule[]): boolean {
    if (!rules || rules.length === 0) {
      this.debug("No rules provided, matching all URLs (global styles)");
      return true; // No rules means apply to all URLs (global styles like fonts)
    }

    const normalizedUrl = this.normalizeURL(url);
    const domain = this.extractDomain(url);

    this.debug(
      `Checking URL: ${url} (normalized: ${normalizedUrl}, domain: ${domain})`,
    );

    // First check exclude rules - if any exclude rule matches, return false
    for (const rule of rules) {
      if (
        !rule.include &&
        this.matchesRulePattern(normalizedUrl, domain, rule)
      ) {
        this.debug(`URL excluded by rule:`, rule);
        return false;
      }
    }

    // Then check include rules - if any include rule matches, return true
    for (const rule of rules) {
      if (
        rule.include &&
        this.matchesRulePattern(normalizedUrl, domain, rule)
      ) {
        this.debug(`URL included by rule:`, rule);
        return true;
      }
    }

    // If we have include rules but none matched, return false
    const hasIncludeRules = rules.some((rule) => rule.include);
    if (hasIncludeRules) {
      this.debug("No include rules matched");
      return false;
    }

    // If we only have exclude rules and none matched, return true
    this.debug("No rules matched, defaulting to match");
    return true;
  }

  /**
   * Check if a URL matches a specific domain rule (ignoring include/exclude)
   */
  private matchesRulePattern(
    url: string,
    domain: string,
    rule: DomainRule,
  ): boolean {
    try {
      switch (rule.kind) {
        case "domain":
          return this.matchesDomainPattern(domain, rule.pattern);

        case "url-prefix":
          return this.matchesUrlPrefixPattern(url, rule.pattern);

        case "url":
          return this.matchesUrlPattern(url, rule.pattern);

        case "regexp":
          return this.matchesRegexpPattern(url, rule.pattern);

        default:
          this.debug(`Unknown rule kind: ${rule.kind}`);
          return false;
      }
    } catch (error) {
      this.debug(`Error matching rule ${rule.kind}:${rule.pattern}:`, error);
      return false;
    }
  }

  /**
   * Match domain pattern (without include/exclude logic)
   */
  private matchesDomainPattern(domain: string, pattern: string): boolean {
    // Normalize both domain and pattern
    const normalizedDomain = domain.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();

    // Handle wildcard patterns
    if (normalizedPattern.startsWith("*.")) {
      // Match subdomains (e.g., *.example.com matches sub.example.com)
      const baseDomain = normalizedPattern.slice(2);
      return (
        normalizedDomain === baseDomain ||
        normalizedDomain.endsWith(`.${baseDomain}`)
      );
    }

    // Handle trailing wildcard patterns (e.g., old.reddit.com* matches old.reddit.com)
    if (normalizedPattern.endsWith("*")) {
      const basePattern = normalizedPattern.slice(0, -1);
      return normalizedDomain.startsWith(basePattern);
    }

    // Special handling for www subdomain - treat www.example.com the same as example.com
    if (
      normalizedDomain.startsWith("www.") &&
      normalizedDomain.substring(4) === normalizedPattern
    ) {
      return true;
    }

    if (
      normalizedPattern.startsWith("www.") &&
      normalizedPattern.substring(4) === normalizedDomain
    ) {
      return true;
    }

    // For most other cases, treat subdomains as matching their parent domain
    // This allows reddit.com to match old.reddit.com, mobile.reddit.com, etc.
    // But still keeps distinct domains like example.com and another-example.com separate
    if (normalizedDomain === normalizedPattern) {
      return true;
    }

    // Check if domain is a subdomain of pattern
    if (normalizedDomain.endsWith(`.${normalizedPattern}`)) {
      return true;
    }

    // Check if pattern is a subdomain of domain
    if (normalizedPattern.endsWith(`.${normalizedDomain}`)) {
      return true;
    }

    return false;
  }

  /**
   * Match URL prefix pattern (without include/exclude logic)
   */
  private matchesUrlPrefixPattern(url: string, pattern: string): boolean {
    const normalizedUrl = url.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();
    return normalizedUrl.startsWith(normalizedPattern);
  }

  /**
   * Match exact URL pattern (without include/exclude logic)
   */
  private matchesUrlPattern(url: string, pattern: string): boolean {
    const normalizedUrl = url.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();
    return normalizedUrl === normalizedPattern;
  }

  /**
   * Match regular expression pattern (without include/exclude logic)
   */
  private matchesRegexpPattern(url: string, pattern: string): boolean {
    try {
      const regex = new RegExp(pattern);
      return regex.test(url);
    } catch (error) {
      this.debug(`Invalid regex pattern: ${pattern}`, error);
      return false; // Invalid regex doesn't match
    }
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url: string): string {
    // Use regex to extract hostname to avoid URL constructor dependencies
    const urlRegex = new RegExp("^https?://([^/]+)", "i");
    const match = url.match(urlRegex);
    if (match) {
      return match[1].toLowerCase();
    } else {
      return url; // Fallback to original URL if parsing fails
    }
  }

  /**
   * Normalize URL for consistent processing
   */
  normalizeURL(url: string): string {
    // Use regex-based normalization to avoid URL constructor dependencies
    try {
      // Check if it's already a valid URL with protocol
      if (url.match(new RegExp("^[a-zA-Z][a-zA-Z0-9+.-]*://"))) {
        // Simple normalization: lowercase protocol and hostname, remove trailing slash
        let normalized = url.replace(
          new RegExp("^([a-zA-Z][a-zA-Z0-9+.-]*):\\/\\/"),
          (match, protocol) => protocol.toLowerCase() + "://",
        );

        // Extract and lowercase hostname (rough approximation)
        normalized = normalized.replace(
          new RegExp(":\\/\\/([^/]+)"),
          (match, hostname) => "://" + hostname.toLowerCase(),
        );

        return normalized.replace(/\/$/, ""); // Remove trailing slash
      }

      // For URLs without protocol, assume https://
      const urlWithProtocol = `https://${url}`;
      // Simple normalization
      const normalized = urlWithProtocol.replace(
        new RegExp(":\\/\\/([^/]+)"),
        (match, hostname) => "://" + hostname.toLowerCase(),
      );
      return normalized.replace(/\/$/, "");
    } catch (error) {
      this.debug(`Failed to normalize URL: ${url}`, error);
      return url; // Return original URL if parsing fails
    }
  }
}

// Default instance
export const domainDetector = new UserCSSDomainDetector();
