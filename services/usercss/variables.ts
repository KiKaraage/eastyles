/**
 * UserCSS Variable Extraction
 *
 * Extracts variable descriptors from CSS content and resolves variables in CSS.
 */

import { VariableDescriptor } from "@services/usercss/types";

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

  let match;
  while ((match = variableRegex.exec(css)) !== null) {
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
              .map((opt) => opt.trim());
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
              .map((opt) => opt.trim());
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
 * Resolves variables in CSS content
 *
 * @param css - The CSS content with variable placeholders
 * @param values - The variable values to substitute
 * @param variables - Variable descriptors for advanced resolution
 * @returns CSS content with variables resolved
 */
export function resolveVariables(
  css: string,
  values: Record<string, string>,
  variables?: Record<string, VariableDescriptor>,
): string {
  // First, handle USO-style variable resolution with CSS snippets
  if (variables) {
    for (const [varName, varDesc] of Object.entries(variables)) {
      if (varDesc.type === 'select' && varDesc.optionCss && values[varName]) {
        const selectedValue = values[varName];
        const cssSnippet = varDesc.optionCss[selectedValue];
        if (cssSnippet) {
          // Replace the variable placeholder with the CSS snippet
          css = css.replace(new RegExp(`var\\(${varName}\\)`, 'g'), cssSnippet);
        }
      }
    }
  }

  // Replace variable placeholders with actual values
  return css.replace(/\/\*\[\[([^\]]+)\]\]\*\//g, (match, variableString) => {
    const parts = variableString.split("|");
    const variableName = parts[0];

    // Check if this is a select variable with optionCss mapping
    if (variables && variables[variableName] && variables[variableName].type === 'select' && variables[variableName].optionCss) {
      const selectedValue = values[variableName];
      if (selectedValue && variables[variableName].optionCss[selectedValue]) {
        // Use the CSS content from optionCss mapping
        return variables[variableName].optionCss[selectedValue];
      }
    }

    // Return the value if it exists, otherwise return the original placeholder
    if (values[variableName]) {
      return values[variableName];
    }

    // If no value is provided, return the default if specified
    if (parts.length > 2) {
      return parts[2];
    }

    // Otherwise return the placeholder as-is
    return match;
  });
}
