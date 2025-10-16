/**
 * ManagerPage Component Tests
 *
 * Tests for the Manager Page UI component that displays and manages UserCSS styles.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ManagerPage from "../../components/features/manager/ManagerPage";
import { storageClient } from "../../services/storage/client";
import type { UserCSSStyle } from "../../services/storage/schema";

// Mock storage client
vi.mock("../../../services/storage/client", () => ({
  storageClient: {
    getUserCSSStyles: vi.fn(),
    enableUserCSSStyle: vi.fn(),
    removeUserCSSStyle: vi.fn(),
    updateUserCSSStyleVariables: vi.fn(),
    watchUserCSSStyles: vi.fn(() => vi.fn()),
    updateUserCSSStyle: vi.fn(), // Added for new edit functionality
  },
}));

// Mock useMessage hook
vi.mock("../../../hooks/useMessage", () => ({
  useMessage: () => ({
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  }),
  PopupMessageType: {
    TOGGLE_STYLE: "TOGGLE_STYLE",
    UPDATE_VARIABLES: "UPDATE_VARIABLES", // Added for variable updates
  },
  SaveMessageType: {
    CREATE_FONT_STYLE: "CREATE_FONT_STYLE",
    UPDATE_FONT_STYLE: "UPDATE_FONT_STYLE",
  },
}));

// Mock browser
vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      getURL: vi.fn(
        (path: string) => `chrome-extension://test-extension-id${path}`,
      ),
    },
  },
}));

// Mock window.confirm
const mockConfirm = vi.fn();
Object.defineProperty(window, "confirm", {
  writable: true,
  value: mockConfirm,
});

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};
Object.defineProperty(window, "sessionStorage", {
  value: mockSessionStorage,
});

// Enhanced HTMLDialogElement mock for better jsdom support
const originalShowModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  // Set open attribute to make content accessible to testing library
  this.setAttribute("open", "");
  this.style.display = "block";
  this.style.position = "fixed";
  this.style.zIndex = "9999";
  return originalShowModal ? originalShowModal.call(this) : undefined;
};

const originalClose = HTMLDialogElement.prototype.close;
HTMLDialogElement.prototype.close = function () {
  // Remove open attribute and hide dialog
  this.removeAttribute("open");
  this.style.display = "none";
  return originalClose ? originalClose.call(this) : undefined;
};

describe("ManagerPage", () => {
  const mockStyles: UserCSSStyle[] = [
    {
      id: "style-1",
      name: "Test Style 1",
      namespace: "test",
      version: "1.0.0",
      description: "A test style",
      author: "Test Author",
      sourceUrl: "https://example.com/style.user.css",
      domains: [
        { kind: "domain", pattern: "example.com", include: true },
        { kind: "url-prefix", pattern: "https://test.com", include: true },
      ],
      compiledCss: "body { color: red; }",
      variables: {},
      originalDefaults: {},
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: "/* ==UserStyle== */ body { color: red; }",
      originalDomainCondition:
        'domain("example.com"), url-prefix("https://test.com")', // Added field
    },
    {
      id: "style-2",
      name: "Test Style 2",
      namespace: "test",
      version: "1.0.0",
      description: "Another test style",
      author: "Test Author 2",
      sourceUrl: "https://example.com/style2.user.css",
      domains: [],
      compiledCss: "body { color: blue; }",
      variables: {
        "--accent-color": {
          name: "--accent-color",
          type: "color",
          default: "#ff0000",
          value: "#00ff00",
        },
      },
      originalDefaults: { "--accent-color": "#ff0000" },
      assets: [],
      installedAt: Date.now(),
      enabled: false,
      source: "/* ==UserStyle== */ body { color: blue; }",
      originalDomainCondition: "", // Added field
    },
    {
      id: "style-3",
      name: "[FONT] Arial",
      namespace: "font",
      version: "1.0.0",
      description: "Arial font style",
      author: "Font Author",
      sourceUrl: "https://example.com/font.user.css",
      domains: [{ kind: "domain", pattern: "example.com", include: true }],
      compiledCss: "body { font-family: Arial; }",
      variables: {},
      originalDefaults: {},
      assets: [],
      installedAt: Date.now(),
      enabled: true,
      source: "/* ==UserStyle== */ body { font-family: Arial; }",
      originalDomainCondition: 'domain("example.com")', // Added field
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockReturnValue(true);

    // Mock storage client methods
    vi.mocked(storageClient.getUserCSSStyles).mockResolvedValue(mockStyles);
    vi.mocked(storageClient.watchUserCSSStyles).mockReturnValue(vi.fn());
  });

  it("renders list of styles", async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      expect(screen.getByText("Test Style 1")).toBeTruthy();
      expect(screen.getByText("Test Style 2")).toBeTruthy();
      expect(screen.getByText("Arial")).toBeTruthy(); // Should show "Arial" without "[FONT] " prefix
    });
  });

  it("toggles style enabled state", async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      const toggleSwitches = screen.getAllByRole("checkbox");
      expect(toggleSwitches).toHaveLength(3);
    });

    const toggleSwitches = screen.getAllByRole("checkbox");
    // Toggle the first style (currently enabled) to disabled
    fireEvent.click(toggleSwitches[0]);

    await waitFor(() => {
      expect(storageClient.enableUserCSSStyle).toHaveBeenCalledWith(
        "style-1",
        false,
      );
    });
  });

  it("shows configure button only for enabled styles with variables", async () => {
    // Modify mock to have an enabled style with variables
    const stylesWithEnabledVariables = [
      ...mockStyles.slice(0, 1),
      {
        ...mockStyles[1],
        enabled: true, // Enable the style with variables
      },
      ...mockStyles.slice(2),
    ];
    vi.mocked(storageClient.getUserCSSStyles).mockResolvedValue(
      stylesWithEnabledVariables,
    );

    render(<ManagerPage />);

    await waitFor(() => {
      const configureButtons = screen.getAllByTitle("Configure variables");
      expect(configureButtons).toHaveLength(1); // Should have 1 now
    });
  });

  it("expands variable controls when configure button is clicked", async () => {
    // Modify mock to have an enabled style with variables
    const stylesWithEnabledVariables = [
      ...mockStyles.slice(0, 1),
      {
        ...mockStyles[1],
        enabled: true, // Enable the style with variables
      },
      ...mockStyles.slice(2),
    ];
    vi.mocked(storageClient.getUserCSSStyles).mockResolvedValue(
      stylesWithEnabledVariables,
    );

    render(<ManagerPage />);

    await waitFor(() => {
      const configureButton = screen.getByTitle("Configure variables");
      fireEvent.click(configureButton);
    });

    await waitFor(() => {
      expect(screen.getByText("Configure Variables")).toBeTruthy();
    });
  });

  it("deletes style with confirmation", async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle("Delete style");
      fireEvent.click(deleteButtons[0]);
    });

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        'Are you sure you want to delete "Test Style 1"? This action cannot be undone.',
      );
      expect(storageClient.removeUserCSSStyle).toHaveBeenCalledWith("style-1");
    });
  });

  it("cancels deletion when user declines confirmation", async () => {
    mockConfirm.mockReturnValueOnce(false);

    render(<ManagerPage />);

    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle("Delete style");
      fireEvent.click(deleteButtons[0]);
    });

    expect(storageClient.removeUserCSSStyle).not.toHaveBeenCalled();
  });

  it("formats domains correctly", async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      // Check the updated text format in the new UI - the text is inside a p tag
      expect(
        screen.getByText((content, element) => {
          return (
            element?.tagName?.toLowerCase() === "p" &&
            content.includes("example.com, starts with test.com")
          );
        }),
      ).toBeTruthy();
      expect(
        screen.getByText((content, element) => {
          return (
            element?.tagName?.toLowerCase() === "p" &&
            content.includes("All sites")
          );
        }),
      ).toBeTruthy();
    });
  });

  it("shows empty state when no styles are installed", async () => {
    vi.mocked(storageClient.getUserCSSStyles).mockResolvedValue([]);

    render(<ManagerPage />);

    await waitFor(() => {
      expect(screen.getByText("No styles installed")).toBeTruthy();
    });
  });

  it("shows import functionality", async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      // Check that the import button exists
      expect(screen.getByTestId("transition-right-icon")).toBeTruthy();
    });
  });

  it("shows loading state", () => {
    vi.mocked(storageClient.getUserCSSStyles).mockImplementation(
      () =>
        new Promise(() => {
          /* never resolve */
        }),
    );

    render(<ManagerPage />);

    // Looking for the actual loading spinner class from the component
    expect(
      screen.getByText((_content: string, element: Element | null) => {
        return (
          element?.tagName === "DIV" &&
          (element as HTMLElement)?.className?.includes("loading-spinner")
        );
      }),
    ).toBeTruthy();
  });

  it("displays error messages", async () => {
    const errorMessage = "Failed to load styles";
    vi.mocked(storageClient.getUserCSSStyles).mockRejectedValue(
      new Error(errorMessage),
    );

    render(<ManagerPage />);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeTruthy();
    });
  });

  it("shows import and font creation buttons", async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      expect(screen.getByTestId("transition-right-icon")).toBeTruthy();
      expect(screen.getByTestId("text-size-icon")).toBeTruthy();
    });
  });

  it("handles edit functionality for regular styles", async () => {
    render(<ManagerPage />);

    // Wait for initial load
    await waitFor(
      () => {
        expect(screen.getByText("Test Style 1")).toBeTruthy();
      },
      { timeout: 2000 },
    );

    // Find the edit button for the first style - it's an icon button
    const editButtons = screen.getAllByTitle("Edit style");
    expect(editButtons).toHaveLength(3); // Should have 3 edit buttons for the 3 styles
    fireEvent.click(editButtons[0]);

    // Check that the edit modal opens - this might happen asynchronously
    await waitFor(
      () => {
        const editMetadataText = screen.queryByText("Edit Metadata");
        if (editMetadataText) {
          expect(editMetadataText).toBeTruthy();
        } else {
          // If dialog is not visible, let's check if the save button appears in DOM by using findByRole
        }
      },
      { timeout: 2000 },
    );

    // Use findBy for elements that appear after the modal opens
    const nameInput = await screen.findByLabelText(
      "Style Name",
      {},
      { timeout: 2000 },
    );
    fireEvent.change(nameInput, { target: { value: "Updated Style Name" } });

    // Check if save button is enabled
    const saveButton = await screen.findByRole(
      "button",
      { name: "Save Changes" },
      { timeout: 2000 },
    );
    expect(saveButton.hasAttribute("disabled")).toBe(false);

    // Save the changes
    fireEvent.click(saveButton);

    await waitFor(
      () => {
        expect(storageClient.updateUserCSSStyle).toHaveBeenCalledWith(
          "style-1",
          expect.objectContaining({
            name: "Updated Style Name",
          }),
        );
      },
      { timeout: 2000 },
    );
  });

  it("handles edit functionality for font styles", async () => {
    render(<ManagerPage />);

    await waitFor(() => {
      // Find the edit button for the font style
      const editButtons = screen.getAllByTitle("Edit style");
      expect(editButtons).toHaveLength(3); // Should have 3 edit buttons for the 3 styles
      fireEvent.click(editButtons[2]); // Click the third style which is the font style
    });

    // Check that the edit modal opens - font styles have the same edit flow as regular styles
    await waitFor(() => {
      expect(screen.getByText("Edit Metadata")).toBeTruthy();
    });
  });
});
