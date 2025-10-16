import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the useDebugMode hook directly
const mockUseDebugMode = vi.fn();
vi.mock("../../hooks/useStorage", () => ({
  useDebugMode: () => mockUseDebugMode(),
}));

// Import the component under test
import Settings from "../../components/features/Settings";

describe("Settings Component", () => {
  let mockSetDebugMode: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDebugMode = vi.fn();
  });

  it("renders Settings component", () => {
    // Setup mock returns
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: mockSetDebugMode,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      reset: vi.fn(),
      isDirty: false,
    });

    // Render the Settings component
    render(<Settings />);

    // Check main structure
    const settingsHeading = screen.getByRole("heading", { name: "Settings" });
    expect(settingsHeading).toBeTruthy();

    const enableDebugLabel = screen.getByText("Enable Debug Mode");
    expect(enableDebugLabel).toBeTruthy();
  });

  it("shows debug toggle as unchecked when debugMode is false", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: mockSetDebugMode,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      reset: vi.fn(),
      isDirty: false,
    });

    render(<Settings />);

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    expect(debugToggle).toBeTruthy();
    expect((debugToggle as HTMLInputElement).checked).toBe(false);
  });

  it("shows debug toggle as checked when debugMode is true", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: true,
      setDebugMode: mockSetDebugMode,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      reset: vi.fn(),
      isDirty: false,
    });

    render(<Settings />);

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    expect(debugToggle).toBeTruthy();
    expect((debugToggle as HTMLInputElement).checked).toBe(true);
  });

  it("calls setDebugMode when debug toggle is clicked", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: mockSetDebugMode,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      reset: vi.fn(),
      isDirty: false,
    });

    render(<Settings />);

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    fireEvent.click(debugToggle);

    expect(mockSetDebugMode).toHaveBeenCalledWith(true);
  });

  it("calls setDebugMode with false when debug toggle is clicked when already checked", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: true,
      setDebugMode: mockSetDebugMode,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      reset: vi.fn(),
      isDirty: false,
    });

    render(<Settings />);

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    fireEvent.click(debugToggle);

    expect(mockSetDebugMode).toHaveBeenCalledWith(false);
  });

  it("has proper accessibility attributes for debug toggle", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: mockSetDebugMode,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      reset: vi.fn(),
      isDirty: false,
    });

    render(<Settings />);

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    expect(debugToggle).toBeTruthy();
    expect(debugToggle.getAttribute("type")).toBe("checkbox");
    expect(debugToggle.getAttribute("id")).toBe("debug-toggle");
    expect(debugToggle.classList.contains("toggle")).toBe(true);
    expect(debugToggle.classList.contains("toggle-primary")).toBe(true);
  });
});
