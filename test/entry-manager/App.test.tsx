import { storageClient } from "@services/storage/client";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../entrypoints/manager/App";
import { useTheme } from "../../hooks/useTheme";
import pkg from "../../package.json";

// Mock dependencies
vi.mock("../../hooks/useTheme", () => ({
  useTheme: vi.fn(),
}));

// Mock Settings component
vi.mock("../../components/features/Settings", () => ({
  default: () => <div>Settings Component</div>,
}));

describe("Manager App Component", () => {
  const mockToggleTheme = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up storage client spies
    vi.spyOn(storageClient, "getUserCSSStyles").mockResolvedValue([]);
    vi.spyOn(storageClient, "watchUserCSSStyles").mockImplementation(
      () => () => {
        /* no-op */
      },
    );
    vi.spyOn(storageClient, "addUserCSSStyle").mockResolvedValue({
      id: "test-id",
      name: "Test Style",
      namespace: "test-namespace",
      version: "1.0.0",
      description: "A test style",
      author: "Test Author",
      sourceUrl: "https://example.com",
      domains: [{ kind: "domain", pattern: "example.com", include: true }],
      compiledCss: "body { color: red; }",
      variables: {},
      originalDefaults: {},
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: "body { color: red; }",
    });
    vi.spyOn(storageClient, "updateUserCSSStyle").mockResolvedValue({
      id: "test-id",
      name: "Test Style",
      namespace: "test-namespace",
      version: "1.0.0",
      description: "A test style",
      author: "Test Author",
      sourceUrl: "https://example.com",
      domains: [{ kind: "domain", pattern: "example.com", include: true }],
      compiledCss: "body { color: red; }",
      variables: {},
      originalDefaults: {},
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: "body { color: red; }",
    });
    vi.spyOn(storageClient, "removeUserCSSStyle").mockResolvedValue(undefined);
    vi.spyOn(storageClient, "updateUserCSSStyleVariables").mockResolvedValue({
      id: "test-id",
      name: "Test Style",
      namespace: "test-namespace",
      version: "1.0.0",
      description: "A test style",
      author: "Test Author",
      sourceUrl: "https://example.com",
      domains: [{ kind: "domain", pattern: "example.com", include: true }],
      compiledCss: "body { color: red; }",
      variables: {
        color: {
          name: "--color",
          type: "color",
          default: "#ff0000",
          value: "#ff0000",
        },
      },
      originalDefaults: { "--color": "#ff0000" },
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: "body { color: red; }",
    });

    (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      toggleTheme: mockToggleTheme,
    });

    window.location.hash = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the manager with correct structure and version", () => {
    render(<App />);

    expect(
      document.querySelector('[aria-hidden="true"][style*="mask"]'),
    ).toBeTruthy();
    expect(screen.getByText(`v${pkg.version}`)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Manage Styles" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeTruthy();
  });

  it("displays 'Manage Styles' content by default", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("No styles installed")).toBeTruthy();
    });
    expect(screen.queryByText("Settings Component")).toBeNull();
    const manageTab = screen.getByRole("tab", { name: "Manage Styles" });
    expect(manageTab.classList.contains("tab-active")).toBe(true);
  });

  it("switches to 'Settings' tab when clicked and updates hash", () => {
    render(<App />);
    const settingsTab = screen.getByRole("tab", { name: "Settings" });

    act(() => {
      fireEvent.click(settingsTab);
    });

    expect(settingsTab.classList.contains("tab-active")).toBe(true);
    expect(screen.getByText("Settings Component")).toBeTruthy();
    expect(screen.queryByText("No styles installed")).toBeNull();
    expect(window.location.hash).toBe("#settings");
  });

  it("switches to 'Manage Styles' tab when clicked and updates hash", async () => {
    render(<App />);

    const settingsTab = screen.getByRole("tab", { name: "Settings" });
    act(() => {
      fireEvent.click(settingsTab);
    });

    const manageTab = screen.getByRole("tab", { name: "Manage Styles" });
    act(() => {
      fireEvent.click(manageTab);
    });

    expect(manageTab.classList.contains("tab-active")).toBe(true);
    await waitFor(() => {
      expect(screen.getByText("No styles installed")).toBeTruthy();
    });
    expect(screen.queryByText("Settings Component")).toBeNull();
    expect(window.location.hash).toBe("#styles");
  });

  it("activates 'Settings' tab when URL hash is #settings on initial load", () => {
    window.location.hash = "#settings";
    render(<App />);

    const settingsTab = screen.getByRole("tab", { name: "Settings" });
    expect(settingsTab.classList.contains("tab-active")).toBe(true);
    expect(screen.getByText("Settings Component")).toBeTruthy();
  });

  it("activates 'Manage Styles' tab when URL hash is #styles on initial load", async () => {
    window.location.hash = "#styles";
    render(<App />);

    const manageTab = screen.getByRole("tab", { name: "Manage Styles" });
    expect(manageTab.classList.contains("tab-active")).toBe(true);
    await waitFor(() => {
      expect(screen.getByText("No styles installed")).toBeTruthy();
    });
  });

  it("activates 'Manage Styles' tab when URL hash is #manage-styles on initial load", async () => {
    window.location.hash = "#manage-styles";
    render(<App />);

    const manageTab = screen.getByRole("tab", { name: "Manage Styles" });
    expect(manageTab.classList.contains("tab-active")).toBe(true);
    await waitFor(() => {
      expect(screen.getByText("No styles installed")).toBeTruthy();
    });
  });

  it("updates active tab when hash changes after initial load", async () => {
    render(<App />);

    const manageTab = screen.getByRole("tab", { name: "Manage Styles" });
    expect(manageTab.classList.contains("tab-active")).toBe(true);

    act(() => {
      window.location.hash = "#settings";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    const settingsTab = screen.getByRole("tab", { name: "Settings" });
    expect(settingsTab.classList.contains("tab-active")).toBe(true);
    expect(screen.getByText("Settings Component")).toBeTruthy();

    act(() => {
      window.location.hash = "#styles";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(manageTab.classList.contains("tab-active")).toBe(true);
    await waitFor(() => {
      expect(screen.getByText("No styles installed")).toBeTruthy();
    });
  });

  it("calls toggleTheme when theme button is clicked", () => {
    render(<App />);
    const themeButton = screen.getByTitle(/Current theme:/);
    fireEvent.click(themeButton);
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("displays correct theme icon for light mode", () => {
    (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      isLight: true,
      setThemeMode: vi.fn(),
      toggleTheme: mockToggleTheme,
    });
    render(<App />);
    expect(screen.getByTitle("Current theme: light (light)")).toBeTruthy();
    expect(
      document.querySelector('[aria-hidden="true"][style*="mask"]'),
    ).toBeTruthy();
  });

  it("displays correct theme icon for dark mode", () => {
    (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
      themeMode: "dark",
      effectiveTheme: "dark",
      isDark: true,
      isLight: false,
      setThemeMode: vi.fn(),
      toggleTheme: mockToggleTheme,
    });
    render(<App />);
    expect(screen.getByTitle("Current theme: dark (dark)")).toBeTruthy();
    expect(screen.getByTestId("moon-icon")).toBeTruthy();
  });

  it("displays correct theme icon for system mode", () => {
    (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
      themeMode: "system",
      effectiveTheme: "light",
      isDark: false,
      isLight: true,
      setThemeMode: vi.fn(),
      toggleTheme: mockToggleTheme,
    });
    render(<App />);
    expect(screen.getByTitle("Current theme: system (light)")).toBeTruthy();
    expect(screen.getByTestId("computer-icon")).toBeTruthy();
  });
});
