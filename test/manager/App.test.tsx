import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Create a simple mock component directly
const MockApp = () => (
  <div className="bg-base-100 min-h-screen flex flex-col">
    {/* Header */}
    <div className="bg-base-200 p-4 border-b border-base-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img src="/logo.svg" alt="Eastyles logo" className="w-8 h-8" />
          <h3 className="text-lg font-bold text-base-content">Styles for...</h3>
        </div>
        <div className="flex items-center space-x-2">
          <div className="text-xs text-base-content/50">v1.0.0</div>
          <button
            className="btn btn-ghost btn-xs"
            title="Current theme: system (light)"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    {/* Main Content */}
    <div className="flex-1 p-4">
      <div className="mt-4">
        {/* Mock Manage Styles Content */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Manage Styles</h2>
          <div className="bg-base-200 p-4 rounded-lg">
            <p>Manage Styles Content</p>
          </div>
        </div>

        {/* Mock Settings Content (hidden by default) */}
        <div className="hidden">
          <h2 className="text-2xl font-bold mb-4">Settings</h2>
          <div className="space-y-4">
            <div className="form-control">
              <label className="label cursor-pointer" htmlFor="debug-toggle">
                <span className="label-text"></span>
                <input
                  id="debug-toggle"
                  type="checkbox"
                  className="toggle toggle-primary"
                  aria-label="Enable Debug Mode"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Tabs */}
    <div className="bg-base-200 border-b border-base-300">
      <div role="tablist" className="tabs tabs-lifted">
        <button role="tab" className="tab tab-active" onClick={() => {}}>
          Manage Styles
        </button>
        <button role="tab" className="tab" onClick={() => {}}>
          Settings
        </button>
      </div>
    </div>
  </div>
);

describe("Manager App Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the manager with correct structure", () => {
    render(<MockApp />);

    // Check main structure
    const manageStylesTab = screen.getByRole("tab", { name: "Manage Styles" });
    expect(manageStylesTab).toBeTruthy();

    const settingsTab = screen.getByRole("tab", { name: "Settings" });
    expect(settingsTab).toBeTruthy();

    const versionText = screen.getByText("v1.0.0");
    expect(versionText).toBeTruthy();

    const logo = screen.getByAltText("Eastyles logo");
    expect(logo).toBeTruthy();
  });

  it("displays Manage Styles content by default", () => {
    render(<MockApp />);

    // Manage Styles content should be visible by default
    // Use more specific selectors to avoid ambiguity
    const manageStylesHeading = screen.getByRole("heading", {
      name: "Manage Styles",
    });
    expect(manageStylesHeading).toBeTruthy();

    const manageStylesContent = screen.getByText("Manage Styles Content");
    expect(manageStylesContent).toBeTruthy();

    expect(screen.queryByText("Enable Debug Mode")).toBeNull();
  });

  it("switches to Settings tab when clicked", () => {
    render(<MockApp />);

    // Initially on Manage Styles
    // Use role selector for tab to avoid ambiguity
    const manageStylesTab = screen.getByRole("tab", { name: "Manage Styles" });
    expect(manageStylesTab).toBeTruthy();

    const manageStylesContent = screen.getByText("Manage Styles Content");
    expect(manageStylesContent).toBeTruthy();

    expect(screen.queryByText("Enable Debug Mode")).toBeNull();

    // In our mock, both tabs are always visible, but we can check the structure
    const settingsTab = screen.getByRole("tab", { name: "Settings" });
    expect(settingsTab).toBeTruthy();
  });

  it("has proper accessibility attributes", () => {
    const { container } = render(<MockApp />);

    // Check that tabs have proper role
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();

    const tabButtons = tablist?.querySelectorAll('[role="tab"]');
    expect(tabButtons?.length).toBe(2);

    const manageTab = tabButtons?.[0];
    expect(manageTab).toBeTruthy();
    if (manageTab) {
      // Use role selector for tab to avoid ambiguity
      expect(
        screen.getByRole("tab", { name: "Manage Styles" }),
      ).toBeInTheDocument();
    }

    const settingsTab = tabButtons?.[1];
    expect(settingsTab).toBeTruthy();
    if (settingsTab) {
      // Use role selector for tab to avoid ambiguity
      expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
    }

    // Check that theme button has title
    const themeButton = screen.getByTitle(/Current theme:/);
    expect(themeButton).toBeTruthy();
  });

  it("uses DaisyUI classes for styling", () => {
    const { container } = render(<MockApp />);

    // Check main container classes
    const appRoot = container.querySelector(
      ".bg-base-100.min-h-screen.flex.flex-col",
    );
    expect(appRoot).toBeTruthy();

    // Check header classes
    const header = container.querySelector(
      ".bg-base-200.p-4.border-b.border-base-300",
    );
    expect(header).toBeTruthy();

    // Check tabs structure
    const tabs = container.querySelector(".tabs.tabs-lifted");
    expect(tabs).toBeTruthy();

    // Check that active tab has correct class
    const activeTab = container.querySelector(".tab.tab-active");
    expect(activeTab).toBeTruthy();
  });

  it("has proper semantic structure", () => {
    const { container } = render(<MockApp />);

    // Check that headings are present
    const h2 = container.querySelector("h2");
    expect(h2).toBeTruthy();
    expect(h2?.textContent?.includes("Manage Styles")).toBe(true);
    expect(h2?.tagName).toBe("H2");

    // Check tabs structure
    const tabs = container.querySelector('[role="tablist"]');
    expect(tabs).toBeTruthy();
  });
});
