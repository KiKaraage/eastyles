/**
 * UserCSS Preprocessor Detection and Processing
 *
 * Handles detection of Less and Stylus preprocessors and provides compilation
 * capabilities with caching support.
 */

/**
 * Supported preprocessor types
 */
export type PreprocessorType = "none" | "less" | "stylus";

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
  const trimmed = text.trim();

  // First, check for explicit @preprocessor directive
  const preprocessorMatch = trimmed.match(
    /^\/\*\s*@preprocessor\s+([a-zA-Z]+)\s*\*\/\s*/,
  );
  if (preprocessorMatch) {
    const preprocessor = preprocessorMatch[1].toLowerCase();

    switch (preprocessor) {
      case "less":
        return { type: "less", source: "metadata", confidence: 1.0 };
      case "stylus":
        return { type: "stylus", source: "metadata", confidence: 1.0 };
      default:
        return { type: "none", source: "metadata", confidence: 0.5 };
    }
  }

  // Heuristic detection based on syntax patterns
  let lessScore = 0;
  let stylusScore = 0;

  // Less patterns
  if (trimmed.includes("@import")) lessScore += 1;
  if (trimmed.includes("@extend")) lessScore += 1;
  if (trimmed.includes("@mixin")) lessScore += 1;
  if (trimmed.includes(".(")) lessScore += 1; // Less mixins
  if (trimmed.includes("when ")) lessScore += 1; // Less guards
  if (trimmed.includes(")")) lessScore += 1; // Less mixin calls like .btn()

  // Stylus patterns
  if (trimmed.includes("&")) stylusScore += 1; // Parent selector
  if (trimmed.includes("//")) stylusScore += 1; // Single line comments
  if (trimmed.includes("->")) stylusScore += 1; // Property access
  if (trimmed.includes("colors.")) stylusScore += 1; // Dot notation like colors.red
  if (trimmed.includes("unless ")) stylusScore += 1; // Stylus unless
  if (trimmed.includes("if ")) stylusScore += 1; // Stylus if

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
    case "none":
      return "None";
    default:
      return "Unknown";
  }
}
