interface SelectParseResult {
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
  optionCss?: Record<string, string>;
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const opening = trimmed[0];
  const closing = trimmed[trimmed.length - 1];
  if (
    (opening === '"' || opening === "'" || opening === "`") &&
    opening === closing
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseJsonSafely<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function parseNumericTuple(
  raw: string,
  appendUnitToValue: boolean,
): {
  value: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const ensureString = (num: number | null | undefined, unit?: string) => {
    if (num === null || num === undefined || Number.isNaN(num)) {
      return "";
    }
    return appendUnitToValue && unit ? `${num}${unit}` : `${num}`;
  };

  if (trimmed.startsWith("[")) {
    const parsed = parseJsonSafely<Array<number | string | null>>(trimmed);
    if (!parsed) {
      return null;
    }

    const numericValues: Array<number | null> = [];
    let unit: string | undefined;

    for (const entry of parsed) {
      if (typeof entry === "number" || entry === null) {
        numericValues.push(entry);
        continue;
      }

      if (typeof entry === "string") {
        const numericCandidate = Number(entry);
        if (
          !Number.isNaN(numericCandidate) &&
          entry.trim() === `${numericCandidate}`
        ) {
          numericValues.push(numericCandidate);
        } else if (!unit) {
          unit = entry;
        }
      }
    }

    const [defaultValue, min, max, step] = numericValues;
    const normalizedDefault = defaultValue ?? 0;

    return {
      value: ensureString(normalizedDefault, unit),
      min: min === null ? undefined : min,
      max: max === null ? undefined : max,
      step: step === null ? undefined : step,
      unit,
    };
  }

  const numericValue = Number(trimmed);
  if (!Number.isNaN(numericValue)) {
    return {
      value: ensureString(numericValue),
    };
  }

  return null;
}

function parseEOTBlocks(value: string): SelectParseResult | null {
  const eotRegex = /([\w*-]+)\s+([^<<<]+?)\s*<<<EOT\s*([\s\S]*?)\s*EOT;/g;

  const options: Array<{ value: string; label: string }> = [];
  const optionCss: Record<string, string> = {};
  let defaultValue = "";
  let defaultCaptured = false;

  // Use matchAll to avoid regex state issues
  const matches = Array.from(value.matchAll(eotRegex));

  for (const match of matches) {
    const [, rawKey, rawLabel, cssContent] = match;
    const labelWithMarkers = stripWrappingQuotes(rawLabel.trim());
    const keyClean = rawKey.trim();

    const labelDefault = labelWithMarkers.replace(regex("\\*$"), "");
    const optionDefault =
      keyClean.includes("*") || labelWithMarkers.endsWith("*");

    const normalizedLabel = labelDefault;
    options.push({ value: normalizedLabel, label: normalizedLabel });

    optionCss[normalizedLabel] = cssContent
      .replace(regex(`^\\s*\n`), "")
      .replace(regex(`\n\\s*$`), "")
      .replace(regex(`\\*/`, "g"), "*/");

    if (optionDefault && !defaultCaptured) {
      defaultValue = normalizedLabel;
      defaultCaptured = true;
    }
  }

  if (!options.length) {
    return null;
  }

  if (!defaultCaptured) {
    defaultValue = options[0].value;
  }

  return {
    options,
    optionCss,
    defaultValue,
  };
}

function parseSelectOptions(raw: string): SelectParseResult | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes("<<<EOT")) {
    return parseEOTBlocks(trimmed);
  }

  if (trimmed.startsWith("{")) {
    const parsed = parseJsonSafely<Record<string, unknown>>(trimmed);
    if (!parsed) {
      return null;
    }

    const options: Array<{ value: string; label: string }> = [];
    let defaultValue: string | undefined;

    for (const [rawKey, rawVal] of Object.entries(parsed)) {
      const value = typeof rawVal === "string" ? rawVal : String(rawVal);
      const [rawName, rawLabelPart] = rawKey.split(":");

      let optionName = rawName.trim();
      let optionLabel = rawLabelPart?.trim() ?? optionName;

      const labelHasDefault = optionLabel.endsWith("*");
      const nameHasDefault = optionName.endsWith("*");

      if (labelHasDefault) {
        optionLabel = optionLabel.slice(0, -1);
      }
      if (nameHasDefault) {
        optionName = optionName.replace(regex(`\\*$`), "");
      }

      options.push({ value, label: optionLabel });

      if ((labelHasDefault || nameHasDefault) && defaultValue === undefined) {
        defaultValue = value;
      }
    }

    if (!options.length) {
      return null;
    }

    return {
      options,
      defaultValue: defaultValue ?? options[0].value,
    };
  }

