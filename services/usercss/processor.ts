/**
 * UserCSS Processor
 *
 * Core functionality for parsing UserCSS files, extracting metadata,
 * and preparing CSS content for preprocessing and injection.
 */

import {
  StyleMeta,
  ParseResult,
  PreprocessorResult,
  VariableDescriptor,
} from "./types";
import { resolveVariables } from "./variables";

/**
 * Supported preprocessor types
 */
type PreprocessorType = "none" | "less" | "stylus" | "uso";

/**
 * Detection result for preprocessor type
 */
interface PreprocessorDetection {
  type: PreprocessorType;
  source?: "metadata" | "heuristic"; // How we detected it
  confidence: number; // 0-1 confidence score
}

/**
 * Detects the preprocessor type by checking for explicit metadata directives
 * or using syntax heuristics
 *
 * @param text The CSS text to analyze
 * @returns PreprocessorDetection object with type, source, and confidence
 */
function detectPreprocessor(text: string): PreprocessorDetection {
  // First, check for explicit @preprocessor directive anywhere in the text
  const preprocessorMatch = text.match(/@preprocessor\s+([a-zA-Z]+)/);
  if (preprocessorMatch) {
    const preprocessor = preprocessorMatch[1].toLowerCase();

    switch (preprocessor) {
      case "less":
        return { type: "less", source: "metadata", confidence: 1.0 };
      case "stylus":
        return { type: "stylus", source: "metadata", confidence: 1.0 };
      case "uso":
        return { type: "uso", source: "metadata", confidence: 1.0 };
      default:
        return { type: "none", source: "metadata", confidence: 0.5 };
    }
  }

  // Check for USO-specific patterns (high priority)
  let usoScore = 0;
  if (text.includes("@advanced")) usoScore += 2;
  if (text.includes("<<<EOT")) usoScore += 2;
  if (text.includes("EOT;")) usoScore += 2;
  if (text.includes("dropdown")) usoScore += 1;
  if (text.includes("UserStyle")) usoScore += 1;

  if (usoScore >= 3) {
    return {
      type: "uso",
      source: "heuristic",
      confidence: Math.min(usoScore / 6, 0.9),
    };
  }

  // Heuristic detection based on syntax patterns
  let lessScore = 0;
  let stylusScore = 0;

  // Less patterns
  if (text.includes("@import")) lessScore += 1;
  if (text.includes("@extend")) lessScore += 1;
  if (text.includes("@mixin")) lessScore += 1;
  if (text.includes(".(")) lessScore += 1; // Less mixins
  if (text.includes("when ")) lessScore += 1; // Less guards
  if (text.includes(")")) lessScore += 1; // Less mixin calls like .btn()

  // Stylus patterns
  if (text.includes("&")) stylusScore += 1; // Parent selector
  if (text.includes("//")) stylusScore += 1; // Single line comments
  if (text.includes("->")) stylusScore += 1; // Property access
  if (text.includes("colors.")) stylusScore += 1; // Dot notation like colors.red
  if (text.includes("unless ")) stylusScore += 1; // Stylus unless
  if (text.includes("if ")) stylusScore += 1; // Stylus if

  // Handle cases where multiple preprocessors might match
  // USO has highest priority due to specific patterns
  if (usoScore > 0 && usoScore >= Math.max(lessScore, stylusScore)) {
    return {
      type: "uso",
      source: "heuristic",
      confidence: Math.min(usoScore / 6, 0.9),
    };
  }

  // Handle cases where both might match (prioritize less when scores are equal or close)
  if (
    lessScore >= 1 &&
    (lessScore >= stylusScore || stylusScore - lessScore <= 1)
  ) {
    return {
      type: "less",
      source: "heuristic",
      confidence: Math.min(lessScore / 4, 0.8),
    };
  }

  if (stylusScore > lessScore && stylusScore > 0) {
    return {
      type: "stylus",
      source: "heuristic",
      confidence: Math.min(stylusScore / 4, 0.8),
    };
  }

  // No preprocessor detected
  return { type: "none", source: undefined, confidence: 0 };
}

