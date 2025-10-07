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
  /** Show the built-in title */
  showTitle?: boolean;
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

  // Use label if available, otherwise fall back to a humanized name
  const humanize = (s: string) => s.replace(/^--/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const displayLabel = (variable as any).label || humanize(variable.name);

  // Get a valid color value for the color input, fallback to default
  const getValidColorValue = (value: string): string => {
    if (isValidColor(value)) {
      // Expand 3-digit hex to 6-digit
      if (value.length === 4) { // #rgb
        return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
      }
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
          <label className="label cursor-pointer items-start justify-between w-full">
            <span className="label-text flex-1 pr-4 break-words">
              {displayLabel}
            </span>
            <input
              type="color"
              value={getValidColorValue(variable.value)}
              onChange={handleChange}
              className="w-10 h-10 border-2 border-base-300 rounded-lg cursor-pointer flex-shrink-0 overflow-hidden"
              style={{
                padding: '0.25rem',
                borderRadius: '0.5rem',
                appearance: 'none',
              }}
              title={`${displayLabel}: ${variable.value}`}
            />
          </label>
        </div>
      );

    case "number":
      return (
        <fieldset className="fieldset">
          <legend className="fieldset-legend">{displayLabel}</legend>
          <input
            type="number"
            value={variable.value}
            onChange={handleChange}
            min={variable.min}
            max={variable.max}
            className="input input-bordered input-sm w-full"
            placeholder={variable.default}
            title={`${displayLabel}${variable.min !== undefined ? ` (min: ${variable.min})` : ""}${variable.max !== undefined ? ` (max: ${variable.max})` : ""}`}
          />
        </fieldset>
      );

    case "select": {
      const options = variable.options || [];
      const optionsAreLong = options.length > 5 || options.some((o) => (typeof o === 'string' ? o : o.label)?.length > 14);
      if (optionsAreLong) {
        return (
          <fieldset className="fieldset">
            <legend className="fieldset-legend">{displayLabel}</legend>
            <select
              value={variable.value}
              onChange={handleChange}
              className="select select-bordered select-sm w-full"
              title={`${displayLabel}`}
            >
              {options.map((option) => {
                const value = typeof option === 'string' ? option : option.value;
                const label = typeof option === 'string' ? option : option.label;
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
          </fieldset>
        );
      }
      return (
        <div className="form-control">
          <label className="label cursor-pointer items-center justify-between w-full">
            <span className="label-text flex-1 pr-4 break-words">
              {displayLabel}
            </span>
            <select
              value={variable.value}
              onChange={handleChange}
              className="select select-bordered select-sm w-32 flex-shrink-0"
              title={`${displayLabel}`}
            >
              {options.map((option) => {
                const value = typeof option === 'string' ? option : option.value;
                const label = typeof option === 'string' ? option : option.label;
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      );
    }

    case "checkbox":
      return (
        <div className="form-control">
          <label className="label cursor-pointer items-center justify-between w-full">
            <span className="label-text flex-1 pr-4 break-words">
              {displayLabel}
            </span>
            <input
              type="checkbox"
              checked={variable.value === "1" || variable.value === "true"}
              onChange={(e) => onChange(e.target.checked ? "1" : "0")}
              className="toggle toggle-primary flex-shrink-0"
              title={`${displayLabel}`}
            />
          </label>
        </div>
      );

    case "text":
    default:
      return (
        <fieldset className="fieldset">
          <legend className="fieldset-legend">{displayLabel}</legend>
          <input
            type="text"
            value={variable.value}
            onChange={handleChange}
            className="input input-bordered input-sm w-full"
            placeholder={variable.default}
            title={`${displayLabel}`}
          />
        </fieldset>
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
  showTitle = true,
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
      {showTitle && <h3 className="text-lg font-semibold">Variable Configuration</h3>}
      <div className="grid grid-cols-1 gap-3">
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
