/// <reference types="vitest" />
import {
  RenderOptions,
  RenderResult,
  render as rtlRender,
} from "@testing-library/react";
import { ReactElement } from "react";

// Custom render function that ensures proper DOM container setup
function customRender(ui: ReactElement, options?: RenderOptions): RenderResult {
  // Create a container if none is provided
  const container =
    options?.container ||
    (() => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      return div;
    })();

  return rtlRender(ui, { ...options, container });
}

// Re-export everything from @testing-library/react
export * from "@testing-library/react";

// Override the default render with our custom one
export { customRender as render };
