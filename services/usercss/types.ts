/**
 * UserCSS Type Contracts
 *
 * These type definitions establish the core contracts for UserCSS processing
 * including metadata, variables, domain rules, and error handling.
 */

export interface StyleMeta {
  /** Unique identifier for the style */
  id: string;
  /** Human-readable name of the style */
  name: string;
  /** Namespace for the style (helps avoid conflicts) */
  namespace: string;
  /** Version of the style */
  version: string;
  /** Description of what the style does */
  description: string;
  /** Author of the style */
  author: string;
  /** URL where the style can be found or updated */
  sourceUrl: string;
  /** List of domains this style should apply to */
  domains: string[];
  /** Compiled CSS ready for injection */
  compiledCss: string;
  /** User-configurable variables with their current values */
  variables?: Record<string, VariableDescriptor>;
  /** Additional assets (fonts, images, etc.) */
  assets?: Asset[];
}

export interface VariableDescriptor {
  /** Name of the variable (e.g., '--accent-color') */
  name: string;
  /** Type of the variable for UI rendering */
  type: 'color' | 'number' | 'text' | 'select' | 'unknown';
  /** Default value as defined in the original UserCSS */
  default: string;
  /** Minimum value (for numeric variables) */
  min?: number;
  /** Maximum value (for numeric variables) */
  max?: number;
  /** Available options (for select variables) */
  options?: string[];
  /** Current value that may be modified by user */
  value: string;
}

export interface DomainRule {
  /** Type of domain matching rule */
  type: 'url' | 'url-prefix' | 'url-regexp' | 'domain' | 'regexp';
  /** Pattern to match against */
  pattern: string;
  /** Whether this rule should include or exclude the pattern */
  include: boolean;
}

export interface ParseResult {
  /** Parsed metadata from the UserCSS file */
  meta: StyleMeta;
  /** Original CSS content without metadata block */
  css: string;
  /** List of warnings encountered during parsing */
  warnings: string[];
  /** List of errors encountered during parsing */
  errors: string[];
}

export interface ExtensionErrorPayload {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional context data about the error */
  context?: Record<string, unknown>;
  /** Line number where the error occurred (if applicable) */
  line?: number;
  /** Column number where the error occurred (if applicable) */
  column?: number;
}

export interface Asset {
  /** Type of asset */
  type: 'font' | 'image' | 'other';
  /** URL or data URI for the asset */
  url: string;
  /** Optional format specification */
  format?: string;
  /** Optional weight for fonts */
  weight?: string;
  /** Optional style for fonts */
  style?: string;
  /** Optional display property for fonts */
  display?: string;
}

export interface UserCSSOptions {
  /** Whether to enable preprocessor support (Less, Stylus) */
  enablePreprocessors?: boolean;
  /** Whether to validate CSS syntax */
  validateSyntax?: boolean;
  /** Maximum file size for processing */
  maxFileSize?: number;
  /** Timeout for preprocessing operations */
  preprocessTimeout?: number;
}

export interface PreprocessorResult {
  /** Compiled CSS content */
  css: string;
  /** List of warnings from compilation */
  warnings: string[];
  /** List of errors from compilation */
  errors: string[];
}

export interface ParseOptions extends UserCSSOptions {
  /** Whether to extract domain rules */
  extractDomains?: boolean;
  /** Whether to extract variables */
  extractVariables?: boolean;
  /** Whether to extract assets */
  extractAssets?: boolean;
}

export interface ValidationError {
  /** Type of validation error */
  type: 'syntax' | 'metadata' | 'domain' | 'variable' | 'asset';
  /** Error message */
  message: string;
  /** Line number where error occurred */
  line?: number;
  /** Column number where error occurred */
  column?: number;
  /** Field that failed validation */
  field?: string;
  /** Suggested fix */
  fix?: string;
}
