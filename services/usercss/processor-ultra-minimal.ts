/**
 * Ultra-Minimal UserCSS Processor
 *
 * Zero DOM references - designed to work in service worker environments.
 * Only contains essential parsing logic with no external dependencies.
 */

// Basic types (no external imports)
interface UltraMinimalStyleMeta {
  id: string;
  name: string;
  namespace: string;
  version: string;
  description: string;
  author: string;
  sourceUrl: string;
  domains: string[];
}

interface UltraMinimalParseResult {
  meta: UltraMinimalStyleMeta;
  css: string;
  metadataBlock: string;
  warnings: string[];
  errors: string[];
}

/**
 * Create a simple ID hash from name and namespace
 */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Parse UserCSS with zero DOM dependencies
 */
export function parseUserCSSUltraMinimal(raw: string): UltraMinimalParseResult {
  // No logging to avoid any potential DOM access
  const warnings: string[] = [];
  const errors: string[] = [];

  let css = raw;
  let metadataBlock = '';
  const domains: string[] = [];

  // Basic metadata extraction
  const metadataMatch = raw.match(/\/\*\s*==UserStyle==\s*\r?\n([\s\S]*?)\s*==\/UserStyle==\s*\*\//);
  let metadataContent = '';
  if (metadataMatch) {
    metadataBlock = metadataMatch[0];
    metadataContent = metadataMatch[1];
    css = raw.replace(metadataMatch[0], '').trim();
  } else {
    // Try to find a general comment block at the start
    const generalCommentMatch = raw.match(/^\/\*\*([\s\S]*?)\*\//);
    if (generalCommentMatch) {
      metadataBlock = generalCommentMatch[0];
      metadataContent = generalCommentMatch[1];
      css = raw.replace(generalCommentMatch[0], '').trim();
    } else {
      css = raw;
    }
  }

  // Extract basic directives
  const nameMatch = metadataContent.match(/@name\s+([^\r\n]+)/);
  const namespaceMatch = metadataContent.match(/@namespace\s+([^\r\n]+)/);
  const versionMatch = metadataContent.match(/@version\s+([^\r\n]+)/);

  const name = nameMatch ? nameMatch[1].trim() : '';
  const namespace = namespaceMatch ? namespaceMatch[1].trim() : '';
  const version = versionMatch ? versionMatch[1].trim() : '';

  // Validation - only if metadata block exists
  if (metadataMatch) {
    if (!name) {
      errors.push('Missing required @name directive');
    }
    if (!namespace) {
      errors.push('Missing required @namespace directive');
    }
    if (!version) {
      errors.push('Missing required @version directive');
    }
  }

  // Extract domains
  const domainMatches = metadataContent.match(/@domain\s+([^\r\n]+)/);
  if (domainMatches) {
    domains.push(...domainMatches[1].split(',').map(d => d.trim()).filter(Boolean));
  }

  // Extract from match patterns
  const matchMatches = metadataContent.match(/@match\s+([^\r\n]+)/g);
  if (matchMatches) {
    matchMatches.forEach(match => {
      const pattern = match.replace('@match', '').trim();
      // Very basic domain extraction from pattern
      if (pattern.includes('*://*.')) {
        const domain = pattern.split('*://*.')[1]?.split('/')[0];
        if (domain) domains.push(domain);
      }
    });
  }

  const meta: UltraMinimalStyleMeta = {
    id: name && namespace ? simpleHash(`${namespace}:${name}`) : '',
    name,
    namespace,
    version,
    description: '',
    author: '',
    sourceUrl: '',
    domains
  };

  return {
    meta,
    css,
    metadataBlock,
    warnings,
    errors
  };
}