  if (trimmed.startsWith("[")) {
    const parsed = parseJsonSafely<Array<string>>(trimmed);
    if (!parsed) {
      return null;
    }

    const options: Array<{ value: string; label: string }> = [];
    let defaultValue: string | undefined;

    for (const entry of parsed) {
      const optionEntry = entry.trim();
      const hasLabel = optionEntry.includes(":");
      let rawValuePart = optionEntry;
      let rawLabelPart = optionEntry;

      if (hasLabel) {
        const [valuePart, labelPart] = optionEntry.split(/:(.+)/);
        rawValuePart = valuePart.trim();
        rawLabelPart = labelPart.trim();
      }

      let isDefault = false;

      if (rawValuePart.endsWith("*")) {
        isDefault = true;
        rawValuePart = rawValuePart.slice(0, -1);
      }

      if (rawLabelPart.endsWith("*")) {
        isDefault = true;
        rawLabelPart = rawLabelPart.slice(0, -1);
      }

      const optionValue = hasLabel ? rawValuePart : rawLabelPart;
      const optionLabel = hasLabel ? rawLabelPart : rawLabelPart;

      options.push({ value: optionValue, label: optionLabel });

      if (isDefault && defaultValue === undefined) {
        defaultValue = optionValue;
      }
    }

    if (!options.length) {
      return null;
    }

    return {
      options,
      defaultValue: defaultValue ?? options[0].value,
    };
  }

  return null;
}

class VarDirectiveScanner {
  private position = 0;

  constructor(private readonly source: string) {}

  private skipWhitespace(): void {
    while (
      this.position < this.source.length &&
      /\s/.test(this.source[this.position]!)
    ) {
      this.position += 1;
    }
  }

  readWord(): string | null {
    this.skipWhitespace();
    const start = this.position;
    while (
      this.position < this.source.length &&
      /[A-Za-z_-]/.test(this.source[this.position]!)
    ) {
      this.position += 1;
    }
    if (this.position === start) {
      return null;
    }
    return this.source.slice(start, this.position);
  }

  readIdentifier(): string | null {
    this.skipWhitespace();
    const start = this.position;
    while (
      this.position < this.source.length &&
      /[A-Za-z0-9_-]/.test(this.source[this.position]!)
    ) {
      this.position += 1;
    }
    if (this.position === start) {
      return null;
    }
    return this.source.slice(start, this.position);
  }

  readLabel(): string | null {
    this.skipWhitespace();
    if (this.position >= this.source.length) {
      return null;
    }

    const char = this.source[this.position]!;
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      this.position += 1;
      let result = "";
      while (this.position < this.source.length) {
        const current = this.source[this.position]!;
        if (current === "\\" && this.position + 1 < this.source.length) {
          result += this.source[this.position + 1]!;
          this.position += 2;
          continue;
        }
        if (current === quote) {
          this.position += 1;
          break;
        }
        result += current;
        this.position += 1;
      }
      return result;
    }

    const start = this.position;
    while (
      this.position < this.source.length &&
      !/[\s{]/.test(this.source[this.position]!)
    ) {
      this.position += 1;
    }
    if (this.position === start) {
      return null;
    }
    return this.source.slice(start, this.position);
  }

  readRest(): string {
    this.skipWhitespace();
    if (this.position >= this.source.length) {
      return "";
    }
    return this.source.slice(this.position).trim();
  }
}

