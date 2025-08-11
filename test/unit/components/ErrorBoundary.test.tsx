import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary, {
  withErrorBoundary,
  ErrorFallbackProps,
} from "../../../components/ui/ErrorBoundary";
import { errorService } from "../../../services/errors/service";

// Mock the errorService to prevent logging during tests
vi.mock("../../../services/errors/service", () => ({
  errorService: {
    handleError: vi.fn(),
  },
  ErrorSource: {
    POPUP: "POPUP",
  },
  ErrorSeverity: {
    FATAL: "FATAL",
    NON_FATAL: "NON_FATAL",
  },
  ExtensionError: class extends Error {
    severity: string;
    constructor(message: string, { severity = "NON_FATAL" } = {}) {
      super(message);
      this.name = "ExtensionError";
      this.severity = severity;
    }
  },
}));

// A component that throws an error
const ProblematicComponent = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>Success</div>;
};

describe("ErrorBoundary Component", () => {
  // Suppress console.error output from React
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Success")).toBeTruthy();
  });

  it("catches an error and renders the default fallback UI", () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    // Check for fallback UI text
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText(/A technical error occurred/)).toBeTruthy();
  });

  it("calls errorService.handleError when an error is caught", () => {
    const testError = new Error("Test error");
    const ProblematicComponent = () => {
      throw testError;
    };

    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    expect(errorService.handleError).toHaveBeenCalledWith(
      testError,
      expect.any(Object),
    );
  });

  it("allows retrying and resets the error state", () => {
    let shouldThrow = true;
    const ProblematicComponent = () => {
      if (shouldThrow) {
        throw new Error("Transient error");
      }
      return <div>Success after retry</div>;
    };

    const { rerender } = render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    // Ensure fallback is shown
    expect(screen.getByText("Something went wrong")).toBeTruthy();

    // Simulate user clicking "Try Again"
    const retryButton = screen.getByText("Try Again");
    shouldThrow = false; // The next render should succeed
    fireEvent.click(retryButton);

    // Rerender the component to simulate the retry
    rerender(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    // The component should now render the children
    expect(screen.getByText("Success after retry")).toBeTruthy();
  });

  it("should render a custom fallback UI when provided", () => {
    const CustomFallback = ({ error, resetError }: ErrorFallbackProps) => (
      <div>
        <h1>Custom Fallback</h1>
        <p>{error.message}</p>
        <button onClick={resetError}>Try Again Custom</button>
      </div>
    );

    render(
      <ErrorBoundary fallback={CustomFallback}>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom Fallback")).toBeTruthy();
    expect(screen.getByText("Test error")).toBeTruthy();
    expect(screen.getByText("Try Again Custom")).toBeTruthy();
  });

  it("should pass error and resetError to custom fallback UI", () => {
    const CustomFallback = vi.fn(() => null);

    render(
      <ErrorBoundary fallback={CustomFallback}>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    expect(CustomFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
        errorInfo: expect.any(Object),
        retry: expect.any(Function),
        canRetry: expect.any(Boolean),
        resetError: expect.any(Function),
      }),
      undefined,
    );
  });

  it("should not render anything when fallback is null", () => {
    const { container } = render(
      <ErrorBoundary fallback={null}>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    expect(container.firstChild).toBeNull();
  });
});

describe("withErrorBoundary HOC", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("wraps a component and catches rendering errors", () => {
    const WrappedProblematicComponent = withErrorBoundary(ProblematicComponent);
    render(<WrappedProblematicComponent />);

    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("renders the wrapped component when no error occurs", () => {
    const WrappedComponent = withErrorBoundary(ProblematicComponent);
    render(<WrappedComponent shouldThrow={false} />);

    expect(screen.getByText("Success")).toBeTruthy();
  });
});