/**
 * Regular expression to match UserCSS metadata block
 * Handles both empty and populated blocks, flexible with missing closing comment
 */
const METADATA_BLOCK_REGEX =
  /\/\*\s*==UserStyle==\s*\r?\n([\s\S]*?)\s*==\/UserStyle==\s*(?:\*\/|\r?\n|$)/;

/**
 * Regular expression to extract individual metadata directives
 */
const DIRECTIVE_REGEX =
  /@([^\s\r\n]+)[^\S\r\n]*([\s\S]*?)(?=\r?\n@|\r?\n==\/UserStyle==|$)/g;

/**
 * Regular expression to match URL fields for validation
 */
const URL_REGEX = /^(https?:\/\/|ftp:\/\/|file:\/\/|data:)/;

/**
 * Extract hostname from URL string without using URL constructor
 */
function extractHostname(url: string): string {
  const match = url.match(/^https?:\/\/([^/]+)/);
  return match ? match[1] : url;
}

/**
 * Helper function to process variable matches and create VariableDescriptor
 */
function processVariableMatch(
  type: string,
  name: string,
  label: string,
  defaultValue: string,
): VariableDescriptor | null {
  let varType: VariableDescriptor["type"] = "unknown";
  if (type === "checkbox") {
    varType = "select";
  } else if (type === "color") {
    varType = "color";
  } else if (type === "number") {
    varType = "number";
  } else if (type === "text") {
    varType = "text";
  } else if (type === "select") {
    varType = "select";
  } else if (type === "dropdown") {
    // USO-specific dropdown type
    varType = "select";
  }

  const variable: VariableDescriptor = {
    name,
    type: varType,
    label,
    default: defaultValue || "",
    value: defaultValue || "",
  };

  // Handle number type with min/max/step
  if (type === "number" && defaultValue) {
    const parts = defaultValue.trim().split(/\s+/);
    if (parts.length >= 4) {
      // Format: default min max step
      variable.default = parts[0];
      variable.value = parts[0];
      variable.min = parseFloat(parts[1]);
      variable.max = parseFloat(parts[2]);
      // step is parts[3] but we don't use it in the UI
    }
  }

  if (type === "checkbox") {
    variable.options = ["0", "1"];
    // For checkbox, default should be "0" or "1"
    if (defaultValue && (defaultValue === "0" || defaultValue === "1")) {
      variable.value = defaultValue;
    } else {
      variable.value = "0"; // Default to off
    }
  } else if ((type === "select" || type === "dropdown") && defaultValue) {
    // Check if this is a USO EOT block format
    if (defaultValue.includes("<<<EOT")) {
      const eotResult = parseEOTBlocks(defaultValue);
      if (eotResult) {
        variable.options = eotResult.options;
        variable.optionCss = eotResult.optionCss;
        variable.default = eotResult.defaultValue;
        variable.value = eotResult.defaultValue;
      }
    } else {
      // Parse select options from format like ["option1","option2","option3"]
      try {
        const optionsMatch = defaultValue.match(/^\[([^\]]*)\]$/);
        if (optionsMatch) {
          const optionsString = optionsMatch[1];
          variable.options = optionsString
            .split(",")
            .map((opt) => opt.trim().replace(/^["']|["']$/g, ""));
          // Set the first option as the default value if it's an array
          if (variable.options.length > 0) {
            variable.value = variable.options[0];
          }
        }
      } catch {
        console.warn("Failed to parse select options:", defaultValue);
      }
    }
  }

  return variable;
}

/**
 * Parses USO EOT blocks to extract dropdown options and CSS snippets
 */
function parseEOTBlocks(value: string): {
  options: string[];
  optionCss: Record<string, string>;
  defaultValue: string;
} | null {
  // Regular expression to match EOT blocks
  // Format: [*]optionLabel "Display Label" <<<EOT css content EOT;
  const eotRegex = /(\*?\w+)\s+"([^"]+)"\s*<<<EOT\s*([\s\S]*?)\s*EOT;/g;

  const options: string[] = [];
  const optionCss: Record<string, string> = {};
  let defaultValue = "";
  let hasDefault = false;

  let match;
  while ((match = eotRegex.exec(value)) !== null) {
    const [, optionKey, displayLabel, cssContent] = match;

    // Check if this is the default option (marked with *)
    const isDefault = optionKey.startsWith("*");

    options.push(displayLabel);
    // Preserve indentation but remove leading/trailing whitespace
    optionCss[displayLabel] = cssContent
      .replace(/^\s*\n/, "")
      .replace(/\n\s*$/, "");

    if (isDefault && !hasDefault) {
      defaultValue = cssContent.trim();
      hasDefault = true;
    }
  }

  // If no default was found, use the first option's CSS content as default
  if (!hasDefault && options.length > 0) {
    defaultValue = optionCss[options[0]];
  }

  return options.length > 0 ? { options, optionCss, defaultValue } : null;
}

