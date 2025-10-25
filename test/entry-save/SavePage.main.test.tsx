import type { SaveMessageResponses } from "@services/messaging/types";
import type { VariableDescriptor } from "@services/usercss/types";
import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../test-utils";

// Mock useI18n hook
vi.mock("../../hooks/useI18n", () => ({
  useI18n: vi.fn(() => ({
    t: vi.fn((key: string) => {
      const translations: Record<string, string> = {
        loadingUserCss: "Loading UserCSS...",
        failedToLoadUserCss: "Failed to load UserCSS",
        saveUserCss: "Save UserCSS",
        previewAndInstall: "Preview and install UserCSS styles",
        styleInformation: "Style Information",
        targetDomains: "Target Domains",
        noSpecificDomains: "No specific domains detected",
        codePreview: "Code Preview",
        codePreviewDescription:
          "Shows the complete UserCSS content including metadata block with variables and CSS rules.",
        installationError: "Installation Error",
        addingToEastyles: "Add to Eastyles",
        installing: "Installing...",
        cancelButton: "Cancel",
      };
      return translations[key] || key;
    }),
    hasMessage: vi.fn().mockReturnValue(true),
    getCurrentLocale: vi.fn().mockReturnValue("en"),
    getAvailableLocales: vi.fn().mockReturnValue(["en", "id"]),
  })),
}));

// Mock browser API
vi.mock("wxt/browser", () => {
  const mockBrowser = {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  };

  // Set global browser for wxt storage
  Object.defineProperty(window, "browser", {
    value: mockBrowser,
    writable: true,
  });

  return {
    browser: mockBrowser,
  };
});

// Mock wxt storage utils
vi.mock("wxt/utils/storage", () => ({
  storage: {
    defineItem: vi.fn(() => ({
      getValue: vi.fn().mockResolvedValue({ themeMode: "system" }),
      setValue: vi.fn().mockResolvedValue(undefined),
      watch: vi.fn().mockReturnValue(vi.fn()),
    })),
  },
}));

// Mock modules before any imports
vi.mock("codemirror", () => {
  // Create a single mock instance that will be reused
  const mockEditorViewInstance = {
    dispatch: vi.fn(),
    destroy: vi.fn(),
    state: {
      doc: {
        length: 0,
        toString: vi.fn().mockReturnValue(""),
      },
    },
  };

  // Create a mock EditorView constructor
  const MockEditorView = vi.fn().mockImplementation(() => {
    // Always return the same mock instance
    return mockEditorViewInstance;
  }) as unknown as typeof import("@codemirror/view").EditorView;

  // Add static methods to the mock constructor
  MockEditorView.editable = {
    isStatic: false,
    reader: vi.fn(),
    of: vi.fn().mockReturnValue({}),
    compute: vi.fn(),
    computeN: vi.fn(),
  } as unknown as typeof import("@codemirror/view").EditorView["editable"];

  MockEditorView.theme = vi.fn().mockReturnValue({});

  return {
    EditorView: MockEditorView,
    basicSetup: [],
  };
});

vi.mock("@codemirror/lang-css", () => ({
  css: () => [],
}));

// Mock useTheme hook
vi.mock("../../hooks/useTheme", () => ({
  useTheme: vi.fn(() => ({
    themeMode: "system",
    effectiveTheme: "light",
    isDark: false,
    isLight: true,
    setThemeMode: vi.fn(),
    setLightMode: vi.fn(),
    setDarkMode: vi.fn(),
    setSystemMode: vi.fn(),
    toggleTheme: vi.fn(),
    getSystemTheme: vi.fn(() => "light"),
  })),
}));

// Mock iconoir-react
vi.mock("iconoir-react", () => ({
  FloppyDisk: vi.fn(() => "FloppyDisk"),
  ArrowUpRight: vi.fn(() => "ArrowUpRight"),
  Settings: vi.fn(() => "Settings"),
}));

// Mock useSaveActions hook
vi.mock("../../hooks/useMessage", () => ({
  useSaveActions: vi.fn(),
}));

// Import after mocks
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import SavePage from "../../entrypoints/save/App";
import { useSaveActions } from "../../hooks/useMessage";

