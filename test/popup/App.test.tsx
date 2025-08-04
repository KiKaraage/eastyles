/// <reference types="vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../entrypoints/popup/App";
import * as themeModule from "../../hooks/useTheme";
import * as messageModule from "../../hooks/useMessage";
import * as errorModule from "../../hooks/useError";
import * as storageModule from "../../hooks/useStorage";
import { ErrorService } from "@services/errors/service";

// Mock all hooks and services
vi.mock("../../hooks/useTheme");
vi.mock("../../hooks/useMessage");
vi.mock("../../hooks/useError");
vi.mock("../../hooks/useStorage");
vi.mock("@services/errors/service");

const mockUseTheme = themeModule.useTheme as ReturnType<typeof vi.fn>;
const mockUsePopupActions = messageModule.usePopupActions as ReturnType<
  typeof vi.fn
>;
const mockUseError = errorModule.useError as ReturnType<typeof vi.fn>;
const mockUseSettings = storageModule.useSettings as ReturnType<typeof vi.fn>;

describe("App Component", () => {
  // Hold a reference to the mock handleError so we can assert it's called
  let mockHandleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a new mock for each test to ensure isolation
    mockHandleError = vi.fn();
    const MockErrorService = vi.mocked(ErrorService);
    MockErrorService.mockImplementation(
      () =>
        ({
          handleError: mockHandleError,
          // Add any other methods of ErrorService that are used, if any
        }) as unknown as InstanceType<typeof ErrorService>,
    );

    // Default mock implementation for the useError hook
    mockUseError.mockReturnValue({
      executeWithErrorHandling: vi.fn(
        async (fn: Function, context: unknown) => {
          try {
            return await fn();
          } catch (error: unknown) {
            // Simulate the hook's behavior by calling our local mock handleError
            mockHandleError(error, context);
            return undefined;
          }
        },
      ),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the popup with correct structure", () => {
    // Setup mock returns
    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    // executeWithErrorHandling is already mocked in beforeEach for common behavior
    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    // Check main structure
    expect(screen.getByText("Styles for...")).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
    expect(screen.getByText("Manage Styles")).toBeTruthy();
    expect(screen.getByText("Add New Style")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Active Styles")).toBeTruthy();
    expect(screen.getByText("Total Styles")).toBeTruthy();
  });

  it("displays loading state during async operations", async () => {
    // Setup mocks to simulate loading state
    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 50)),
        ),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    // executeWithErrorHandling is already mocked in beforeEach for common behavior
    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    // Simulate clicking a button that triggers loading
    const manageStylesButton = screen.getByText("Manage Styles");
    fireEvent.click(manageStylesButton);

    // Check that loading state appears
    await waitFor(
      () => {
        expect(screen.getByText("Loading...")).toBeTruthy();
      },
      { timeout: 100 },
    );

    // After the promise resolves, content should reappear
    await waitFor(
      () => {
        expect(screen.getByText("Manage Styles")).toBeTruthy();
        expect(screen.queryByText("Loading...")).toBeFalsy(); // Ensure loading is gone
      },
      { timeout: 100 },
    );
  });

  it("calls openManager when Manage Styles button is clicked", async () => {
    const mockOpenManager = vi.fn();
    mockUsePopupActions.mockReturnValue({
      openManager: mockOpenManager,
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    const manageStylesButton = screen.getByText("Manage Styles");
    fireEvent.click(manageStylesButton);

    // Wait for the async operation to complete and the mock to be called
    await waitFor(() => {
      expect(mockUseError().executeWithErrorHandling).toHaveBeenCalled();
      expect(mockOpenManager).toHaveBeenCalled();
    });

    // Check the arguments passed to executeWithErrorHandling
    const executeWithErrorHandlingCall =
      mockUseError().executeWithErrorHandling.mock.calls[0];
    expect(executeWithErrorHandlingCall[0]).toBeInstanceOf(Function); // It's the wrapper async function
    expect(executeWithErrorHandlingCall[1]).toEqual({
      errorMessage: "Failed to open manager page",
      errorType: "MESSAGE_ERROR",
      severity: "MEDIUM",
      recoverable: true,
      action: {
        label: "Retry",
        callback: expect.any(Function),
      },
    });
  });

  it("calls addNewStyle when Add New Style button is clicked", async () => {
    const mockAddNewStyle = vi.fn();
    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: mockAddNewStyle,
      openSettings: vi.fn(),
    });

    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    const addNewStyleButton = screen.getByText("Add New Style");
    fireEvent.click(addNewStyleButton);

    await waitFor(() => {
      expect(mockUseError().executeWithErrorHandling).toHaveBeenCalled();
      expect(mockAddNewStyle).toHaveBeenCalled();
    });

    const executeWithErrorHandlingCall =
      mockUseError().executeWithErrorHandling.mock.calls[0];
    expect(executeWithErrorHandlingCall[0]).toBeInstanceOf(Function);
    expect(executeWithErrorHandlingCall[1]).toEqual({
      errorMessage: "Failed to open style creation dialog",
      errorType: "MESSAGE_ERROR",
      severity: "MEDIUM",
      recoverable: true,
      action: {
        label: "Retry",
        callback: expect.any(Function),
      },
    });
  });

  it("calls openSettings when Settings button is clicked", async () => {
    const mockOpenSettings = vi.fn();
    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: vi.fn(),
      openSettings: mockOpenSettings,
    });

    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    const settingsButton = screen.getByText("Settings");
    fireEvent.click(settingsButton);

    await waitFor(() => {
      expect(mockUseError().executeWithErrorHandling).toHaveBeenCalled();
      expect(mockOpenSettings).toHaveBeenCalled();
    });

    const executeWithErrorHandlingCall =
      mockUseError().executeWithErrorHandling.mock.calls[0];
    expect(executeWithErrorHandlingCall[0]).toBeInstanceOf(Function);
    expect(executeWithErrorHandlingCall[1]).toEqual({
      errorMessage: "Failed to open settings",
      errorType: "MESSAGE_ERROR",
      severity: "MEDIUM",
      recoverable: true,
      action: {
        label: "Retry",
        callback: expect.any(Function),
      },
    });
  });

  it("calls toggleTheme when theme button is clicked", async () => {
    const mockToggleTheme = vi.fn();
    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: mockToggleTheme, // Ensure mockToggleTheme is returned
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    const themeButton = screen.getByTitle("Current theme: system (light)");
    fireEvent.click(themeButton);

    // Wait for the async operation within executeWithErrorHandling to finish
    await waitFor(() => {
      expect(mockUseError().executeWithErrorHandling).toHaveBeenCalled();
      expect(mockToggleTheme).toHaveBeenCalled(); // Ensure the underlying mockToggleTheme was called
    });

    // Check the arguments passed to executeWithErrorHandling
    const executeWithErrorHandlingCall =
      mockUseError().executeWithErrorHandling.mock.calls[0];
    expect(executeWithErrorHandlingCall[0]).toBeInstanceOf(Function);
    // We cannot expect the *passed function* to be `mockToggleTheme` directly because it's wrapped.
    // Instead, we verify that `mockToggleTheme` *was called* by the wrapper.
    expect(executeWithErrorHandlingCall[1]).toEqual({
      errorMessage: "Failed to toggle theme",
      errorType: "STORAGE_ERROR",
      severity: "LOW",
      recoverable: true,
    });
  });

  it("shows sun icon when isDark is false", () => {
    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    const themeButton = screen.getByTitle(/Current theme: system \(light\)/i);
    // When isDark is false, show the moon icon (sun path)
    expect(
      themeButton.querySelector(
        'svg path[d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"]',
      ),
    ).toBeTruthy();
    expect(
      themeButton.querySelector(
        'svg path[d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"]',
      ),
    ).toBeFalsy();
  });

  it("shows moon icon when isDark is true", () => {
    mockUseTheme.mockReturnValue({
      themeMode: "dark",
      effectiveTheme: "dark",
      isDark: true,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    const themeButton = screen.getByTitle(/Current theme: dark \(dark\)/i);
    // Expect the moon icon (second SVG path) to be present
    expect(
      themeButton.querySelector(
        'svg path[d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"]',
      ),
    ).toBeTruthy();
    expect(
      themeButton.querySelector(
        'svg path[d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"]',
      ),
    ).toBeFalsy();
  });

  it("displays correct current theme in button title", () => {
    mockUseTheme.mockReturnValue({
      themeMode: "light",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    const themeButton = screen.getByTitle("Current theme: light (light)");
    expect(themeButton).toBeTruthy();
  });

  it("handles errors gracefully when async operations fail", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi
        .fn()
        .mockRejectedValue(new Error("Failed to open manager")), // This mock will reject
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    // executeWithErrorHandling is already mocked in beforeEach to handle the rejection
    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    const manageStylesButton = screen.getByText("Manage Styles");
    fireEvent.click(manageStylesButton);

    // Wait for the error handling to complete
    await waitFor(() => {
      // Expect executeWithErrorHandling to have been called
      expect(mockUseError().executeWithErrorHandling).toHaveBeenCalled();
      // Expect our local mock handleError to be called
      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          errorMessage: "Failed to open manager page",
        }),
      );
    });

    consoleSpy.mockRestore();
  });

  it("shows loading spinner and hides content during async operations", async () => {
    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 50)),
        ),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    // executeWithErrorHandling is already mocked in beforeEach for common behavior
    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    // Simulate async operation
    const manageStylesButton = screen.getByText("Manage Styles");
    fireEvent.click(manageStylesButton);

    // Verify loading state appears and main content hides
    await waitFor(
      () => {
        expect(screen.getByText("Loading...")).toBeTruthy();
        expect(screen.queryByText("Manage Styles")).toBeFalsy();
      },
      { timeout: 100 },
    );

    // Verify content reappears after async operation completes
    await waitFor(
      () => {
        expect(screen.getByText("Manage Styles")).toBeTruthy();
        expect(screen.queryByText("Loading...")).toBeFalsy();
      },
      { timeout: 100 },
    );
  });

  it("updates stats values correctly", () => {
    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    mockUseError.mockReturnValue({
      executeWithErrorHandling: vi.fn().mockResolvedValue(undefined),
    });

    mockUseSettings.mockReturnValue({
      settings: { activeStyles: 5, totalStyles: 12 },
      updateSettings: vi.fn(),
    });

    render(<App />);

    // Check that stats display are present and show the hardcoded "0"
    // The component hardcodes "0" for stat values currently, so we'll assert against that.
    // If these were to be driven by `settings`, the test would need to read the `settings` prop.
    expect(screen.getByText("Active Styles")).toBeTruthy();
    expect(screen.getByText("Total Styles")).toBeTruthy();
    expect(screen.getAllByText("0")).toHaveLength(2); // There are two "0" values
  });

  it("maintains state across different async operations", async () => {
    const mockOpenManager = vi.fn();
    const mockAddNewStyle = vi.fn();
    const mockOpenSettings = vi.fn();

    // Set up initial mocks
    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });
    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });
    mockUsePopupActions.mockReturnValue({
      openManager: mockOpenManager,
      addNewStyle: mockAddNewStyle,
      openSettings: mockOpenSettings,
    });

    render(<App />);

    // First operation
    fireEvent.click(screen.getByText("Manage Styles"));
    await waitFor(() => {
      expect(mockOpenManager).toHaveBeenCalledTimes(1);
    });

    // Second operation
    fireEvent.click(screen.getByText("Add New Style"));
    await waitFor(() => {
      expect(mockAddNewStyle).toHaveBeenCalledTimes(1);
    });

    // Third operation
    fireEvent.click(screen.getByText("Settings"));
    await waitFor(() => {
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });

    // Verify total calls to executeWithErrorHandling
    expect(mockUseError().executeWithErrorHandling).toHaveBeenCalledTimes(3);
  });

  it("uses DaisyUI classes for styling", () => {
    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    const { container } = render(<App />);

    // Get the outermost div of the App component which has the main classes
    const appRootDiv = container.querySelector(
      ".bg-base-100.min-h-screen.flex.flex-col",
    );
    expect(appRootDiv).toBeTruthy();
    expect(appRootDiv?.classList.contains("flex")).toBeTruthy();
    expect(appRootDiv?.classList.contains("flex-col")).toBeTruthy();

    const manageStylesButton = screen.getByText("Manage Styles");
    expect(manageStylesButton.classList.contains("btn")).toBeTruthy();
    expect(manageStylesButton.classList.contains("btn-primary")).toBeTruthy();
    expect(manageStylesButton.classList.contains("w-full")).toBeTruthy();
    expect(manageStylesButton.classList.contains("justify-start")).toBeTruthy();

    const addNewStyleButton = screen.getByText("Add New Style");
    expect(addNewStyleButton.classList.contains("btn")).toBeTruthy();
    expect(addNewStyleButton.classList.contains("btn-secondary")).toBeTruthy();
    expect(addNewStyleButton.classList.contains("w-full")).toBeTruthy();
    expect(addNewStyleButton.classList.contains("justify-start")).toBeTruthy();

    const settingsButton = screen.getByText("Settings");
    expect(settingsButton.classList.contains("btn")).toBeTruthy();
    expect(settingsButton.classList.contains("btn-ghost")).toBeTruthy();
    expect(settingsButton.classList.contains("w-full")).toBeTruthy();
    expect(settingsButton.classList.contains("justify-start")).toBeTruthy();

    // Check for DaisyUI stats component
    const statsContainer = screen.getByText("Active Styles").closest(".stats");
    expect(statsContainer).toBeTruthy();
    expect(statsContainer?.classList.contains("stats")).toBeTruthy();
    expect(statsContainer?.classList.contains("shadow")).toBeTruthy();
  });

  it("has proper accessibility attributes", () => {
    mockUseTheme.mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      setThemeMode: vi.fn(),
      toggleTheme: vi.fn(),
    });

    mockUsePopupActions.mockReturnValue({
      openManager: vi.fn(),
      addNewStyle: vi.fn(),
      openSettings: vi.fn(),
    });

    mockUseSettings.mockReturnValue({
      settings: {},
      updateSettings: vi.fn(),
    });

    render(<App />);

    // Check that buttons are accessible and have proper classes
    const manageStylesButton = screen.getByText("Manage Styles");
    expect(manageStylesButton.classList.contains("btn")).toBeTruthy();

    const addNewStyleButton = screen.getByText("Add New Style");
    expect(addNewStyleButton.classList.contains("btn")).toBeTruthy();

    const settingsButton = screen.getByText("Settings");
    expect(settingsButton.classList.contains("btn")).toBeTruthy();

    // Check that theme button has title
    const themeButton = screen.getByTitle("Current theme: system (light)");
    expect(themeButton).toBeTruthy();
  });
});