/**
 * Parses a @var directive value into a VariableDescriptor
 */
function parseVarDirective(value: string): VariableDescriptor | null {
  // Remove trailing quote if present (bug from DIRECTIVE_REGEX)
  let trimmedValue = value.trim();
  if (trimmedValue.endsWith('"') && !trimmedValue.endsWith('\\"')) {
    trimmedValue = trimmedValue.slice(0, -1);
  }

  // Handle @advanced dropdown format first
  if (trimmedValue.startsWith("dropdown")) {
    // Manual parsing approach for dropdown format
    let pos = 0;

    // Skip "dropdown" and whitespace
    while (pos < trimmedValue.length && /\w/.test(trimmedValue[pos])) pos++; // skip "dropdown"
    while (pos < trimmedValue.length && /\s/.test(trimmedValue[pos])) pos++; // skip whitespace

    // Parse name (allow hyphens and underscores)
    const nameStart = pos;
    while (pos < trimmedValue.length && /[\w\-_]/.test(trimmedValue[pos]))
      pos++;
    const name = trimmedValue.substring(nameStart, pos);

    // Skip whitespace
    while (pos < trimmedValue.length && /\s/.test(trimmedValue[pos])) pos++;

    // Parse label (quoted)
    if (pos < trimmedValue.length && trimmedValue[pos] === '"') {
      pos++; // Skip opening quote
      const labelStart = pos;
      while (pos < trimmedValue.length && trimmedValue[pos] !== '"') pos++;
      const label = trimmedValue.substring(labelStart, pos);
      if (pos < trimmedValue.length) pos++; // Skip closing quote

      // Skip whitespace
      while (pos < trimmedValue.length && /\s/.test(trimmedValue[pos])) pos++;

      // Find the opening brace
      if (pos < trimmedValue.length && trimmedValue[pos] === "{") {
        pos++; // Skip opening brace
        const optionsStart = pos;

        // Find the matching closing brace
        let braceCount = 1;
        while (pos < trimmedValue.length && braceCount > 0) {
          if (trimmedValue[pos] === "{") braceCount++;
          else if (trimmedValue[pos] === "}") braceCount--;
          pos++;
        }

        if (braceCount === 0) {
          const optionsBlock = trimmedValue
            .substring(optionsStart, pos - 1)
            .trim();
          const eotResult = parseEOTBlocks(optionsBlock);
          if (eotResult) {
            return {
              name,
              type: "select",
              label,
              default: eotResult.defaultValue,
              value: eotResult.defaultValue,
              options: eotResult.options,
              optionCss: eotResult.optionCss,
            };
          }
        }
      }
    }

    return null;
  }

  // Manual parsing approach for complex cases with quoted strings
  let pos = 0;

  // Skip whitespace
  while (pos < trimmedValue.length && /\s/.test(trimmedValue[pos])) {
    pos++;
  }

  // Parse type
  const typeStart = pos;
  while (pos < trimmedValue.length && /\w/.test(trimmedValue[pos])) {
    pos++;
  }
  const type = trimmedValue.substring(typeStart, pos);

  // Skip whitespace
  while (pos < trimmedValue.length && /\s/.test(trimmedValue[pos])) {
    pos++;
  }

  // Parse name (allow hyphens and underscores)
  const nameStart = pos;
  while (pos < trimmedValue.length && /[\w\-_]/.test(trimmedValue[pos])) {
    pos++;
  }
  const name = trimmedValue.substring(nameStart, pos);

  // Skip whitespace
  while (pos < trimmedValue.length && /\s/.test(trimmedValue[pos])) {
    pos++;
  }

  // Parse label (quoted)
  if (pos < trimmedValue.length && trimmedValue[pos] === '"') {
    pos++; // Skip opening quote
    const labelStart = pos;
    while (pos < trimmedValue.length && trimmedValue[pos] !== '"') {
      pos++;
    }
    const label = trimmedValue.substring(labelStart, pos);
    if (pos < trimmedValue.length) {
      pos++; // Skip closing quote
    }

    // Skip whitespace
    while (pos < trimmedValue.length && /\s/.test(trimmedValue[pos])) {
      pos++;
    }

    // Parse default value
    let defaultValue = "";
    if (pos < trimmedValue.length) {
      if (trimmedValue[pos] === '"') {
        // Quoted default value
        pos++; // Skip opening quote
        const defaultStart = pos;
        while (pos < trimmedValue.length && trimmedValue[pos] !== '"') {
          pos++;
        }
        defaultValue = trimmedValue.substring(defaultStart, pos);
        if (pos < trimmedValue.length) {
          pos++; // Skip closing quote
        }
      } else {
        // Unquoted default value
        const defaultStart = pos;
        pos = trimmedValue.length; // Take rest
        defaultValue = trimmedValue.substring(defaultStart, pos);
      }
    }

    return processVariableMatch(type, name, label, defaultValue);
  }

  return null;
}

