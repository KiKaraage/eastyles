/**
 * UserCSS Validators using Zod
 *
 * These schemas provide runtime validation for UserCSS data structures,
 * ensuring type safety and providing informative error messages.
 */

import { z } from "zod";

// Variable type validator
const VariableTypeSchema = z.enum([
  "color",
  "number",
  "text",
  "select",
  "unknown",
]);

// Asset schema
const AssetSchema = z.object({
  type: z.enum(["font", "image", "other"]),
  url: z.string().url("Asset URL must be a valid URL"),
  format: z.string().optional(),
  weight: z.string().optional(),
  style: z.string().optional(),
  display: z.string().optional(),
});

// Domain rule schema
const DomainRuleSchema = z.object({
  type: z.enum(["url", "url-prefix", "url-regexp", "domain", "regexp"]),
  pattern: z.string().min(1, "Domain pattern cannot be empty"),
  include: z.boolean(),
});

// Variable descriptor schema
const VariableDescriptorSchema = z.object({
  name: z
    .string()
    .min(1, "Variable name cannot be empty")
    .startsWith("--", "Variable names must start with --"),
  type: VariableTypeSchema,
  default: z.string().min(1, "Default value cannot be empty"),
  min: z.number().positive("Min value must be positive").optional(),
  max: z.number().positive("Max value must be positive").optional(),
  options: z.array(z.string()).optional(),
  value: z.string(),
});

// Style metadata schema (based on JSON Schema from design)
export const StyleMetaSchema = z.object({
  id: z.uuid({ message: "Style ID must be a valid UUID" }),
  name: z.string().min(1, "Style name cannot be empty"),
  namespace: z.string().min(1, "Namespace cannot be empty"),
  version: z.string().min(1, "Version cannot be empty"),
  description: z.string(),
  author: z.string(),
  sourceUrl: z.url({ message: "Source URL must be a valid URL" }).optional(),
  domains: z.array(z.string()).min(1, "At least one domain must be specified"),
  compiledCss: z.string().min(1, "Compiled CSS cannot be empty"),
  variables: z.record(z.string(), VariableDescriptorSchema).optional(),
  assets: z.array(AssetSchema).optional(),
});

// Parse result schema
export const ParseResultSchema = z.object({
  meta: StyleMetaSchema,
  css: z.string().min(1, "CSS content cannot be empty"),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

// Extension error payload schema - temporarily commented out due to Zod v4 compatibility issues
const ExtensionErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  line: z.number().optional(),
  column: z.number().optional(),
});

// TODO: Fix ExtensionErrorPayloadSchema for Zod v4 compatibility
export { ExtensionErrorPayloadSchema };

// Simple test schema to debug ExtensionErrorPayloadSchema issues
const SimpleTestSchema = z.object({
  code: z.string(),
  message: z.string(),
});

// Export simple test schema
export { SimpleTestSchema };

// UserCSS options schema
export const UserCSSOptionsSchema = z.object({
  enablePreprocessors: z.boolean().default(true),
  validateSyntax: z.boolean().default(true),
  maxFileSize: z
    .number()
    .positive("Max file size must be positive")
    .default(1024 * 1024), // 1MB
  preprocessTimeout: z
    .number()
    .positive("Timeout must be positive")
    .default(10000), // 10 seconds
});

// Preprocessor result schema
export const PreprocessorResultSchema = z.object({
  css: z.string().min(1, "Compiled CSS cannot be empty"),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

// Parse options schema
export const ParseOptionsSchema = UserCSSOptionsSchema.extend({
  extractDomains: z.boolean().default(true),
  extractVariables: z.boolean().default(true),
  extractAssets: z.boolean().default(true),
});

// Validation error schema
export const ValidationErrorSchema = z.object({
  type: z.enum(["syntax", "metadata", "domain", "variable", "asset"]),
  message: z.string().min(1, "Validation error message cannot be empty"),
  line: z.number().positive("Line number must be positive").optional(),
  column: z.number().positive("Column number must be positive").optional(),
  field: z.string().optional(),
  fix: z.string().optional(),
});

// Type exports for use in other modules
export type VariableType = z.infer<typeof VariableTypeSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type DomainRule = z.infer<typeof DomainRuleSchema>;
export type VariableDescriptor = z.infer<typeof VariableDescriptorSchema>;
export type StyleMeta = z.infer<typeof StyleMetaSchema>;
export type ParseResult = z.infer<typeof ParseResultSchema>;
export type ExtensionErrorPayload = z.infer<typeof ExtensionErrorPayloadSchema>; // Temporarily disabled
export type UserCSSOptions = z.infer<typeof UserCSSOptionsSchema>;
export type PreprocessorResult = z.infer<typeof PreprocessorResultSchema>;
export type ParseOptions = z.infer<typeof ParseOptionsSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;

// Export missing schemas
export { VariableDescriptorSchema, DomainRuleSchema, AssetSchema };

// Utility functions for validation

/**
 * Validates a StyleMeta object and returns detailed error information
 */
export function validateStyleMeta(
  data: unknown,
): { success: true; data: StyleMeta } | { success: false; error: z.ZodError } {
  return StyleMetaSchema.safeParse(data);
}

/**
 * Validates a ParseResult object and returns detailed error information
 */
export function validateParseResult(
  data: unknown,
):
  | { success: true; data: ParseResult }
  | { success: false; error: z.ZodError } {
  return ParseResultSchema.safeParse(data);
}

/**
 * Validates a VariableDescriptor object and returns detailed error information
 */
export function validateVariableDescriptor(
  data: unknown,
):
  | { success: true; data: VariableDescriptor }
  | { success: false; error: z.ZodError } {
  return VariableDescriptorSchema.safeParse(data);
}

/**
 * Validates an ExtensionErrorPayload object and returns detailed error information
 */
// ExtensionErrorPayloadSchema validation temporarily disabled due to Zod v4 compatibility issues
export function validateExtensionErrorPayload(
  data: unknown,
):
  | { success: true; data: ExtensionErrorPayload }
  | { success: false; error: z.ZodError } {
  return ExtensionErrorPayloadSchema.safeParse(data);
}

/**
 * Formats a Zod error into a human-readable message
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue: { code: string; message: string; path?: unknown[] }) => {
      let message = `${issue.code}: ${issue.message}`;
      if (issue.path && Array.isArray(issue.path) && issue.path.length > 0) {
        message += ` (path: ${issue.path.join(".")})`;
      }
      return message;
    })
    .join("; ");
}

/**
 * Validates and sanitizes domain rules
 */
export function validateDomainRules(
  rules: unknown[],
): { success: true; rules: DomainRule[] } | { success: false; error: string } {
  const result = z.array(DomainRuleSchema).safeParse(rules);
  if (!result.success) {
    return { success: false, error: formatZodError(result.error) };
  }
  return { success: true, rules: result.data };
}

/**
 * Validates variable descriptors
 */
export function validateVariables(
  variables: Record<string, unknown>,
):
  | { success: true; variables: Record<string, VariableDescriptor> }
  | { success: false; error: string } {
  const result = z
    .record(z.string(), VariableDescriptorSchema)
    .safeParse(variables);
  if (!result.success) {
    return { success: false, error: formatZodError(result.error) };
  }
  return { success: true, variables: result.data };
}
