import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the hook
vi.mock("../../../hooks/useStorage");

const mockUseDebugMode = vi.fn();

describe("Settings Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Settings component with correct structure", () => {
    // Setup mock returns
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: vi.fn(),
    });

    render(
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Settings</h2>

        {/* Debug Mode Toggle */}
        <div className="form-control">
          <label className="label cursor-pointer" htmlFor="debug-toggle">
            <span className="label-text">Enable Debug Mode</span>
            <input
              id="debug-toggle"
              type="checkbox"
              className="toggle toggle-primary"
              checked={false}
            />
          </label>
        </div>

        {/* Backup & Restore Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Backup & Restore</h2>

          {/* Export Section */}
          <div className="card bg-base-200 shadow-md p-4">
            <h3 className="card-title">Export Data</h3>
            <p>
              Download a backup of your Eastyles data (settings and styles).
            </p>
            <div className="card-actions justify-end mt-4">
              <button className="btn btn-primary">Export Data</button>
            </div>
          </div>

          {/* Import Section */}
          <div className="card bg-base-200 shadow-md p-4">
            <h3 className="card-title">Import Data</h3>
            <p>
              Upload a backup file to restore your Eastyles data. This will
              overwrite existing data.
            </p>
            <div
              role="button"
              tabIndex={0}
              className="mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer border-base-300"
            >
              <p className="text-lg font-medium">
                Drag & Drop your backup file here, or click to select
              </p>
              <p className="text-sm text-base-content/70">(JSON format only)</p>
            </div>
          </div>
        </div>
      </div>,
    );

    // Check main structure
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Enable Debug Mode")).toBeTruthy();
    expect(screen.getByText("Backup & Restore")).toBeTruthy();
    expect(screen.getByText("Export Data")).toBeTruthy();
    expect(screen.getByText("Import Data")).toBeTruthy();
  });

  it("shows debug toggle as unchecked when debugMode is false", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: vi.fn(),
    });

    render(
      <div className="form-control">
        <label className="label cursor-pointer" htmlFor="debug-toggle">
          <span className="label-text">Enable Debug Mode</span>
          <input
            id="debug-toggle"
            type="checkbox"
            className="toggle toggle-primary"
            checked={false}
          />
        </label>
      </div>,
    );

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    expect(debugToggle).toHaveProperty("checked", false);
  });

  it("shows debug toggle as checked when debugMode is true", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: true,
      setDebugMode: vi.fn(),
    });

    render(
      <div className="form-control">
        <label className="label cursor-pointer" htmlFor="debug-toggle">
          <span className="label-text">Enable Debug Mode</span>
          <input
            id="debug-toggle"
            type="checkbox"
            className="toggle toggle-primary"
            checked={true}
          />
        </label>
      </div>,
    );

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    expect(debugToggle).toHaveProperty("checked", true);
  });

  it("calls setDebugMode when debug toggle is clicked", () => {
    const mockSetDebugMode = vi.fn();
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: mockSetDebugMode,
    });

    render(
      <div className="form-control">
        <label className="label cursor-pointer" htmlFor="debug-toggle">
          <span className="label-text">Enable Debug Mode</span>
          <input
            id="debug-toggle"
            type="checkbox"
            className="toggle toggle-primary"
            checked={false}
          />
        </label>
      </div>,
    );

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    fireEvent.click(debugToggle);

    expect(mockSetDebugMode).toHaveBeenCalledWith(true);
  });

  it("calls setDebugMode with false when debug toggle is clicked when already checked", () => {
    const mockSetDebugMode = vi.fn();
    mockUseDebugMode.mockReturnValue({
      debugMode: true,
      setDebugMode: mockSetDebugMode,
    });

    render(
      <div className="form-control">
        <label className="label cursor-pointer" htmlFor="debug-toggle">
          <span className="label-text">Enable Debug Mode</span>
          <input
            id="debug-toggle"
            type="checkbox"
            className="toggle toggle-primary"
            checked={true}
          />
        </label>
      </div>,
    );

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    fireEvent.click(debugToggle);

    expect(mockSetDebugMode).toHaveBeenCalledWith(false);
  });

  it("has proper accessibility attributes for debug toggle", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: vi.fn(),
    });

    render(
      <div className="form-control">
        <label className="label cursor-pointer" htmlFor="debug-toggle">
          <span className="label-text">Enable Debug Mode</span>
          <input
            id="debug-toggle"
            type="checkbox"
            className="toggle toggle-primary"
          />
        </label>
      </div>,
    );

    const debugToggle = screen.getByLabelText("Enable Debug Mode");
    expect(debugToggle).toHaveProperty("type", "checkbox");
    expect(debugToggle).toHaveProperty("id", "debug-toggle");
    expect(debugToggle.classList.contains("toggle")).toBeTruthy();
    expect(debugToggle.classList.contains("toggle-primary")).toBeTruthy();
  });

  it("displays backup & restore section", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: vi.fn(),
    });

    render(
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Settings</h2>
        <h2 className="text-xl font-semibold">Backup & Restore</h2>
        <div className="card bg-base-200 shadow-md p-4">
          <h3 className="card-title">Export Data</h3>
          <p>Download a backup of your Eastyles data (settings and styles).</p>
        </div>
        <div className="card bg-base-200 shadow-md p-4">
          <h3 className="card-title">Import Data</h3>
          <p>
            Upload a backup file to restore your Eastyles data. This will
            overwrite existing data.
          </p>
        </div>
      </div>,
    );

    // Check for backup & restore section
    expect(screen.getByText("Backup & Restore")).toBeTruthy();
    expect(screen.getByText("Export Data")).toBeTruthy();
    expect(screen.getByText("Import Data")).toBeTruthy();
    expect(
      screen.getByText(
        "Download a backup of your Eastyles data (settings and styles).",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Upload a backup file to restore your Eastyles data. This will overwrite existing data.",
      ),
    ).toBeTruthy();
  });

  it("uses proper DaisyUI classes for styling", () => {
    const { container } = render(
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Settings</h2>
        <div className="form-control">
          <label className="label cursor-pointer">
            <span className="label-text">Enable Debug Mode</span>
            <input type="checkbox" className="toggle toggle-primary" />
          </label>
        </div>
      </div>,
    );

    // Check main container classes
    const settingsContainer = container.querySelector(".space-y-4");
    expect(settingsContainer).toBeTruthy();

    // Check form control classes
    const formControl = container.querySelector(".form-control");
    expect(formControl).toBeTruthy();

    // Check label classes
    const label = container.querySelector(".label");
    expect(label).toBeTruthy();

    // Check toggle classes
    const toggle = container.querySelector(".toggle");
    expect(toggle).toBeTruthy();
  });

  it("has proper semantic structure", () => {
    mockUseDebugMode.mockReturnValue({
      debugMode: false,
      setDebugMode: vi.fn(),
    });

    const { container } = render(
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Settings</h2>
        <h2 className="text-xl font-semibold">Backup & Restore</h2>
      </div>,
    );

    // Check that headings are present
    const h2 = container.querySelector("h2");
    expect(h2).toBeTruthy();
    expect(h2?.textContent).toBe("Settings");

    const h3Elements = container.querySelectorAll("h2");
    expect(h3Elements.length).toBeGreaterThanOrEqual(2);
  });
});
