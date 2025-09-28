/**
 * VariableControls Component
 *
 * Provides typed UI controls for UserCSS variable configuration.
 * Supports color picker, number input with min/max, text input, and select dropdown.
 */

import React from "react";
import { VariableDescriptor } from "../../services/usercss/types";

interface VariableControlsProps {
  /** Array of variable descriptors to render controls for */
  variables?: VariableDescriptor[];
  /** Callback when a variable value changes */
  onChange: (name: string, value: string) => void;
  /** Optional CSS class for the container */
  className?: string;
}

/**
 * Individual control component for a single variable
 */
interface VariableControlProps {
  variable: VariableDescriptor;
  onChange: (value: string) => void;
}

// Helper function to check if a string is a valid color value (including alpha)
const isValidColor = (color: string): boolean => {
  // Must be a valid hex color: #rgb, #rrggbb, or #rrggbbaa
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color);
};

const VariableControl: React.FC<VariableControlProps> = ({
  variable,
  onChange,
}) => {
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    let value = e.target.value;

    // For color inputs, validate the value
    if (variable.type === "color" && e.target.type === "color") {
      // Color input should always produce valid values, but let's ensure
      if (!isValidColor(value)) {
        console.warn(`Invalid color value from color input: ${value}`);
        value = "#000000"; // Fallback
      }
    }

    onChange(value);
  };

  // Use label if available, otherwise fall back to name
  const displayLabel = variable.label || variable.name.replace(/^--/, "");

  // Get a valid color value for the color input, fallback to default
  const getValidColorValue = (value: string): string => {
    if (isValidColor(value)) {
      // For 8-digit colors, strip alpha for input[type="color"]
      if (value.length === 9) { // #rrggbbaa
        return value.substring(0, 7);
      }
      return value;
    }
    // Try to extract valid color from malformed strings
    if (value.startsWith('#') && value.length >= 7) {
      const hexPart = value.substring(0, 7);
      if (isValidColor(hexPart)) {
        return hexPart;
      }
    }
    // Fallback to default
    return variable.default && isValidColor(variable.default) ? variable.default : "#000000";
  };

  switch (variable.type) {
    case "color":
      return (
        <div className="form-control">
          <label className="label">
            <span className="label-text">
              {displayLabel}
            </span>
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              value={getValidColorValue(variable.value)}
              onChange={handleChange}
              className="w-12 h-8 border border-base-300 rounded cursor-pointer"
              title={`Color picker for ${variable.name}`}
            />
            <input
              type="text"
              value={variable.value}
              onChange={handleChange}
              className="input input-bordered input-xs flex-1"
              placeholder="#000000"
              title={`Color value for ${variable.name}`}
            />
          </div>
        </div>
      );

    case "number":
      return (
        <div className="form-control">
          <label className="label">
            <span className="label-text">
              {displayLabel}
            </span>
          </label>
          <input
            type="number"
            value={variable.value}
            onChange={handleChange}
            min={variable.min}
            max={variable.max}
            className="input input-bordered input-sm"
            placeholder={variable.default}
            title={`Number input for ${variable.name}${variable.min !== undefined ? ` (min: ${variable.min})` : ""}${variable.max !== undefined ? ` (max: ${variable.max})` : ""}`}
          />
        </div>
      );

    case "select":
      return (
        <div className="form-control">
          <label className="label">
            <span className="label-text">
              {displayLabel}
            </span>
          </label>
          <select
            value={variable.value}
            onChange={handleChange}
            className="select select-bordered select-sm"
            title={`Select option for ${variable.name}`}
          >
            {variable.options?.map((option) => {
              const value = typeof option === 'string' ? option : option.value;
              const label = typeof option === 'string' ? option : option.label;
              return (
                <option key={value} value={value}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      );

    case "checkbox":
      return (
        <div className="form-control">
          <label className="label cursor-pointer justify-start">
            <span className="label-text">
              {displayLabel}
            </span>
            <input
              type="checkbox"
              checked={variable.value === "1" || variable.value === "true"}
              onChange={(e) => onChange(e.target.checked ? "1" : "0")}
              className="checkbox checkbox-primary ml-2"
              title={`Checkbox for ${variable.name}`}
            />
          </label>
        </div>
      );

    case "text":
    default:
      return (
        <div className="form-control">
          <label className="label">
            <span className="label-text">
              {displayLabel}
            </span>
          </label>
          <input
            type="text"
            value={variable.value}
            onChange={handleChange}
            className="input input-bordered input-sm"
            placeholder={variable.default}
            title={`Text input for ${variable.name}`}
          />
        </div>
      );
  }
};

/**
 * Main component that renders controls for all variables
 */
export const VariableControls: React.FC<VariableControlsProps> = ({
  variables = [],
  onChange,
  className = "",
}) => {
  if (!variables || variables.length === 0) {
    return (
      <div className={`text-center text-gray-500 ${className}`}>
        No configurable variables available
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-lg font-semibold">Variable Configuration</h3>
      <div className="grid gap-4 md:grid-cols-2">
        {variables.map((variable) => (
          <VariableControl
            key={variable.name}
            variable={variable}
            onChange={(value) => onChange(variable.name, value)}
          />
        ))}
      </div>
    </div>
  );
};

export default VariableControls;
