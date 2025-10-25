import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import App from "../../entrypoints/popup/App";
import type { UserCSSStyle } from "../../services/storage/schema";

// =============================================================================
// Type Definitions
// =============================================================================

interface NewFontStyleProps {
  domain: string;
  selectedFont: string;
  onDomainChange: (value: string) => void;
  onFontChange: (value: string) => void;
  onClose: () => void;
}

interface VariableControlsProps {
  showTitle?: boolean;
  variables: Array<{
    name: string;
    value: string;
    type?: string;
    label?: string;
  }>;
  onChange: (name: string, value: string) => void;
}

// =============================================================================
// Mock Implementations
// =============================================================================

// Mock useTheme hook - reuse from shared setup
vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ isDark: false }),
}));

// Mock useI18n hook - reuse from shared setup
vi.mock("../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        loading: "Loading...",
        stylesFor: "Styles for",
        manageStyles: "Manage Styles",
        font_apply: "Apply Font",
        colors_apply: "Apply Colors",
        applyButton: "Apply",
        font_createFontStyle: "Create Font Style",
        font_editStyle: "Edit Font Style",
        applying: "Applying...",
      };
      return translations[key] || key;
    },
  }),
}));

// Mock NewFontStyle component
vi.mock("../../components/features/NewFontStyle", () => ({
  default: ({
    domain,
    selectedFont,
    onDomainChange,
    onFontChange,
    onClose,
  }: NewFontStyleProps) => (
    <div data-testid="new-font-style">
      <input
        data-testid="domain-input"
        value={domain}
        onChange={(e) => onDomainChange(e.target.value)}
      />
      <input
        data-testid="font-input"
        value={selectedFont}
        onChange={(e) => onFontChange(e.target.value)}
      />
      <button type="button" data-testid="close-font" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

// Mock VariableControls component
vi.mock("../../components/features/VariableControls", () => ({
  VariableControls: ({ variables, onChange }: VariableControlsProps) => (
    <div data-testid="variable-controls">
      {variables.map((v) => (
        <div key={v.name}>
          <label htmlFor={`variable-input-${v.name}`}>
            {v.label || v.name}
          </label>
          <input
            id={`variable-input-${v.name}`}
            data-testid={`variable-input-${v.name}`}
            value={v.value}
            onChange={(e) => onChange(v.name, e.target.value)}
          />
        </div>
      ))}
    </div>
  ),
}));

// Mock ErrorBoundary wrapper
vi.mock("../../components/ui/ErrorBoundary", () => ({
  withErrorBoundary: (component: React.ComponentType) => component,
}));

// Mock useMessage hook - controllable sendMessage implementation
let mockSendMessage = vi.fn();

vi.mock("../../hooks/useMessage", () => ({
  useMessage: () => ({
    sendMessage: mockSendMessage,
    sendNotification: vi.fn(),
    onMessage: vi.fn(),
    onResponse: vi.fn(),
    isConnected: true,
    pendingMessages: 0,
  }),
  PopupMessageType: {
    QUERY_STYLES_FOR_URL: "QUERY_STYLES_FOR_URL",
    GET_STYLES: "GET_STYLES",
    TOGGLE_STYLE: "TOGGLE_STYLE",
    UPDATE_VARIABLES: "UPDATE_VARIABLES",
    THEME_CHANGED: "THEME_CHANGED",
    OPEN_MANAGER: "OPEN_MANAGER",
    ADD_STYLE: "ADD_STYLE",
    OPEN_SETTINGS: "OPEN_SETTINGS",
  },
  SaveMessageType: {
    UPDATE_FONT_STYLE: "UPDATE_FONT_STYLE",
    CREATE_FONT_STYLE: "CREATE_FONT_STYLE",
    INJECT_FONT: "INJECT_FONT",
    PARSE_USERCSS: "PARSE_USERCSS",
    INSTALL_STYLE: "INSTALL_STYLE",
  },
}));

// =============================================================================
// Test Suite
// =============================================================================

describe("Popup App Test Suite", () => {
  beforeAll(() => {
    // Mock window.close
    Object.defineProperty(window, "close", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  beforeEach(() => {
    // Reset all mocks
    vi.resetAllMocks();

    // Reset mockSendMessage
    mockSendMessage = vi.fn();
    mockSendMessage.mockResolvedValue({ success: true, styles: [] });

    // Setup default browser.tabs.query mock
    vi.mocked(browser.tabs.query).mockResolvedValue([
      {
        id: 123,
        url: "https://example.com",
        title: "Example Domain",
        active: true,
        windowId: 1,
        index: 0,
        pinned: false,
        highlighted: false,
        incognito: false,
      },
    ]);

    // Setup default browser.tabs.create mock
    vi.mocked(browser.tabs.create).mockResolvedValue({
      id: 456,
      url: "/manager.html#styles",
      active: true,
      windowId: 1,
      index: 1,
      pinned: false,
      highlighted: false,
      incognito: false,
    });

    // Clear window.close mock
    vi.mocked(window.close).mockClear();
  });

  // ===========================================================================
  // Scenario 1: Initial Loading State
  // ===========================================================================
  describe("Scenario 1: Initial Loading State", () => {
    it("should show loading spinner then disappear after data loads", async () => {
      // Setup: Delay tabs.query to make loading visible
      vi.mocked(browser.tabs.query).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve([
                  {
                    id: 123,
                    url: "https://example.com",
                    title: "Example",
                    active: true,
                    windowId: 1,
                    index: 0,
                    pinned: false,
                    highlighted: false,
                    incognito: false,
                  },
                ]),
              100,
            ),
          ),
      );

      render(<App />);

      // Assert: Loading spinner should be visible initially
      expect(screen.getByText("Loading...")).toBeTruthy();

      // Wait for loading to complete
      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Assert: Loading spinner should be gone
      expect(screen.queryByText("Loading...")).not.toBeTruthy();
    });
  });

  // ===========================================================================
  // Scenario 2: Current Tab Title Rendering
  // ===========================================================================
  describe("Scenario 2: Current Tab Title Rendering", () => {
    it("should display formatted hostname in header for http tabs", async () => {
      // Setup: Return a normal HTTP tab
      vi.mocked(browser.tabs.query).mockResolvedValue([
        {
          id: 123,
          url: "https://www.example.com/path",
          title: "Example Domain",
          active: true,
          windowId: 1,
          index: 0,
          pinned: false,
          highlighted: false,
          incognito: false,
        },
      ]);

      mockSendMessage.mockResolvedValue({ success: true, styles: [] });

      render(<App />);

      // Wait for component to load
      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Assert: Header should show "Styles for example.com" (www. removed)
      expect(screen.getByText(/Styles for/)).toBeTruthy();
      expect(screen.getByText(/example\.com/)).toBeTruthy();
    });

    it("should handle subdomains correctly", async () => {
      vi.mocked(browser.tabs.query).mockResolvedValue([
        {
          id: 123,
          url: "https://subdomain.example.com",
          title: "Subdomain Page",
          active: true,
          windowId: 1,
          index: 0,
          pinned: false,
          highlighted: false,
          incognito: false,
        },
      ]);

      mockSendMessage.mockResolvedValue({ success: true, styles: [] });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Subdomain should be preserved
      expect(screen.getByText(/subdomain\.example\.com/)).toBeTruthy();
    });
  });

  // ===========================================================================
  // Scenario 3: Restricted Page Handling
  // ===========================================================================
  describe("Scenario 3: Restricted Page Handling", () => {
    it("should show restricted message for chrome:// URLs", async () => {
      vi.mocked(browser.tabs.query).mockResolvedValue([
        {
          id: 123,
          url: "chrome://extensions",
          title: "Extensions",
          active: true,
          windowId: 1,
          index: 0,
          pinned: false,
          highlighted: false,
          incognito: false,
        },
      ]);

      mockSendMessage.mockResolvedValue({ success: true, styles: [] });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Assert: Should show restricted message
      expect(screen.getByText("No styles allowed on this page")).toBeTruthy();

      // Font Apply button should be disabled
      const fontButton = screen.getByText("Apply Font").closest("button");
      expect(fontButton?.disabled).toBe(true);
    });

    it("should show restricted message for about: URLs", async () => {
      vi.mocked(browser.tabs.query).mockResolvedValue([
        {
          id: 123,
          url: "about:blank",
          title: "About Blank",
          active: true,
          windowId: 1,
          index: 0,
          pinned: false,
          highlighted: false,
          incognito: false,
        },
      ]);

      mockSendMessage.mockResolvedValue({ success: true, styles: [] });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      expect(screen.getByText("No styles allowed on this page")).toBeTruthy();
    });
  });

  // ===========================================================================
  // Scenario 4: Style List Rendering & Toggle
  // ===========================================================================
  describe("Scenario 4: Style List Rendering & Toggle", () => {
    it("should render style cards with toggle functionality", async () => {
      const mockStyles: UserCSSStyle[] = [
        {
          id: "style-1",
          name: "Dark Theme",
          description: "A dark theme for the site",
          enabled: true,
          domains: [{ kind: "domain", pattern: "example.com" }],
          css: "body { background: black; }",
          variables: {},
          source: "",
          version: "1.0.0",
          author: "Test Author",
          namespace: "test",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          preprocessor: "none",
        },
        {
          id: "style-2",
          name: "Light Theme",
          description: "A light theme",
          enabled: false,
          domains: [],
          css: "body { background: white; }",
          variables: {},
          source: "",
          version: "1.0.0",
          author: "Test",
          namespace: "test",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          preprocessor: "none",
        },
      ];

      vi.mocked(browser.tabs.query).mockResolvedValue([
        {
          id: 123,
          url: "https://example.com",
          title: "Example",
          active: true,
          windowId: 1,
          index: 0,
          pinned: false,
          highlighted: false,
          incognito: false,
        },
      ]);

      mockSendMessage.mockResolvedValue({
        success: true,
        styles: mockStyles,
      });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Assert: Both styles should be visible
      expect(screen.getByText("Dark Theme")).toBeTruthy();
      expect(screen.getByText("A dark theme for the site")).toBeTruthy();
      expect(screen.getByText("Light Theme")).toBeTruthy();

      // Find toggle checkboxes
      const toggles = screen.getAllByRole("checkbox") as HTMLInputElement[];
      expect(toggles).toHaveLength(2);

      // First toggle should be checked (enabled: true)
      expect(toggles[0].checked).toBe(true);
      expect(toggles[1].checked).toBe(false);

      // Toggle the second style
      mockSendMessage.mockResolvedValueOnce({ success: true });
      fireEvent.click(toggles[1]);

      // Assert: TOGGLE_STYLE message should be called with correct payload
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith("TOGGLE_STYLE", {
          id: "style-2",
          enabled: true,
          tabId: 123,
        });
      });
    });

    it("should display font badge for font styles", async () => {
      const fontStyle: UserCSSStyle = {
        id: "font-1",
        name: "[FONT] Arial",
        description: "Arial font style",
        enabled: true,
        domains: [],
        css: "* { font-family: Arial; }",
        variables: {},
        source: "",
        version: "1.0.0",
        author: "System",
        namespace: "fonts",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preprocessor: "none",
      };

      mockSendMessage.mockResolvedValue({
        success: true,
        styles: [fontStyle],
      });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Should show FONT badge
      expect(screen.getByText("FONT")).toBeTruthy();
      expect(screen.getByText("Arial")).toBeTruthy();
    });
  });

  // ===========================================================================
  // Scenario 5: Variable Expansion
  // ===========================================================================
  describe("Scenario 5: Variable Expansion", () => {
    it("should expand variable controls when settings button clicked", async () => {
      const styleWithVars: UserCSSStyle = {
        id: "var-style",
        name: "Customizable Theme",
        description: "Theme with variables",
        enabled: true,
        domains: [],
        css: "body { color: var(--text-color); }",
        variables: {
          "text-color": {
            name: "text-color",
            label: "Text Color",
            type: "color",
            default: "#000000",
            value: "#000000",
          },
          "bg-color": {
            name: "bg-color",
            label: "Background",
            type: "color",
            default: "#ffffff",
            value: "#ffffff",
          },
        },
        source: "",
        version: "1.0.0",
        author: "Test",
        namespace: "test",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preprocessor: "none",
      };

      mockSendMessage.mockResolvedValue({
        success: true,
        styles: [styleWithVars],
      });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Variable controls should not be visible initially
      expect(screen.queryByTestId("variable-controls")).not.toBeTruthy();

      // Find and click settings button (should exist because style has variables)
      const settingsButton = screen.getByTestId("settings-icon").parentElement;
      expect(settingsButton).toBeTruthy();

      fireEvent.click(settingsButton!);

      // Now variable controls should be visible
      await waitFor(() => {
        expect(screen.getByTestId("variable-controls")).toBeTruthy();
      });

      // Should show variable inputs
      expect(screen.getByTestId("variable-input-text-color")).toBeTruthy();
      expect(screen.getByTestId("variable-input-bg-color")).toBeTruthy();
    });

    it("should trigger UPDATE_VARIABLES when variable changed", async () => {
      const styleWithVars: UserCSSStyle = {
        id: "var-style-2",
        name: "Variable Style",
        description: "Has variables",
        enabled: true,
        domains: [],
        css: "body { font-size: var(--size); }",
        variables: {
          size: {
            name: "size",
            label: "Font Size",
            type: "text",
            default: "16px",
            value: "16px",
          },
        },
        source: "",
        version: "1.0.0",
        author: "Test",
        namespace: "test",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preprocessor: "none",
      };

      mockSendMessage.mockResolvedValue({
        success: true,
        styles: [styleWithVars],
      });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Open variable controls
      const settingsButton = screen.getByTestId("settings-icon").parentElement;
      fireEvent.click(settingsButton!);

      await waitFor(() => {
        expect(screen.getByTestId("variable-controls")).toBeTruthy();
      });

      // Change variable value
      const input = screen.getByTestId("variable-input-size");
      mockSendMessage.mockResolvedValueOnce({ success: true });

      fireEvent.change(input, { target: { value: "20px" } });

      // Assert: UPDATE_VARIABLES should be called
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith("UPDATE_VARIABLES", {
          styleId: "var-style-2",
          variables: { size: "20px" },
        });
      });
    });
  });

  // ===========================================================================
  // Scenario 6: Font Editing Flow
  // ===========================================================================
  describe("Scenario 6: Font Editing Flow", () => {
    it("should navigate to NewFontStyle when Apply Font clicked", async () => {
      mockSendMessage.mockResolvedValue({ success: true, styles: [] });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Click Apply Font button
      const fontButton = screen.getByText("Apply Font");
      fireEvent.click(fontButton);

      // Should show NewFontStyle component
      await waitFor(() => {
        expect(screen.getByTestId("new-font-style")).toBeTruthy();
      });

      // Header should show "Create Font Style"
      expect(screen.getByText("Create Font Style")).toBeTruthy();
    });

    it("should enable Apply button when font selected and disable when empty", async () => {
      mockSendMessage.mockResolvedValue({ success: true, styles: [] });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Navigate to font selector
      const fontButton = screen.getByText("Apply Font");
      fireEvent.click(fontButton);

      await waitFor(() => {
        expect(screen.getByTestId("new-font-style")).toBeTruthy();
      });

      // Find Apply button in header
      const applyButton = screen.getByText("Apply").closest("button");
      expect(applyButton).toBeTruthy();

      // Should be disabled initially (no font selected)
      expect(applyButton?.disabled).toBe(true);

      // Type a font name
      const fontInput = screen.getByTestId("font-input");
      fireEvent.change(fontInput, { target: { value: "Arial" } });

      // Apply button should now be enabled
      await waitFor(() => {
        expect(applyButton?.disabled).toBe(false);
      });
    });

    it("should call CREATE_FONT_STYLE when saving new font", async () => {
      mockSendMessage.mockResolvedValue({ success: true, styles: [] });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Navigate to font creation
      fireEvent.click(screen.getByText("Apply Font"));

      await waitFor(() => {
        expect(screen.getByTestId("new-font-style")).toBeTruthy();
      });

      // Enter font details
      const domainInput = screen.getByTestId("domain-input");
      const fontInput = screen.getByTestId("font-input");

      fireEvent.change(domainInput, { target: { value: "example.com" } });
      fireEvent.change(fontInput, { target: { value: "Comic Sans MS" } });

      // Mock the CREATE_FONT_STYLE response
      mockSendMessage.mockResolvedValueOnce({ success: true });

      // Click Apply button
      const applyButton = screen.getByText("Apply").closest("button");
      fireEvent.click(applyButton!);

      // Assert: CREATE_FONT_STYLE should be called
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith("CREATE_FONT_STYLE", {
          domain: "example.com",
          fontName: "Comic Sans MS",
        });
      });
    });

    it("should call UPDATE_FONT_STYLE when editing existing font", async () => {
      const fontStyle: UserCSSStyle = {
        id: "font-edit",
        name: "[FONT] Arial",
        description: "Arial font",
        enabled: true,
        domains: [{ kind: "domain", pattern: "test.com" }],
        css: "* { font-family: Arial; }",
        variables: {},
        source: "",
        version: "1.0.0",
        author: "System",
        namespace: "fonts",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preprocessor: "none",
      };

      mockSendMessage.mockResolvedValue({
        success: true,
        styles: [fontStyle],
      });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Click edit button on font style
      const editButton = screen.getByTestId("edit-icon").parentElement;
      fireEvent.click(editButton!);

      await waitFor(() => {
        expect(screen.getByTestId("new-font-style")).toBeTruthy();
      });

      // Header should show "Edit Font Style"
      expect(screen.getByText("Edit Font Style")).toBeTruthy();

      // Font input should be pre-filled with the font name from the style
      const fontInput = screen.getByTestId("font-input") as HTMLInputElement;
      expect(fontInput.value).toBe("Arial");

      // Domain gets set to the style's domain when editing
      const domainInput = screen.getByTestId(
        "domain-input",
      ) as HTMLInputElement;
      expect(domainInput.value).toBe("test.com"); // Style's domain, not current tab

      // Change font name
      fireEvent.change(fontInput, { target: { value: "Helvetica" } });

      // Mock UPDATE_FONT_STYLE response
      mockSendMessage.mockResolvedValueOnce({ success: true });

      // Click Apply
      const applyButton = screen.getByText("Apply").closest("button");
      fireEvent.click(applyButton!);

      // Assert: UPDATE_FONT_STYLE should be called with style's domain
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith("UPDATE_FONT_STYLE", {
          styleId: "font-edit",
          domain: "test.com", // Style's domain
          fontName: "Helvetica",
        });
      });
    });
  });

  // ===========================================================================
  // Scenario 7: Manager Navigation
  // ===========================================================================
  describe("Scenario 7: Manager Navigation", () => {
    it("should open manager page and close popup when Manage Styles clicked", async () => {
      mockSendMessage.mockResolvedValue({ success: true, styles: [] });

      render(<App />);

      await waitFor(
        () => {
          expect(screen.queryByText("Loading...")).not.toBeTruthy();
        },
        { timeout: 3000 },
      );

      // Click Manage Styles button
      const managerButton = screen.getByText("Manage Styles");
      fireEvent.click(managerButton);

      // Assert: browser.tabs.create should be called with manager URL
      await waitFor(() => {
        expect(browser.tabs.create).toHaveBeenCalledWith({
          url: "/manager.html#styles",
        });
      });

      // Assert: window.close should be called
      await waitFor(() => {
        expect(window.close).toHaveBeenCalled();
      });
    });
  });
});
