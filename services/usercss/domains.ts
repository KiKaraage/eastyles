/**
 * UserCSS Domain Rule Extraction
 *
 * Extracts domain matching rules from @-moz-document directives in UserCSS files.
 * Supports url(), url-prefix(), domain(), and regexp() patterns.
 */

import { DomainRule } from "@services/usercss/types";

/**
 * Regular expressions for matching different types of domain rules
 */
const DOMAIN_PATTERNS = {
  url: /url\(\s*["']?([^"')]+)["']?\s*\)/g,
  urlPrefix: /url-prefix\(\s*["']?([^"')]+)["']?\s*\)/g,
  domain: /domain\(\s*["']?([^"')]+)["']?\s*\)/g,
  regexp: /regexp\(\s*["']?([^"')]+)["']?\s*\)/g,
};

/**
 * Extracts domain rules from CSS content containing @-moz-document directives
 *
 * @param css - The CSS content to extract domain rules from
 * @returns Array of DomainRule objects
 */
export function extractDomains(css: string): DomainRule[] {
  const rules: DomainRule[] = [];

  // Find all @-moz-document blocks using matchAll to avoid regex state issues
  // This regex matches the @-moz-document directive and its conditions
  const mozDocumentRegex = /@-moz-document\s+([^}]+?)\s*\{/g;
  const matches = Array.from(css.matchAll(mozDocumentRegex));

  for (const match of matches) {
    const conditionList = match[1];

    // Process each condition in the condition list
    const conditions = conditionList.split(",").map((c) => c.trim());

    for (const condition of conditions) {
      // Check each pattern type
      for (const [type, regex] of Object.entries(DOMAIN_PATTERNS)) {
        // Use matchAll to avoid regex state issues
        const patternRegex = new RegExp(regex.source, "g");
        const patternMatches = Array.from(condition.matchAll(patternRegex));

        for (const patternResult of patternMatches) {
          const patternValue = patternResult[1];

          // Validate regex patterns
          if (type === "regexp") {
            try {
              new RegExp(patternValue);
              rules.push({
                kind: "regexp" as const,
                pattern: patternValue,
                include: true,
              });
            } catch {
              // Skip invalid regex patterns
              continue;
            }
          } else {
            // For domain rules, normalize the pattern; for others, use as-is
            const finalPattern =
              type === "domain" ? normalizePattern(patternValue) : patternValue;
            rules.push({
              kind: mapType(type) as DomainRule["kind"],
              pattern: finalPattern,
              include: true,
            });
          }
        }
      }
    }
  }

  return rules;
}

/**
 * Maps the CSS function names to our internal type names
 */
function mapType(cssType: string): string {
  switch (cssType) {
    case "url":
      return "url";
    case "urlPrefix":
      return "url-prefix";
    case "domain":
      return "domain";
    case "regexp":
      return "regexp";
    default:
      return "domain"; // fallback
  }
}

/**
 * Normalizes a URL pattern for consistent matching
 */
export function normalizePattern(pattern: string): string {
  try {
    // Remove leading/trailing whitespace
    let normalized = pattern.trim();

    // If it's a full URL, extract just the hostname
    if (normalized.includes("://")) {
      // Check if URL constructor is available (not in background scripts)
      if (typeof globalThis.URL !== "undefined") {
        const url = new URL(normalized);
        return url.hostname;
      } else {
        // Fallback extraction for background scripts
        const urlMatch = normalized.match(/^[a-zA-Z]+:\/\/([^/:]+)/);
        if (urlMatch) {
          return urlMatch[1];
        }
      }
    }

    // Remove trailing slashes
    normalized = normalized.replace(/\/+$/, "");

    return normalized;
  } catch {
    // If URL parsing fails, return as-is (but still trim and remove trailing slashes)
    return pattern.trim().replace(/\/+$/, "");
  }
}
