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

  // Find all @-moz-document blocks
  // This regex matches the @-moz-document directive and its conditions
  const mozDocumentRegex = /@-moz-document\s+([^{\n\r]+?)\s*\{/g;
  let match;

  while ((match = mozDocumentRegex.exec(css)) !== null) {
    const conditionList = match[1];
    
    // Process each condition in the condition list
    const conditions = conditionList.split(',').map(c => c.trim());
    
    for (const condition of conditions) {
      // Check each pattern type
      for (const [type, regex] of Object.entries(DOMAIN_PATTERNS)) {
        // Create a new regex instance to avoid state issues
        const patternRegex = new RegExp(regex.source, 'g');
        let patternResult;
        
        while ((patternResult = patternRegex.exec(condition)) !== null) {
          const patternValue = patternResult[1];
          
          // Validate regex patterns
          if (type === 'regexp') {
            try {
              new RegExp(patternValue);
              rules.push({
                kind: 'regexp' as const,
                pattern: patternValue,
                include: true
              });
            } catch (e) {
              // Skip invalid regex patterns
              continue;
            }
          } else {
            // For other types, just add the rule
            rules.push({
              kind: mapType(type) as DomainRule['kind'],
              pattern: patternValue,
              include: true
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
    case 'url':
      return 'url';
    case 'urlPrefix':
      return 'url-prefix';
    case 'domain':
      return 'domain';
    case 'regexp':
      return 'regexp';
    default:
      return 'domain'; // fallback
  }
}

/**
 * Normalizes a URL pattern for consistent matching
 */
export function normalizePattern(pattern: string): string {
  try {
    // If it's a full URL, extract just the hostname
    if (pattern.includes('://')) {
      const url = new URL(pattern);
      return url.hostname;
    }
    // Remove leading/trailing whitespace
    return pattern.trim();
  } catch (e) {
    // If URL parsing fails, return as-is
    return pattern.trim();
  }
}