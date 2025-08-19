/**
 * UserCSS Processor
 *
 * Core functionality for parsing UserCSS files, extracting metadata,
 * and preparing CSS content for preprocessing and injection.
 */

import { StyleMeta, ParseResult, PreprocessorResult } from "./types";
import { detectPreprocessor, PreprocessorEngine } from "./preprocessor";

/**
 * Regular expression to match UserCSS metadata block
 * Handles both empty and populated blocks, flexible with missing closing comment
 */
const METADATA_BLOCK_REGEX =
  /\/\*\s*==UserStyle==\s*\n([\s\S]*?)\s*==\/UserStyle==\s*(?:\*\/|\n|$)/;

/**
 * Regular expression to extract individual metadata directives
 */
const DIRECTIVE_REGEX =
  /@([^\s\r\n]+)[^\S\r\n]*([\s\S]*?)(?=\n@|\n==\/UserStyle==|$)/g;

/**
 * Regular expression to match URL fields for validation
 */
const URL_REGEX = /^(https?:\/\/|ftp:\/\/|file:\/\/|data:)/;

/**
 * Parses a raw UserCSS string to extract metadata and CSS content
 *
 * @param raw - The raw UserCSS content
 * @returns ParseResult containing metadata, CSS, and diagnostics
 */
export function parseUserCSS(raw: string): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let css = raw;
  let meta: StyleMeta;
  let domains: string[] = [];

  try {
    // Extract metadata block with flexible matching
    const metadataBlockMatch = raw.match(METADATA_BLOCK_REGEX);

    if (!metadataBlockMatch) {
      throw new Error(
        "No UserCSS metadata block found. Expected block between ==UserStyle== and ==/UserStyle==",
      );
    }

    const metadataBlock = metadataBlockMatch[0];
    const metadataContent = metadataBlockMatch[1];
    const lineStart =
      (raw.substring(0, metadataBlockMatch.index!).match(/\n/g) || []).length +
      1;

    // Check for malformed blocks with nested comments
    if (metadataContent.includes("/*") || metadataContent.includes("*/")) {
      throw new Error(
        "No UserCSS metadata block found. Expected block between ==UserStyle== and ==/UserStyle==",
      );
    }

    // Remove metadata block from CSS content
    css = raw.replace(METADATA_BLOCK_REGEX, "").trim();

    // Parse individual directives
    const directives: Record<string, string> = {};
    const seenDirectives = new Set<string>();

    // Use a while loop to process all directives
    let match: RegExpExecArray | null;
    let currentLine = lineStart;

    while ((match = DIRECTIVE_REGEX.exec(metadataContent)) !== null) {
      const [fullMatch, directive, value] = match;
      const directiveLine =
        currentLine +
        (metadataContent.substring(0, match.index!).match(/\n/g) || []).length;

      // Check for duplicate directives
      if (seenDirectives.has(directive)) {
        errors.push(
          `Duplicate @${directive} directive found at line ${directiveLine}`,
        );
        continue;
      }

      seenDirectives.add(directive);
      directives[directive] = value.trim();

      // Update line position for next iteration
      const newlines = fullMatch.match(/\n/g);
      if (newlines) {
        currentLine += newlines.length;
      }
    }

    // Reset regex for multiple uses
    DIRECTIVE_REGEX.lastIndex = 0;

    // Handle special -moz-document directive that doesn't start with @
    // Look for -moz-document directive not preceded by @
    const mozDocumentMatch = metadataContent.match(/(?:^|\n)(-moz-document)[^\S\r\n]*([\s\S]*?)(?=\n@|\n==\/UserStyle==|$)/);
    if (mozDocumentMatch) {
      const [, directive, value] = mozDocumentMatch;
      if (!seenDirectives.has(directive)) {
        seenDirectives.add(directive);
        directives[directive] = value.trim();
      }
    }

    // Handle legacy -moz-document syntax
    if (directives["-moz-document"]) {
      warnings.push(
        "Legacy -moz-document syntax detected. Consider using modern @domain directive",
      );

      // Extract domains from -moz-document rules
      const mozDocumentRules = directives["-moz-document"];
      if (mozDocumentRules) {
        warnings.push(
          "Legacy -moz-document syntax detected. Consider using modern @domain directive",
        );
        // Match url(), url-prefix(), and domain() patterns
        const urlMatches = mozDocumentRules.match(
          /url\(["']?(https?:\/\/[^"')]+)["']?\)/g,
        );
        
        const urlPrefixMatches = mozDocumentRules.match(
          /url-prefix\(["']?(https?:\/\/[^"')]+)["']?\)/g,
        );

        if (urlMatches) {
          urlMatches.forEach((match) => {
            const urlMatch = match.match(
              /url\(["']?(https?:\/\/[^"')]+)["']?\)/,
            );
            if (urlMatch) {
              try {
                domains.push(new URL(urlMatch[1]).hostname);
              } catch (e) {
                // Ignore invalid URLs
              }
            }
          });
        }
        
        if (urlPrefixMatches) {
          urlPrefixMatches.forEach((match) => {
            const urlMatch = match.match(
              /url-prefix\(["']?(https?:\/\/[^"')]+)["']?\)/,
            );
            if (urlMatch) {
              try {
                domains.push(new URL(urlMatch[1]).hostname);
              } catch (e) {
                // Ignore invalid URLs
              }
            }
          });
        }
      }
    }

    // Validate required fields
    if (!directives.name) {
      errors.push("Missing required @name directive in metadata block");
    }

    if (!directives.namespace) {
      errors.push("Missing required @namespace directive in metadata block");
    }

    if (!directives.version) {
      errors.push("Missing required @version directive in metadata block");
    }

    // Handle modern @domain directive
    if (directives.domain) {
      const domainList = directives.domain
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      domainList.forEach((domain) => {
        // Basic domain validation
        if (domain.includes("://")) {
          warnings.push(
            `Domain "${domain}" includes protocol - should be hostname only`,
          );
        }

        if (
          domain.includes("/") ||
          domain.includes("?") ||
          domain.includes("#")
        ) {
          warnings.push(
            `Domain "${domain}" includes path or query - should be hostname only`,
          );
        }

        domains.push(domain);
      });
    }

    // Create metadata object
    meta = {
      id: generateId(directives.name || "", directives.namespace || ""),
      name: directives.name || "",
      namespace: directives.namespace || "",
      version: directives.version || "",
      description: directives.description || "",
      author: directives.author || "",
      sourceUrl:
        directives.homepageURL ||
        directives.supportURL ||
        directives.updateURL ||
        "",
      domains,
      compiledCss: "", // Will be filled in by preprocessing step
      variables: undefined, // Will be filled in by variable extraction
      assets: undefined, // Will be filled in by asset extraction
    };

    // Validate URLs if present
    if (directives.homepageURL && !URL_REGEX.test(directives.homepageURL)) {
      warnings.push(`Invalid @homepageURL format: ${directives.homepageURL}`);
    }

    if (directives.supportURL && !URL_REGEX.test(directives.supportURL)) {
      warnings.push(`Invalid @supportURL format: ${directives.supportURL}`);
    }

    if (directives.updateURL && !URL_REGEX.test(directives.updateURL)) {
      warnings.push(`Invalid @updateURL format: ${directives.updateURL}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      errors.push(`Parsing error: ${error.message}`);
    } else {
      errors.push("Unknown error occurred during parsing");
    }

    // Return partial result even on error
    meta = {
      id: "",
      name: "",
      namespace: "",
      version: "",
      description: "",
      author: "",
      sourceUrl: "",
      domains: [],
      compiledCss: "",
    };
  }

  return {
    meta,
    css,
    warnings,
    errors,
  };
}

/**
 * Processes a raw UserCSS string through the full pipeline:
 * 1. Parse to extract metadata
 * 2. Detect preprocessor
 * 3. Preprocess CSS
 * 4. Return combined result
 */
export async function processUserCSS(raw: string): Promise<ParseResult & { compiledCss: string; preprocessorErrors: string[] }> {
  // Step 1: Parse the UserCSS
  const parseResult = parseUserCSS(raw);
  
  // If parsing failed, return early
  if (parseResult.errors.length > 0) {
    return {
      ...parseResult,
      compiledCss: "",
      preprocessorErrors: []
    };
  }
  
  // Step 2: Detect preprocessor using the raw content to find @preprocessor directive
  const preprocessorDetection = detectPreprocessor(raw);
  const preprocessorType = preprocessorDetection.type;
  
  // Step 3: Preprocess CSS
  const engine = new PreprocessorEngine();
  const preprocessResult: PreprocessorResult = await engine.process(parseResult.css, preprocessorType);
  
  // Step 4: Return combined result
  return {
    ...parseResult,
    compiledCss: preprocessResult.css,
    preprocessorErrors: preprocessResult.errors
  };
}

/**
 * Generates a unique ID for a style based on name and namespace
 */
function generateId(name: string, namespace: string): string {
  // Create a simple hash-based ID for now
  // In production, this should be a proper UUID or hash
  const input = `${namespace}:${name}`;
  let hash = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Validates the position of an error within the source text
 */
export function getErrorPosition(
  text: string,
  index: number,
): { line: number; column: number } {
  const before = text.substring(0, index);
  const line = before.split("\n").length;
  const column = before.length - before.lastIndexOf("\n");

  return { line, column };
}

/**
 * Calculates line and column position from index
 */
export function getPositionFromIndex(
  text: string,
  index: number,
): { line: number; column: number } {
  const before = text.substring(0, index);
  const line = before.split("\n").length;
  const column = before.length - before.lastIndexOf("\n");

  return { line, column };
}

/**
 * Extracts metadata block with position information
 */
export function extractMetadataBlock(raw: string): {
  block: string | null;
  start: number;
  end: number;
} {
  const match = raw.match(METADATA_BLOCK_REGEX);

  if (!match) {
    return { block: null, start: -1, end: -1 };
  }

  // Check if the block is malformed (contains nested comments or invalid structure)
  const blockContent = match[1];
  if (blockContent.includes("/*") || blockContent.includes("*/")) {
    return { block: null, start: -1, end: -1 };
  }

  return {
    block: match[0],
    start: match.index!,
    end: match.index! + match[0].length,
  };
}