function parseVarDirective(value: string): VariableDescriptor | null {
  if (!value) {
    return null;
  }

  let trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.endsWith('"') && !trimmedValue.endsWith('\\"')) {
    const quoteCount = (trimmedValue.match(/"/g) || []).length;
    if (quoteCount % 2 === 1) {
      trimmedValue = trimmedValue.slice(0, -1);
    }
  }

  const scanner = new VarDirectiveScanner(trimmedValue);
  const rawType = scanner.readWord();
  if (!rawType) {
    return null;
  }

  const normalizedType = rawType.toLowerCase();
  const name = scanner.readIdentifier();
  if (!name) {
    return null;
  }

  const label = scanner.readLabel() ?? name;
  const remainder = scanner.readRest();

  if (normalizedType === "dropdown" || normalizedType === "image") {
    const selectFromDropdown = parseEOTBlocks(remainder);
    if (!selectFromDropdown) {
      return null;
    }
    return {
      name,
      type: "select",
      label,
      default: selectFromDropdown.defaultValue,
      value: selectFromDropdown.defaultValue,
      options: selectFromDropdown.options,
      optionCss: selectFromDropdown.optionCss,
    };
  }

  if (normalizedType === "select") {
    const parsedSelect = parseSelectOptions(remainder);
    if (!parsedSelect) {
      return null;
    }
    return {
      name,
      type: "select",
      label,
      default: parsedSelect.defaultValue,
      value: parsedSelect.defaultValue,
      options: parsedSelect.options,
      optionCss: parsedSelect.optionCss,
    };
  }

  if (normalizedType === "number" || normalizedType === "range") {
    const numeric = parseNumericTuple(remainder, normalizedType === "range");
    const fallbackValue = stripWrappingQuotes(remainder);
    const resolvedValue = numeric?.value || fallbackValue;

    const descriptor: VariableDescriptor = {
      name,
      type: normalizedType === "range" ? "range" : "number",
      label,
      default: resolvedValue,
      value: resolvedValue,
    };

    if (numeric) {
      descriptor.min = numeric.min;
      descriptor.max = numeric.max;
      descriptor.step = numeric.step;
      descriptor.unit = numeric.unit;
    }

    return descriptor;
  }

  const cleanedDefault = stripWrappingQuotes(remainder);

  if (normalizedType === "checkbox") {
    const normalized = cleanedDefault
      ? cleanedDefault === "true" || cleanedDefault === "1"
        ? "1"
        : "0"
      : "0";
    return {
      name,
      type: "checkbox",
      label,
      default: normalized,
      value: normalized,
    };
  }

  if (normalizedType === "color") {
    return {
      name,
      type: "color",
      label,
      default: cleanedDefault,
      value: cleanedDefault,
    };
  }

  if (normalizedType === "text") {
    return {
      name,
      type: "text",
      label,
      default: cleanedDefault,
      value: cleanedDefault,
    };
  }

  // Unknown types fall back to text handling to avoid data loss
  return {
    name,
    type: "unknown",
    label,
    default: cleanedDefault,
    value: cleanedDefault,
  };
}

/**
 * UserCSS Processor
 *
 * Core functionality for parsing UserCSS files, extracting metadata,
 * and preparing CSS content for preprocessing and injection.
 */

import { extractDomains } from "./domains";
import { regex } from "arkregex";
import {
  DomainRule,
  ParseResult,
  PreprocessorResult,
  StyleMeta,
  VariableDescriptor,
} from "./types";
import { resolveVariables } from "./variables";

/**
 * Regular expression to match UserCSS metadata block
 * Handles both empty and populated blocks, flexible with missing closing comment
 */
const METADATA_BLOCK_REGEX = new RegExp(
  "/*\\s*==UserStyle==\\s*\\r?\\n([\\s\\S]*?)\\s*==/UserStyle==\\s*(?:\\*/|\\r?\\n|\\$)",
);

/**
 * Regular expression to extract individual metadata directives
 */
const DIRECTIVE_REGEX = regex(
  `\\s*@([^\\s\r\n]+)[^\\S\r\n]*([\\s\\S]*?)(?=\r?\n\\s*@|\r\n==/UserStyle==|\\$)`,
);

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
 * Extract domains from regexp patterns
 */
function extractDomainsFromRegexp(pattern: string): string[] {
  const domains: string[] = [];

  try {
    // Remove protocol prefix
    let domainPart = pattern.replace(regex("^https?://"), "");

    // Handle escaped characters in the pattern
    domainPart = domainPart.replace(/\\./g, ".");

    // Remove regexp quantifiers and groups that don't affect the domain
    // This is a simplified approach - remove common patterns that don't affect domain extraction
    domainPart = domainPart.replace(regex("\\([^)]*\\)\\*", "g"), ""); // Remove optional groups like (gist\.)*
    domainPart = domainPart.replace(regex("\\([^)]*\\)\\?", "g"), ""); // Remove optional groups
    domainPart = domainPart.replace(regex("\\([^)]*\\)", "g"), ""); // Remove other groups

    // Split by common separators and extract domain-like parts
    const parts = domainPart.split(regex("[/?#]"))[0]; // Take everything before path/query/fragment

    // Look for domain patterns (word.word or word.word.word)
    const domainRegex =
      /\b([a-zA-Z0-9-]+\.[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)?)\b/g;
    let match;
    while (true) {
      match = domainRegex.exec(parts);
      if (match === null) break;
      const potentialDomain = match[1];
      // Basic validation - should have at least one dot and be reasonable length
      if (
        potentialDomain.length >= 4 &&
        potentialDomain.length <= 253 &&
        potentialDomain.includes(".")
      ) {
        domains.push(potentialDomain);
      }
    }
  } catch (error) {
    // If parsing fails, try fallback methods
    console.warn(
      "[ea-Processor] Failed to parse regexp pattern for domains:",
      pattern,
      error,
    );
  }

  return domains;
}

function isDomAvailable(): boolean {
  try {
    if (typeof globalThis === "undefined") {
      return false;
    }

    if (!Object.hasOwn(globalThis, "document")) {
      return false;
    }

    const doc = (globalThis as typeof globalThis & { document?: unknown })
      .document;
    return typeof doc !== "undefined" && doc !== null;
  } catch {
    return false;
  }
}

/**
 * Parses a raw UserCSS string to extract metadata and CSS content
 *
 * @param raw - The raw UserCSS content
 * @param variableOverrides - Optional current variable values to override defaults
 * @returns ParseResult containing metadata, CSS, and diagnostics
 */
export function parseUserCSS(
  raw: string,
  variableOverrides?: Record<string, string>,
): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let css = raw;
  let meta: StyleMeta;
  let metadataBlock: string = "";
  const domains: DomainRule[] = [];

  try {
    const metadataBlockMatch = raw.match(METADATA_BLOCK_REGEX);

    let metadataContent = "";
    if (metadataBlockMatch) {
      metadataBlock = metadataBlockMatch[0];
      metadataContent = metadataBlockMatch[1];
      css = raw.replace(metadataBlockMatch[0], "").trim();
    } else {
      // Try to find a general comment block at the start
      const generalCommentMatch = raw.match(/^\/\*\*([\s\S]*?)\*\//);
      if (generalCommentMatch) {
        metadataBlock = generalCommentMatch[0];
        metadataContent = generalCommentMatch[1];
        css = raw.replace(generalCommentMatch[0], "").trim();
      } else {
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

    const lineStart =
      (
        raw
          .substring(0, metadataBlock.indexOf(metadataContent))
          .match(/\r?\n/g) || []
      ).length + 1;

    // Check for malformed blocks - be more permissive but still safe
    // Only reject the most obvious cases of malformed metadata

    // Case 1: Metadata content ends with /* (indicates incomplete parsing due to fake closing marker)
    if (metadataContent.endsWith("/*")) {
      throw new Error(
        "No UserCSS metadata block found. Expected block between ==UserStyle== and ==/UserStyle==",
      );
    }

    // Case 2: Check for nested comments that contain UserCSS structural markers
    const nestedCommentPattern = regex("/\\*[\s\S]*?\\*/", "g");
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

    while (true) {
      match = DIRECTIVE_REGEX.exec(metadataContent);
      if (match === null) break;
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
          // Override default value if provided
          if (
            variableOverrides &&
            variableOverrides[variable.name] !== undefined
          ) {
            variable.value = variableOverrides[variable.name];
          }
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

        const regexpMatches = mozDocumentRules.match(
          /regexp\(["']?([^"')]+)["']?\)/g,
        );

        if (urlMatches) {
          urlMatches.forEach((match) => {
            const urlMatch = match.match(
              /url\(["']?(https?:\/\/[^"')]+)["']?\)/,
            );
            if (urlMatch) {
              domains.push({
                kind: "url",
                pattern: urlMatch[1],
                include: true,
              });
            }
          });
        }

        if (urlPrefixMatches) {
          urlPrefixMatches.forEach((match) => {
            const urlMatch = match.match(
              /url-prefix\(["']?(https?:\/\/[^"')]+)["']?\)/,
            );
            if (urlMatch) {
              domains.push({
                kind: "url-prefix",
                pattern: urlMatch[1],
                include: true,
              });
            }
          });
        }

        if (domainMatches) {
          domainMatches.forEach((match) => {
            const domainMatch = match.match(/domain\(["']?([^"')]+)["']?\)/);
            if (domainMatch) {
              domains.push({
                kind: "domain",
                pattern: domainMatch[1],
                include: true,
              });
            }
          });
        }

        if (regexpMatches) {
          regexpMatches.forEach((match) => {
            const regexpMatch = match.match(/regexp\(["']?([^"')]+)["']?\)/);
            if (regexpMatch) {
              // Parse the regexp pattern to extract domain
              const extractedDomains = extractDomainsFromRegexp(regexpMatch[1]);
              extractedDomains.forEach((domain) => {
                if (
                  !domains.some(
                    (d) => d.pattern === domain && d.kind === "domain",
                  )
                ) {
                  domains.push({
                    kind: "domain",
                    pattern: domain,
                    include: true,
                  });
                }
              });
            }
          });
        }
      }
    }

    // Parse CSS content for @-moz-document rules using the extractDomains utility
    const extractedRules = extractDomains(css);
    extractedRules.forEach((rule) => {
      if (rule.kind === "domain") {
        domains.push(rule);
      } else if (rule.kind === "url-prefix") {
        domains.push(rule);
      } else if (rule.kind === "regexp") {
        // Extract domains from regexp pattern
        const extractedDomains = extractDomainsFromRegexp(rule.pattern);
        extractedDomains.forEach((domain) => {
          if (
            !domains.some((d) => d.pattern === domain && d.kind === "domain")
          ) {
            domains.push({ kind: "domain", pattern: domain, include: true });
          }
        });
      }
    });

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

        domains.push({ kind: "domain", pattern: domain, include: true });
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
          domains.push({
            kind: "domain",
            pattern: extractHostname(dummyUrl),
            include: true,
          });
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
      license: directives.license,
      homepageURL: directives.homepageURL,
      supportURL: directives.supportURL,
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
  variableOverrides?: Record<string, string>,
): Promise<
  ParseResult & { compiledCss: string; preprocessorErrors: string[] }
> {
  // Step 1: Parse the UserCSS
  const parseResult = parseUserCSS(raw, variableOverrides);

  // If parsing failed, return early
  if (parseResult.errors.length > 0) {
    return {
      ...parseResult,
      compiledCss: "",
      preprocessorErrors: [],
    };
  }

  // Step 2: Detect preprocessor using the raw content to find @preprocessor directive
  const { detectPreprocessor } = await import("./preprocessor");
  const preprocessorDetection = detectPreprocessor(raw);
  const preprocessorType = preprocessorDetection.type;

  // Check if we're in a context where DOM APIs are available
  const hasDom = isDomAvailable();

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
        cssToProcess = await resolveVariables(
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

      // Step 3: Inject variables into CSS for preprocessing
      let cssToProcess = parseResult.css;
      if (parseResult.meta.variables) {
        // Inject variable definitions using preprocessor syntax
        const variableDefinitions = Object.entries(parseResult.meta.variables)
          .map(([name, variable]) => {
            if (preprocessorType === "less") {
              return `@${name}: ${variable.value};`;
            } else if (preprocessorType === "stylus") {
              return `${name} = ${variable.value};`;
            } else {
              return `@${name}: ${variable.value};`; // fallback
            }
          })
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
  let match = raw.match(METADATA_BLOCK_REGEX);

  // If no CSS comment block found, try preprocessor comment syntax
  if (!match) {
    const preprocessorRegex =
      /^\/\/\s*==UserStyle==\s*\r?\n([\s\S]*?)\r?\n\/\/\s*==\/UserStyle==\s*\r?\n?/m;
    match = raw.match(preprocessorRegex);
  }

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
