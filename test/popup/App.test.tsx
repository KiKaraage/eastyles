import { browser } from "wxt/browser";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../../entrypoints/popup/App";
import type React from "react";

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

interface NewFontStyleProps {
  domain: string;
  selectedFont: string;
  onDomainChange: (value: string) => void;
  onFontChange: (value: string) => void;
  onClose: () => void;
}

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
        Close Font Selector
      </button>
    </div>
  ),
}));

interface VariableControlsProps {
  variables: Array<{ name: string; value: string }>;
  onChange: (name: string, value: string) => void;
}

interface VariableItem {
  name: string;
  value: string;
}

vi.mock("../../components/features/VariableControls", () => ({
  VariableControls: ({ variables, onChange }: VariableControlsProps) => (
    <div data-testid="variable-controls">
      {variables.map((v: VariableItem) => (
        <div key={v.name}>
          <label htmlFor={`variable-input-${v.name}`}>{v.name}</label>
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

vi.mock("../../hooks/useMessage", () => ({
  useMessage: () => ({
    sendMessage: vi.fn(),
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

vi.mock("../../components/ui/ErrorBoundary", () => ({
  withErrorBoundary: (component: React.ComponentType) => component,
}));

describe("Popup App", () => {
  let mockTabsQuery: ReturnType<typeof vi.fn>;
  let mockSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock functions
    mockTabsQuery = vi.fn();
    mockSendMessage = vi.fn();

    // Mock browser APIs
    vi.mocked(browser.tabs.query).mockImplementation(mockTabsQuery);
    vi.mocked(browser.runtime.sendMessage).mockImplementation(mockSendMessage);

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
    expect(screen.getByText(/example\.com/)).toBeTruthy();
  });
});
