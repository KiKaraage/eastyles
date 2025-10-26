/**
 * UserCSS Variable Extraction
 *
 * Extracts variable descriptors from CSS content and resolves variables in CSS.
 */

import { VariableDescriptor } from "./types";

/**
 * Extracts variable descriptors from CSS content
 *
 * @param css - The CSS content to extract variables from
 * @returns Array of VariableDescriptor objects
 */
export function extractVariables(css: string): VariableDescriptor[] {
  const variables: VariableDescriptor[] = [];

  // Regex to match variable declarations with inline annotations
  // This matches patterns like:
  // /*[[variable-name]]*/
  // /*[[variable-name|type]]*/
  // /*[[variable-name|type|default]]*/
  // /*[[variable-name|type|default|description]]*/
  // /*[[variable-name|type|default|min|max]]*/
  // /*[[variable-name|type|default|options:opt1,opt2,opt3]]*/
  const variableRegex = /\/\*\[\[([^\]]+)\]\]\*\//g;

  // Use matchAll to avoid regex state issues
  const matches = Array.from(css.matchAll(variableRegex));

  for (const match of matches) {
    const variableString = match[1];

    try {
      const variable = parseVariableString(variableString);
      if (variable) {
        variables.push(variable);
      }
    } catch {
      // Skip malformed variable declarations
      continue;
    }
  }

  return variables;
}

/**
 * Parses a variable string into a VariableDescriptor
 *
 * @param variableString - The variable string to parse
 * @returns VariableDescriptor or null if parsing fails
 */
function parseVariableString(
  variableString: string,
): VariableDescriptor | null {
  // Split by | to get parts
  const parts = variableString.split("|");
  const name = parts[0];

  // Validate variable name (must start with --)
  if (!name.startsWith("--")) {
    throw new Error(`Invalid variable name: ${name}`);
  }

  // Create base variable descriptor
  const variable: VariableDescriptor = {
    name,
    type: "text", // default type
    default: "", // default value
    value: "", // current value
  };

  // Parse additional parts if they exist
  if (parts.length > 1) {
    variable.type = parseVariableType(parts[1]);
  }

  if (parts.length > 2) {
    variable.default = parts[2];
    variable.value = parts[2]; // Initialize value with default
  }

  // Parse type-specific options
  if (parts.length > 3) {
    switch (variable.type) {
      case "number":
        if (parts.length > 3) {
          const min = parseFloat(parts[3]);
          if (!isNaN(min)) {
            variable.min = min;
          }
        }
        if (parts.length > 4) {
          const max = parseFloat(parts[4]);
          if (!isNaN(max)) {
            variable.max = max;
          }
        }
        break;

      case "select":
        if (parts.length > 3) {
          // Check if it's an options specification
          if (parts[3].startsWith("options:")) {
            const optionsString = parts[3].substring(8); // Remove 'options:' prefix
            variable.options = optionsString
              .split(",")
              .map((opt) => ({ value: opt.trim(), label: opt.trim() }));
          } else {
            // It's a description or default, not options
            variable.default = parts[3];
            variable.value = parts[3];
          }
        }
        // Handle additional options if specified
        for (let i = 4; i < parts.length; i++) {
          if (parts[i].startsWith("options:")) {
            const optionsString = parts[i].substring(8); // Remove 'options:' prefix
            variable.options = optionsString
              .split(",")
              .map((opt) => ({ value: opt.trim(), label: opt.trim() }));
            break;
          }
        }
        break;

      default:
        // For other types, additional parts might be description or constraints
        // We'll treat the third part as default and ignore additional parts for now
        break;
    }
  }

  return variable;
}

/**
 * Parses a variable type string into a valid VariableType
 *
 * @param typeString - The type string to parse
 * @returns Valid VariableType
 */
function parseVariableType(typeString: string): VariableDescriptor["type"] {
  switch (typeString.toLowerCase()) {
    case "color":
      return "color";
    case "number":
      return "number";
    case "text":
      return "text";
    case "select":
      return "select";
    default:
      return "unknown";
  }
}

/**
 * Resolves variables in CSS content with chunked processing to prevent blocking
 *
 * @param css - The CSS content with variable placeholders
 * @param values - The variable values to substitute
 * @param variables - Variable descriptors for advanced resolution
 * @returns Promise that resolves to CSS content with variables resolved
 */
export async function resolveVariables(
  css: string,
  values: Record<string, string>,
  variables?: Record<string, VariableDescriptor>,
): Promise<string> {
  // Find all variable placeholders using matchAll to avoid regex state issues
  const variableRegex = /\/\*\[\[([^\]]+)\]\]\*\//g;
  const matches = Array.from(css.matchAll(variableRegex)).map((match) => ({
    match: match[0],
    variableString: match[1],
    index: match.index,
  }));

  if (matches.length === 0) {
    return css;
  }

  // Process in chunks to avoid blocking the main thread
  const chunkSize = 50; // Process 50 variables at a time
  let processedCss = css;

  for (let i = 0; i < matches.length; i += chunkSize) {
    const chunk = matches.slice(i, i + chunkSize);

    // Process this chunk synchronously
    for (const { match: originalMatch, variableString } of chunk) {
      const parts = variableString.split("|");
      const variableName = parts[0];

      let replacement = originalMatch; // Default to original if no replacement found

      // Check if this is a select/dropdown variable with optionCss mapping (USO-style)
      if (variables && variables[variableName]) {
        const varDesc = variables[variableName];

        // For select/dropdown variables with CSS snippets
        if (varDesc.type === "select" && varDesc.optionCss) {
          const selectedValue = values[variableName];
          if (selectedValue && varDesc.optionCss[selectedValue]) {
            // Use the CSS content from optionCss mapping
            replacement = varDesc.optionCss[selectedValue];
          }
        }
      }

      // If not a select with optionCss, use simple value replacement
      if (replacement === originalMatch) {
        if (values[variableName] !== undefined) {
          replacement = values[variableName];
        } else if (parts.length > 2) {
          replacement = parts[2]; // Use default
        }
      }

      // Replace in the CSS using string replacement
      processedCss = processedCss.replace(originalMatch, replacement);
    }

    // Yield control back to the event loop after each chunk
    if (i + chunkSize < matches.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return processedCss;
}
