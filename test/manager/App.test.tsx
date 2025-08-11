import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "../../entrypoints/manager/App.tsx";
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

// Mock icons from iconoir-react
vi.mock("iconoir-react", () => ({
  SunLight: () => <div data-testid="sun-icon" />,
  HalfMoon: () => <div data-testid="moon-icon" />,
  Computer: () => <div data-testid="computer-icon" />,
}));

describe("Manager App Component", () => {
  const mockToggleTheme = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

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

    expect(screen.getByAltText("Eastyles logo")).toBeTruthy();
    expect(screen.getByText(`v${pkg.version}`)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Manage Styles" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeTruthy();
  });

  it("displays 'Manage Styles' content by default", () => {
    render(<App />);
    expect(screen.getByText("Manage Styles Content")).toBeTruthy();
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
    expect(screen.queryByText("Manage Styles Content")).toBeNull();
    expect(window.location.hash).toBe("#settings");
  });

  it("switches to 'Manage Styles' tab when clicked and updates hash", () => {
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
    expect(screen.getByText("Manage Styles Content")).toBeTruthy();
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

  it("activates 'Manage Styles' tab when URL hash is #styles on initial load", () => {
    window.location.hash = "#styles";
    render(<App />);

    const manageTab = screen.getByRole("tab", { name: "Manage Styles" });
    expect(manageTab.classList.contains("tab-active")).toBe(true);
    expect(screen.getByText("Manage Styles Content")).toBeTruthy();
  });

  it("activates 'Manage Styles' tab when URL hash is #manage-styles on initial load", () => {
    window.location.hash = "#manage-styles";
    render(<App />);

    const manageTab = screen.getByRole("tab", { name: "Manage Styles" });
    expect(manageTab.classList.contains("tab-active")).toBe(true);
    expect(screen.getByText("Manage Styles Content")).toBeTruthy();
  });

  it("updates active tab when hash changes after initial load", () => {
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
    expect(screen.getByText("Manage Styles Content")).toBeTruthy();
  });

  it("calls toggleTheme when theme button is clicked", () => {
    render(<App />);
    const themeButton = screen.getByTitle(/Current theme:/);
    fireEvent.click(themeButton);
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("displays correct theme icon for light mode", () => {
    (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
      themeMode: "light",
      effectiveTheme: "light",
      toggleTheme: mockToggleTheme,
    });
    render(<App />);
    expect(screen.getByTitle("Current theme: light (light)")).toBeTruthy();
    expect(screen.getByTestId("sun-icon")).toBeTruthy();
  });

  it("displays correct theme icon for dark mode", () => {
    (useTheme as ReturnType<typeof vi.fn>).mockReturnValue({
      themeMode: "dark",
      effectiveTheme: "dark",
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
      toggleTheme: mockToggleTheme,
    });
    render(<App />);
    expect(screen.getByTitle("Current theme: system (light)")).toBeTruthy();
    expect(screen.getByTestId("computer-icon")).toBeTruthy();
  });
});
