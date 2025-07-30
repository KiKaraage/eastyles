/// <reference types="vitest" />
import {
  render as rtlRender,
  RenderOptions,
  RenderResult,
} from "@testing-library/react";
import React, { ReactElement } from "react";
import { withErrorBoundary } from "../components/ui/ErrorBoundary";

// Custom render function that wraps components with the ErrorBoundary
function customRender(ui: ReactElement, options?: RenderOptions): RenderResult {
  const WrappedComponent = withErrorBoundary(() => ui);
  return rtlRender(<WrappedComponent />, options);
}

// Re-export everything from @testing-library/react
export * from "@testing-library/react";

// Override the default render with our custom one
export { customRender as render };
