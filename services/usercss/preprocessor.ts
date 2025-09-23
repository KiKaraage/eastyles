/**
 * UserCSS Preprocessor Detection and Processing
 *
 * Handles detection of Less and Stylus preprocessors and provides compilation
 * capabilities with caching support.
 */

/**
 * Supported preprocessor types
 */
export type PreprocessorType = "none" | "less" | "stylus" | "uso";

/**
 * Detection result for preprocessor type
 */
export interface PreprocessorDetection {
  type: PreprocessorType;
  source?: "metadata" | "heuristic"; // How we detected it
  confidence: number; // 0-1 confidence score
}

/**
 * Preprocessor detection function
 *
 * Detects the preprocessor type by checking for explicit metadata directives
 * or using syntax heuristics
 *
 * @param text The CSS text to analyze
 * @returns PreprocessorDetection object with type, source, and confidence
 */
export function detectPreprocessor(text: string): PreprocessorDetection {
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
 * Simple helper function to get preprocessor name
 */
export function getPreprocessorName(type: PreprocessorType): string {
  switch (type) {
    case "less":
      return "Less";
    case "stylus":
      return "Stylus";
    case "uso":
      return "USO";
    case "none":
      return "None";
    default:
      return "Unknown";
  }
}

/**
 * Result interface for preprocessor compilation
 */
export interface PreprocessorResult {
  css: string;
  warnings: string[];
  errors: string[];
}

/**
 * Cache entry interface for LRU cache
 */
interface CacheEntry {
  result: PreprocessorResult;
  timestamp: number;
}

/**
 * LRU Cache implementation for preprocessor results
 */
class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  get(key: string): PreprocessorResult | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.result;
    }
    return undefined;
  }

  set(key: string, result: PreprocessorResult): void {
    // Remove if already exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Remove oldest if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    // Add new entry
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * PreprocessorEngine class with LRU caching and lazy loading
 */
export class PreprocessorEngine {
  private cache: LRUCache;
  private lessModule: unknown = null;
  private stylusModule: unknown = null;

  constructor(cacheSize: number = 50) {
    this.cache = new LRUCache(cacheSize);
  }

  /**
   * Safely check if DOM is available
   */
  private isDomAvailable(): boolean {
    try {
      return typeof window !== "undefined" && typeof document !== "undefined";
    } catch {
      return false;
    }
  }

  /**
   * Generate cache key from engine and content hash
   */
  private generateCacheKey(engine: PreprocessorType, content: string): string {
    // Simple hash function for content
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${engine}:${hash.toString(36)}`;
  }

  /**
   * Lazy load Less preprocessor
   */
  private async loadLess(): Promise<unknown> {
    if (!this.lessModule) {
      try {
        // Guard against running in non-browser context
        if (!this.isDomAvailable()) {
          throw new Error("Less preprocessor requires DOM access");
        }

        // Import Less with additional error handling
        try {
          this.lessModule = await import("less");
        } catch (importError) {
          const errorMessage = (importError as Error).message;
          if (
            errorMessage.includes("document is not defined") ||
            errorMessage.includes("DOM")
          ) {
            throw new Error("Less preprocessor requires DOM access");
          }
          throw importError;
        }
      } catch (error) {
        throw new Error(
          `Failed to load Less preprocessor: ${(error as Error).message}`,
        );
      }
    }
    return this.lessModule;
  }

  /**
   * Lazy load Stylus preprocessor
   */
  private async loadStylus(): Promise<unknown> {
    if (!this.stylusModule) {
      try {
        // Guard against running in non-browser context
        if (!this.isDomAvailable()) {
          throw new Error("Stylus preprocessor requires DOM access");
        }

        // Import Stylus with additional error handling
        try {
          this.stylusModule = await import("stylus");
        } catch (importError) {
          const errorMessage = (importError as Error).message;
          if (
            errorMessage.includes("document is not defined") ||
            errorMessage.includes("DOM")
          ) {
            throw new Error("Stylus preprocessor requires DOM access");
          }
          throw importError;
        }
      } catch (error) {
        throw new Error(
          `Failed to load Stylus preprocessor: ${(error as Error).message}`,
        );
      }
    }
    return this.stylusModule;
  }

  /**
   * Process CSS with Less preprocessor
   */
  private async processLess(text: string): Promise<PreprocessorResult> {
    try {
      const less = (await this.loadLess()) as {
        default: {
          render: (text: string) => Promise<{
            css: string;
            warnings?: { message: string; line?: number; column?: number }[];
          }>;
        };
      };
      const result = await less.default.render(text);

      // Handle background context error
      if (
        result &&
        typeof result === "object" &&
        "message" in result &&
        typeof result.message === "string" &&
        result.message.includes("cannot run in background context")
      ) {
        return {
          css: text,
          warnings: ["Less preprocessor not available in background context"],
          errors: [],
        };
      }

      const warnings: string[] = [];
      const errors: string[] = [];

      // Extract warnings if available
      if (result.warnings && Array.isArray(result.warnings)) {
        result.warnings.forEach(
          (warning: { message: string; line?: number; column?: number }) => {
            const location =
              warning.line && warning.column
                ? ` (Line ${warning.line}, Column ${warning.column})`
                : "";
            warnings.push(`Warning: ${warning.message}${location}`);
          },
        );
      }

      // Handle both object result (real Less) and direct string result (for mocking)
      const css = typeof result === "string" ? result : result.css;

      return {
        css: css || "",
        warnings,
        errors,
      };
    } catch (error: unknown) {
      const err = error as {
        message: string;
        line?: number;
        column?: number;
        filename?: string;
      };

      // Check if this is a module import error or compilation error
      if (err.message && err.message.includes("Module not found")) {
        return {
          css: "",
          warnings: [],
          errors: [`Failed to process with less: ${err.message}`],
        };
      }

      // This is a Less compilation error
      const location =
        err.line && err.column
          ? ` (Line ${err.line}, Column ${err.column})`
          : "";
      const filename = err.filename ? ` in ${err.filename}` : "";

      return {
        css: "",
        warnings: [],
        errors: [
          `Less compilation failed: ${err.message}${location}${filename}`,
        ],
      };
    }
  }

  /**
   * Process CSS with Stylus preprocessor
   */
  private async processStylus(text: string): Promise<PreprocessorResult> {
    try {
      const stylus = (await this.loadStylus()) as {
        default: {
          render: (
            text: string,
            callback: (
              err: { message: string; line?: number; column?: number } | null,
              css: string,
            ) => void,
          ) => void;
        };
      };

      return new Promise<PreprocessorResult>((resolve) => {
        stylus.default.render(
          text,
          (
            err: { message: string; line?: number; column?: number } | null,
            css: string,
          ) => {
            if (err) {
              const location =
                err.line && err.column
                  ? ` (Line ${err.line}, Column ${err.column})`
                  : "";

              resolve({
                css: "",
                warnings: [],
                errors: [
                  `Stylus compilation failed: ${err.message}${location}`,
                ],
              });
            } else {
              resolve({
                css: css || "",
                warnings: [],
                errors: [],
              });
            }
          },
        );
      });
    } catch (error: unknown) {
      const errorMessage = (error as Error).message;
      // Handle background context error
      if (
        errorMessage &&
        errorMessage.includes("cannot run in background context")
      ) {
        return {
          css: text,
          warnings: ["Stylus preprocessor not available in background context"],
          errors: [],
        };
      }
      return {
        css: "",
        warnings: [],
        errors: [`Failed to process with stylus: ${errorMessage}`],
      };
    }
  }

  /**
   * Process text with specified preprocessor engine
   */
  async process(
    text: string,
    engine: PreprocessorType,
  ): Promise<PreprocessorResult> {
    // Handle empty or whitespace-only input
    if (!text || text.trim() === "") {
      return {
        css: text,
        warnings: [],
        errors: [],
      };
    }

    // In background context, DOM is not available, so skip preprocessing for preprocessors that require DOM
    // Check if we're in a browser context with DOM access
    const hasDom = this.isDomAvailable();

    // If we're in a background context where DOM is not available,
    // and we need a preprocessor other than USO, return the original text with a warning
    if (!hasDom && engine !== "uso" && engine !== "none") {
      return {
        css: text,
        warnings: [`Preprocessor ${engine} requires DOM access, skipping preprocessing`],
        errors: [],
      };
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(engine, text);
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    let result: PreprocessorResult;

    try {
      switch (engine) {
        case "less":
          // Only process with Less if we have DOM access
          if (hasDom) {
            result = await this.processLess(text);
          } else {
            result = {
              css: text,
              warnings: ["Less preprocessor not available in background context"],
              errors: [],
            };
          }
          break;
        case "stylus":
          // Only process with Stylus if we have DOM access
          if (hasDom) {
            result = await this.processStylus(text);
          } else {
            result = {
              css: text,
              warnings: ["Stylus preprocessor not available in background context"],
              errors: [],
            };
          }
          break;
        case "uso":
          // USO mode: no preprocessing needed, variables are handled differently
          result = {
            css: text,
            warnings: [],
            errors: [],
          };
          break;
        case "none":
        default:
          result = {
            css: text,
            warnings: [],
            errors: [],
          };
          break;
      }
    } catch (error: unknown) {
      result = {
        css: text, // Fallback to original text
        warnings: [],
        errors: [
          `Failed to process with ${engine}: ${(error as Error).message}`,
        ],
      };
    }

    // Cache the result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Clear the preprocessor cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
