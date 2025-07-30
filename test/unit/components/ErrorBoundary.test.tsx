/// <reference types="vitest" />
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "../../test-utils";
import { errorService } from "../../../services/errors/service";
import { withErrorBoundary } from "../../../components/ui/ErrorBoundary";
import "@testing-library/jest-dom";

// Mock the errorService to prevent actual error handling during tests
vi.mock("../../../services/errors/service", () => ({
  errorService: {
    handleError: vi.fn(),
    getTotalErrorCount: vi.fn(),
  },
}));

const TestComponentThrowsError = () => {
  throw new Error("Test error");
};

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("captures errors and shows fallback UI", () => {
    const WrappedComponent = withErrorBoundary(TestComponentThrowsError);
    render(<WrappedComponent />);

    expect(screen.getByText(/Oops! Something went wrong./i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reload Page/i })).toBeTruthy();
  });

  test("calls errorService.handleError when an error occurs", () => {
    const WrappedComponent = withErrorBoundary(TestComponentThrowsError);
    render(<WrappedComponent />);

    expect(errorService.handleError).toHaveBeenCalledTimes(1);
    expect(errorService.handleError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: "POPUP" }),
    );
  });

  test("renders children normally when no error occurs", () => {
    const TestComponent = () => <div>No Error Here</div>;
    const WrappedComponent = withErrorBoundary(TestComponent);
    render(<WrappedComponent />);

    expect(screen.getByText("No Error Here")).toBeTruthy();
    expect(screen.queryByText(/Oops! Something went wrong./i)).toBeNull();
  });

  // Test reload functionality (mock window.location.reload)
  test("reloads the page when reload button is clicked", () => {
    const originalReload = window.location.reload;
    window.location.reload = vi.fn();

    const WrappedComponent = withErrorBoundary(TestComponentThrowsError);
    render(<WrappedComponent />);
    const reloadButton = screen.getByRole("button", { name: /Reload Page/i });
    reloadButton.click();

    expect(window.location.reload).toHaveBeenCalledTimes(1);
    window.location.reload = originalReload; // Restore original reload
  });
});
