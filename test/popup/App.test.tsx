import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

// Mock the wxt/browser import before defining local variables to handle hoisting
// Use a more generic approach that doesn't require the local variables to be defined first
vi.mock("wxt/browser", () => {
  // Return a mock object that will be updated later in the test setup
  const mockTabsQuery = vi.fn();
  const mockTabsCreate = vi.fn();
  const mockSendMessage = vi.fn();

  return {
    // Export the mock functions so tests can access them
    mockTabsQuery,
    mockTabsCreate,
    mockSendMessage,
    browser: {
      tabs: {
        query: mockTabsQuery,
        create: mockTabsCreate,
      },
      runtime: {
        sendMessage: mockSendMessage,
      },
    },
  };
});

// Import the mock functions - need to get the actual mocks from the module
import { mockTabsQuery, mockTabsCreate, mockSendMessage } from "wxt/browser";

// Mock window.close
Object.defineProperty(window, "close", {
  value: vi.fn(),
  writable: true,
});

// Mock the hooks and components used in App
vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ isDark: false }),
}));

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

vi.mock("../../hooks/useMessage", () => {
  // Include both the function and the constants in the mock
  return {
    useMessage: () => ({
      sendMessage: mockSendMessage, // Use the same mock defined in the browser mock
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
  };
});

vi.mock("../../components/ui/ErrorBoundary", () => ({
  withErrorBoundary: (component: React.ComponentType) => component,
}));

vi.mock("../../components/features/NewFontStyle", () => ({
  default: ({
    domain,
    selectedFont,
    onDomainChange,
    onFontChange,
    onClose,
  }: any) => (
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
      <button data-testid="close-font" onClick={onClose}>
        Close Font Selector
      </button>
    </div>
  ),
}));

vi.mock("../../components/features/VariableControls", () => ({
  VariableControls: ({ variables, onChange }: any) => (
    <div data-testid="variable-controls">
      {variables.map((v: any) => (
        <div key={v.name}>
          <label>{v.name}</label>
          <input
            data-testid={`variable-input-${v.name}`}
            value={v.value}
            onChange={(e) => onChange(v.name, e.target.value)}
          />
        </div>
      ))}
    </div>
  ),
}));

describe("Popup App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock responses to ensure they return quickly
    mockTabsQuery.mockResolvedValue(
      Promise.resolve([
        {
          id: 123,
          url: "https://example.com",
          title: "Example Domain",
        },
      ]),
    );
    mockSendMessage.mockResolvedValue(
      Promise.resolve({
        styles: [],
        success: true,
      }),
    );
  });

  it("renders loading state initially", async () => {
    // Mock the browser API to resolve with a delay to allow loading state to be visible
    mockTabsQuery.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 200)),
    );

    render(<App />);

    // Should show loading indicator initially
    // Using a basic assertion instead of toBeInTheDocument to avoid matcher issues
    expect(screen.getByText("Loading...")).toBeTruthy();

    // Wait for the loading to complete (with explicit timeout to prevent hanging)
    await waitFor(
      () => {
        expect(screen.queryByText("Loading...")).not.toBeTruthy();
      },
      { timeout: 5000 },
    );
  });

  it("loads and displays current tab information", async () => {
    const mockTab = {
      id: 123,
      url: "https://example.com",
      title: "Example Domain",
    };

    // Mock with a slight delay to ensure loading state is visible
    mockTabsQuery.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([mockTab]), 100)),
    );
    mockSendMessage.mockResolvedValue(
      Promise.resolve({ styles: [], success: true }),
    );

    render(<App />);

    // Wait for the component to finish loading
    await waitFor(
      () => {
        expect(screen.queryByText("Loading...")).not.toBeTruthy();
      },
      { timeout: 5000 },
    );

    // Should display the current tab information in the header as "Styles for example.com"
    // The translation "stylesFor" is "Styles for", so we expect to see "Styles for example.com"
    expect(screen.getByText(/example\.com/)).toBeTruthy();
  });
});