/**
 * Parses a raw UserCSS string to extract metadata and CSS content
 *
 * @param raw - The raw UserCSS content
 * @returns ParseResult containing metadata, CSS, and diagnostics
 */
export function parseUserCSS(raw: string): ParseResult {
  console.log("[parseUserCSS] Function called, checking environment...");

  // Safely check for document availability without triggering ReferenceError
  let documentType: string;
  try {
    console.log("[parseUserCSS] About to check typeof document...");
    documentType = typeof document;
    console.log(
      "[parseUserCSS] typeof document check successful:",
      documentType,
    );
  } catch (error) {
    console.log("[parseUserCSS] typeof document check failed:", error);
    documentType = "undefined (not available)";
  }

  console.log("[parseUserCSS] typeof document:", documentType);
  console.log("[parseUserCSS] typeof window:", typeof globalThis.window);
  console.log(
    "[parseUserCSS] 'document' in globalThis:",
    "document" in globalThis,
  );

  const warnings: string[] = [];
  const errors: string[] = [];
  let css = raw;
  let meta: StyleMeta;
  let metadataBlock: string = "";
  const domains: string[] = [];

  try {
    console.log("[parseUserCSS] Starting metadata extraction...");
    console.log("[parseUserCSS] Matching metadata block...");
    const metadataBlockMatch = raw.match(METADATA_BLOCK_REGEX);

    let metadataContent = "";
    if (metadataBlockMatch) {
      console.log("[parseUserCSS] Metadata block found");
      metadataBlock = metadataBlockMatch[0];
      metadataContent = metadataBlockMatch[1];
      css = raw.replace(metadataBlockMatch[0], "").trim();
    } else {
      console.log("[parseUserCSS] No ==UserStyle== metadata block found, checking for general comment");
      // Try to find a general comment block at the start
      const generalCommentMatch = raw.match(/^\/\*\*([\s\S]*?)\*\//);
      if (generalCommentMatch) {
        console.log("[parseUserCSS] Found general comment block");
        metadataBlock = generalCommentMatch[0];
        metadataContent = generalCommentMatch[1];
        css = raw.replace(generalCommentMatch[0], "").trim();
      } else {
        console.log("[parseUserCSS] No metadata block found, proceeding without metadata");
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
          variables: {},
          assets: undefined,
        };
        css = raw;
        metadataBlock = "";
        return {
          meta,
          css,
          metadataBlock,
          warnings,
          errors,
        };
      }
    }

    console.log("[parseUserCSS] Processing metadata content...");
    const trimmedMetadataContent = metadataContent.trim();
    const lineStart =
      (raw.substring(0, metadataBlock.indexOf(metadataContent)).match(/\r?\n/g) || [])
        .length + 1;

    // Check for malformed blocks - be more permissive but still safe
    // Only reject the most obvious cases of malformed metadata

    // Case 1: Metadata content ends with /* (indicates incomplete parsing due to fake closing marker)
    if (metadataContent.endsWith("/*")) {
      throw new Error(
        "No UserCSS metadata block found. Expected block between ==UserStyle== and ==/UserStyle==",
      );
    }

    // Case 2: Check for nested comments that contain UserCSS structural markers
    const nestedCommentPattern = /\/\*[\s\S]*?\*\//g;
    const nestedComments = metadataContent.match(nestedCommentPattern);

    if (nestedComments && nestedComments.length > 0) {
      // Check if any nested comments contain UserCSS markers that could confuse parsing
      const hasConflictingMarkers = nestedComments.some(
        (comment) =>
          comment.includes("==UserStyle==") ||
          comment.includes("==/UserStyle=="),
      );

      if (hasConflictingMarkers) {
        throw new Error(
          "No UserCSS metadata block found. Metadata contains conflicting comment structures.",
        );
      }

      // Allow other nested comments but warn about them
      warnings.push(
        "Metadata block contains nested comments - ensure they don't interfere with parsing",
      );
    }



    // Parse individual directives
    const directives: Record<string, string> = {};
    const seenDirectives = new Set<string>();
    const variables: Record<string, VariableDescriptor> = {};

    // Use a while loop to process all directives
    let match: RegExpExecArray | null;
    let currentLine = lineStart;

    while ((match = DIRECTIVE_REGEX.exec(metadataContent)) !== null) {
      const [fullMatch, directive, value] = match;
      const directiveLine =
        currentLine +
        (metadataContent.substring(0, match.index!).match(/\r?\n/g) || [])
          .length;

      // Check for duplicate directives (allow multiple @var and @advanced)
      if (
        directive !== "var" &&
        directive !== "advanced" &&
        seenDirectives.has(directive)
      ) {
        errors.push(
          `Duplicate @${directive} directive found at line ${directiveLine}`,
        );
        continue;
      }

      if (directive !== "var" && directive !== "advanced") {
        seenDirectives.add(directive);
      }
      directives[directive] = value.trim();

      // Process @var and @advanced directives to create variables
      if (directive === "var" || directive === "advanced") {
        const variable = parseVarDirective(value);
        if (variable) {
          variables[variable.name] = variable;
        }
      }

      // Update line position for next iteration
      const newlines = fullMatch.match(/\r?\n/g);
      if (newlines) {
        currentLine += newlines.length;
      }
    }

    // Reset regex for multiple uses
    DIRECTIVE_REGEX.lastIndex = 0;

    // Handle special -moz-document directive that doesn't start with @
    const mozDocumentMatch = metadataContent.match(
      /(?:^|\r?\n)(-moz-document)[^\S\r\n]*([\s\S]*?)(?=\r?\n@|\r?\n==\/UserStyle==|$)/,
    );
    if (mozDocumentMatch) {
      const [, directive, value] = mozDocumentMatch;
      if (!seenDirectives.has(directive)) {
        if (directive === "var" || directive === "advanced") {
          const variable = parseVarDirective(value);
          if (variable) {
            variables[variable.name] = variable;
          }
        } else {
          seenDirectives.add(directive);
          directives[directive] = value.trim();
        }
      }
    }

    // Handle legacy -moz-document syntax in metadata
    if (directives["-moz-document"]) {
      warnings.push(
        "Legacy -moz-document syntax detected. Consider using modern @domain directive",
      );

      // Extract domains from -moz-document rules
      const mozDocumentRules = directives["-moz-document"];
      if (mozDocumentRules) {
        // Match url(), url-prefix(), and domain() patterns
        const urlMatches = mozDocumentRules.match(
          /url\(["']?(https?:\/\/[^"')]+)["']?\)/g,
        );

        const urlPrefixMatches = mozDocumentRules.match(
          /url-prefix\(["']?(https?:\/\/[^"')]+)["']?\)/g,
        );

        const domainMatches = mozDocumentRules.match(
          /domain\(["']?([^"')]+)["']?\)/g,
        );

        if (urlMatches) {
          urlMatches.forEach((match) => {
            const urlMatch = match.match(
              /url\(["']?(https?:\/\/[^"')]+)["']?\)/,
            );
            if (urlMatch) {
              domains.push(extractHostname(urlMatch[1]));
            }
          });
        }

        if (urlPrefixMatches) {
          urlPrefixMatches.forEach((match) => {
            const urlMatch = match.match(
              /url-prefix\(["']?(https?:\/\/[^"')]+)["']?\)/,
            );
            if (urlMatch) {
              domains.push(extractHostname(urlMatch[1]));
            }
          });
        }

        if (domainMatches) {
          domainMatches.forEach((match) => {
            const domainMatch = match.match(/domain\(["']?([^"')]+)["']?\)/);
            if (domainMatch) {
              domains.push(domainMatch[1]);
            }
          });
        }
      }
    }

    // Parse CSS content for @-moz-document rules
    const mozDocumentCssMatch = css.match(/@-moz-document\s+([^}]+)\s*\{/);
    if (mozDocumentCssMatch) {
      const mozDocumentRule = mozDocumentCssMatch[1];

      // Extract domains from CSS @-moz-document rules
      const domainMatches = mozDocumentRule.match(
        /domain\(["']?([^"')]+)["']?\)/g,
      );
      if (domainMatches) {
        domainMatches.forEach((match) => {
          const domainMatch = match.match(/domain\(["']?([^"')]+)["']?\)/);
          if (domainMatch) {
            domains.push(domainMatch[1]);
          }
        });
      }

      // Extract url-prefix patterns from CSS @-moz-document rules
      const urlPrefixMatches = mozDocumentRule.match(
        /url-prefix\(["']?([^"')]+)["']?\)/g,
      );
      if (urlPrefixMatches) {
        urlPrefixMatches.forEach((match) => {
          const urlMatch = match.match(/url-prefix\(["']?([^"')]+)["']?\)/);
          if (urlMatch) {
            domains.push(extractHostname(urlMatch[1]));
          }
        });
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

    // Handle @match directive (similar to @include)
    if (directives.match) {
      const matchList = directives.match
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      matchList.forEach((match) => {
        // Extract hostname from URL pattern
        try {
          // Replace wildcards with dummy values for URL parsing
          let dummyUrl = match.replace(/\*/g, "dummy");
          if (dummyUrl.startsWith("dummy://")) {
            dummyUrl = "https://" + dummyUrl.substring(8);
          } else if (
            !dummyUrl.startsWith("https://") &&
            !dummyUrl.startsWith("http://")
          ) {
            dummyUrl = "https://" + dummyUrl;
          }
          domains.push(extractHostname(dummyUrl));
        } catch {
          warnings.push(`Invalid @match pattern: ${match}`);
        }
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
      variables: variables || {},
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
    metadataBlock,
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
export async function processUserCSS(
  raw: string,
): Promise<
  ParseResult & { compiledCss: string; preprocessorErrors: string[] }
> {
  // Step 1: Parse the UserCSS
  const parseResult = parseUserCSS(raw);

  // If parsing failed, return early
  if (parseResult.errors.length > 0) {
    return {
      ...parseResult,
      compiledCss: "",
      preprocessorErrors: [],
    };
  }

  // Step 2: Detect preprocessor using the raw content to find @preprocessor directive
  const preprocessorDetection = detectPreprocessor(raw);
  const preprocessorType = preprocessorDetection.type;

  // Check if we're in a context where DOM APIs are available
  let hasDom = false;
  try {
    hasDom = typeof globalThis.window !== "undefined";
  } catch {
    // If accessing window throws, we definitely don't have DOM access
    hasDom = false;
  }

  // If we're in a background context where DOM is not available,
  // and we need a preprocessor other than USO, return the parsed result without preprocessing
  if (!hasDom && preprocessorType !== "uso" && preprocessorType !== "none") {
    console.warn(
      `DOM not available, skipping ${preprocessorType} preprocessing`,
    );
    return {
      ...parseResult,
      compiledCss: parseResult.css,
      preprocessorErrors: [
        `Preprocessor ${preprocessorType} requires DOM access, skipping preprocessing`,
      ],
    };
  }

  if (preprocessorType === "uso") {
    // For USO mode, no preprocessing needed, just resolve variables
    let cssToProcess = parseResult.css;
    if (parseResult.meta.variables) {
      const variableValues = Object.fromEntries(
        Object.entries(parseResult.meta.variables).map(([name, variable]) => [
          name,
          variable.value,
        ]),
      );
      // Check if we have DOM access before trying to resolve variables
      if (hasDom) {
        cssToProcess = resolveVariables(
          cssToProcess,
          variableValues,
          parseResult.meta.variables,
        );
      }
    }
    return {
      ...parseResult,
      compiledCss: cssToProcess,
      preprocessorErrors: [],
    };
  } else if (preprocessorType === "none") {
    // For no preprocessor, just return the parsed CSS
    return {
      ...parseResult,
      compiledCss: parseResult.css,
      preprocessorErrors: [],
    };
  } else {
    // For other preprocessors (Less, Stylus), import the engine only if DOM is available
    if (!hasDom) {
      return {
        ...parseResult,
        compiledCss: parseResult.css,
        preprocessorErrors: [
          `Preprocessor ${preprocessorType} requires DOM access, skipping preprocessing`,
        ],
      };
    }

    try {
      const { PreprocessorEngine } = await import("./preprocessor");
      const engine = new PreprocessorEngine();

      // Step 3: Inject variables into CSS if preprocessor is used
      let cssToProcess = parseResult.css;
      if (parseResult.meta.variables) {
        // For other preprocessors, inject variable definitions
        const variableDefinitions = Object.entries(parseResult.meta.variables)
          .map(([name, variable]) => `${name} = ${variable.value}`)
          .join("\n");
        cssToProcess = variableDefinitions + "\n" + cssToProcess;
      }

      // Step 4: Preprocess CSS
      const preprocessResult: PreprocessorResult = await engine.process(
        cssToProcess,
        preprocessorType,
      );

      // Step 5: Return combined result
      return {
        ...parseResult,
        compiledCss: preprocessResult.css,
        preprocessorErrors: preprocessResult.errors,
      };
    } catch (importError) {
      // If importing the preprocessor engine fails, return the original CSS
      return {
        ...parseResult,
        compiledCss: parseResult.css,
        preprocessorErrors: [
          `Failed to load ${preprocessorType} preprocessor: ${importError instanceof Error ? importError.message : "Unknown error"}`,
        ],
      };
    }
  }
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
  const lines = before.split(/\r?\n/);
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;

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
  const lines = before.split(/\r?\n/);
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;

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