describe("SavePage Component", () => {
  type ParseUserCSSFn = (
    text: string,
    sourceUrl?: string,
  ) => Promise<SaveMessageResponses["PARSE_USERCSS"]>;
  type InstallStyleFn = (
    meta: NonNullable<SaveMessageResponses["PARSE_USERCSS"]["meta"]>,
    compiledCss: string,
    variables: VariableDescriptor[],
    originalCss: string,
  ) => Promise<SaveMessageResponses["INSTALL_STYLE"]>;

  const mockParseUserCSS = vi.fn<ParseUserCSSFn>();
  const mockInstallStyle = vi.fn<InstallStyleFn>();

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up global browser and matchMedia
    Object.defineProperty(window, "browser", {
      value: {
        storage: {
          local: {
            get: vi.fn().mockResolvedValue({}),
            remove: vi.fn().mockResolvedValue(undefined),
          },
        },
        runtime: {
          sendMessage: vi.fn(),
          onMessage: {
            addListener: vi.fn(),
            removeListener: vi.fn(),
          },
        },
      },
      writable: true,
    });

    (useSaveActions as ReturnType<typeof vi.fn>).mockReturnValue({
      parseUserCSS: mockParseUserCSS,
      installStyle: mockInstallStyle,
    });

    // Mock URLSearchParams
    Object.defineProperty(window, "location", {
      value: {
        search: "",
      },
      writable: true,
      configurable: true,
    });

    // Mock document.referrer
    Object.defineProperty(document, "referrer", {
      value: "https://example.com",
      writable: true,
      configurable: true,
    });

    // Mock window.history and window.close
    Object.defineProperty(window, "history", {
      value: {
        back: vi.fn(),
      },
      writable: true,
    });

    Object.defineProperty(window, "close", {
      value: vi.fn(),
      writable: true,
    });

    // Mock window.matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    // Don't mock setTimeout globally to avoid breaking testing library
    // The tests will be slightly slower but more reliable

    // Mock DOM methods for toast notifications
    vi.spyOn(document.body, "appendChild").mockImplementation(
      () => null as unknown as Node,
    );
    vi.spyOn(document.body, "removeChild").mockImplementation(
      () => null as unknown as Node,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("can import and instantiate SavePage component", () => {
    // Simple test to ensure the component can be imported and instantiated
    expect(SavePage).toBeDefined();
    expect(typeof SavePage).toBe("function");
  });

  it("renders loading state initially", async () => {
    mockParseUserCSS.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolve */
        }),
    );

    const { container } = render(<SavePage />);
    expect(container).toBeTruthy();

    // Try to find the loading element within the container
    await waitFor(() => {
      const loadingElement = container.querySelector(".text-xl");
      expect(loadingElement).toBeTruthy();
      expect(loadingElement?.textContent).toContain("Loading UserCSS...");
    });
  });

  it("renders preview and metadata on successful parse", async () => {
    const mockParseResult = {
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com", "test.com"],
      },
      css: "body { color: red; }",
      warnings: [],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);

    const { container } = render(<SavePage />);

    await waitFor(() => {
      const installButton = container.querySelector(".btn-primary");
      expect(installButton).toBeTruthy();
      expect(installButton?.textContent).toContain("Add to Eastyles");
    });

    expect(container.textContent).toContain("Test Style");
    expect(container.textContent).toContain("A test style");
    expect(container.textContent).toContain("Test Author");
    expect(container.textContent).toContain("1.0.0");
    expect(container.textContent).toContain("example.com");
    expect(container.textContent).toContain("test.com");

    // Check that page title was set inline when parseResult is set
    expect(document.title).toBe("Save UserCSS: Test Style v1.0.0");
  });

  it("shows error state when parse fails", async () => {
    mockParseUserCSS.mockResolvedValue({
      success: false,
      error: "Invalid UserCSS format",
    });

    const { container } = render(<SavePage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Invalid UserCSS format");
    });

    expect(container.textContent).not.toContain("Add to Eastyles");
  });

  it("displays warnings when present", async () => {
    const mockParseResult = {
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com"],
      },
      css: "body { color: red; }",
      warnings: ["Legacy syntax detected", "Deprecated feature used"],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);

    const { container } = render(<SavePage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Warnings");
    });

    expect(container.textContent).toContain("Legacy syntax detected");
    expect(container.textContent).toContain("Deprecated feature used");
  });

  it("displays errors and disables install button", async () => {
    const mockParseResult = {
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com"],
      },
      css: "body { color: red; }",
      warnings: [],
      errors: ["Syntax error at line 5", "Invalid property"],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);

    const { container } = render(<SavePage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Errors");
    });

    expect(container.textContent).toContain("Syntax error at line 5");
    expect(container.textContent).toContain("Invalid property");

    const installButton = container.querySelector(".btn-primary");
    expect(installButton?.classList.contains("btn-disabled")).toBe(true);
  });

  it("handles install action successfully", async () => {
    const mockParseResult = {
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com"],
      },
      css: "body { color: red; }",
      warnings: [],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);
    mockInstallStyle.mockResolvedValue({
      success: true,
      styleId: "test-id",
    });

    const { container } = render(<SavePage />);

    await waitFor(() => {
      const installButton = container.querySelector(".btn-primary");
      expect(installButton).toBeTruthy();
      expect(installButton?.textContent).toContain("Add to Eastyles");
    });

    const installButton = container.querySelector(".btn-primary");
    if (installButton) fireEvent.click(installButton);

    await waitFor(() => {
      expect(mockInstallStyle).toHaveBeenCalledWith(
        mockParseResult.meta,
        mockParseResult.css,
        [],
        expect.stringContaining("/* ==UserStyle=="),
      );
    });
  });

  it("handles install failure with error message", async () => {
    const mockParseResult = {
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com"],
      },
      css: "body { color: red; }",
      warnings: [],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);
    mockInstallStyle.mockResolvedValue({
      success: false,
      error: "Storage quota exceeded",
    });

    const { container } = render(<SavePage />);

    await waitFor(() => {
      const installButton = container.querySelector(".btn-primary");
      expect(installButton).toBeTruthy();
      expect(installButton?.textContent).toContain("Add to Eastyles");
    });

    const installButton = container.querySelector(".btn-primary");
    if (installButton) fireEvent.click(installButton);

    await waitFor(() => {
      expect(container.textContent).toContain("Storage quota exceeded");
    });
  });

  it("handles cancel action when referrer exists", async () => {
    const mockParseResult = {
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com"],
      },
      css: "body { color: red; }",
      warnings: [],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);

    const { container } = render(<SavePage />);

    await waitFor(() => {
      const cancelButton = container.querySelectorAll(".btn-ghost")[0]; // The cancel button
      expect(cancelButton).toBeTruthy();
      expect(cancelButton?.textContent?.trim()).toContain("Cancel");
    });

    const cancelButton = container.querySelectorAll(".btn-ghost")[0];
    if (cancelButton) fireEvent.click(cancelButton);

    expect(window.history.back).toHaveBeenCalled();
  });

  it("dims cancel button when no referrer", async () => {
    Object.defineProperty(document, "referrer", {
      value: "",
      writable: true,
      configurable: true,
    });

    const mockParseResult = {
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com"],
      },
      css: "body { color: red; }",
      warnings: [],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);

    const { container } = render(<SavePage />);

    await waitFor(() => {
      const cancelButton = container.querySelectorAll(".btn-ghost")[0]; // The cancel button
      expect(cancelButton).toBeTruthy();
      expect(cancelButton?.classList.contains("btn-disabled")).toBe(true);
      expect(cancelButton?.classList.contains("opacity-50")).toBe(true);
    });
  });

  it("loads CSS from URL parameters", async () => {
    // Mock URLSearchParams
    Object.defineProperty(window, "location", {
      value: {
        search:
          "?css=body%20%7B%20color%3A%20blue%3B%20%7D&sourceUrl=https%3A//example.com/test.css",
      },
      writable: true,
      configurable: true,
    });

    const mockParseResult = {
      success: true,
      meta: {
        name: "URL Style",
        namespace: "url.com",
        version: "1.0.0",
        description: "Style from URL",
        author: "URL Author",
        sourceUrl: "https://example.com/test.css",
        domains: ["example.com"],
      },
      css: "body { color: blue; }",
      warnings: [],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);

    render(<SavePage />);

    await waitFor(() => {
      expect(mockParseUserCSS).toHaveBeenCalledWith(
        "body { color: blue; }",
        "https://example.com/test.css",
      );
    });
  });

  it("uses fallback CSS when no URL parameters", async () => {
    const mockParseResult = {
      success: true,
      meta: {
        name: "Example Style",
        namespace: "example.com",
        version: "1.0.0",
        description: "An example UserCSS style for demonstration",
        author: "Example Author",
        sourceUrl: "https://example.com/style.user.css",
        domains: [],
      },
      css: "body { background-color: #ffffff; }",
      warnings: [],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);

    render(<SavePage />);

    expect(mockParseUserCSS).toHaveBeenCalledWith(
      expect.stringContaining("/* ==UserStyle=="),
      "https://example.com/style.user.css",
    );
  });

  it("handles parsing exceptions", async () => {
    mockParseUserCSS.mockRejectedValue(new Error("Network error"));

    const { container } = render(<SavePage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Network error");
    });
  });

  it("handles install exceptions", async () => {
    const mockParseResult = {
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com"],
      },
      css: "body { color: red; }",
      warnings: [],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);
    mockInstallStyle.mockRejectedValue(new Error("Installation failed"));

    const { container } = render(<SavePage />);

    await waitFor(() => {
      const installButton = container.querySelector(".btn-primary");
      expect(installButton).toBeTruthy();
      expect(installButton?.textContent).toContain("Add to Eastyles");
    });

    const installButton = container.querySelector(".btn-primary");
    if (installButton) fireEvent.click(installButton);

    await waitFor(() => {
      expect(container.textContent).toContain("Installation failed");
    });
  });

  it("closes window after successful install when no referrer", async () => {
    Object.defineProperty(document, "referrer", {
      value: "",
      writable: true,
      configurable: true,
    });

    const mockParseResult = {
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com"],
      },
      css: "body { color: red; }",
      warnings: [],
      errors: [],
    };

    mockParseUserCSS.mockResolvedValue(mockParseResult);
    mockInstallStyle.mockResolvedValue({
      success: true,
      styleId: "test-id",
    });

    const originalClose = window.close;
    const closeSpy = vi.fn();
    window.close = closeSpy;

    const { container } = render(<SavePage />);

    await waitFor(() => {
      const installButton = container.querySelector(".btn-primary");
      expect(installButton).toBeTruthy();
      if (installButton) fireEvent.click(installButton);
    });

    await waitFor(() => {
      expect(mockInstallStyle).toHaveBeenCalledTimes(1);
    });

    // Wait for the setTimeout to execute
    await new Promise((resolve) => setTimeout(resolve, 2100));

    expect(closeSpy).toHaveBeenCalled();

    window.close = originalClose;
    vi.restoreAllMocks();
  }, 10000);
});
