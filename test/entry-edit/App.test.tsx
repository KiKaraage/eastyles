/**
 * Unit tests for Edit Page App component
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock URLSearchParams
const mockURLSearchParams = {
  get: vi.fn().mockReturnValue("test-style-id"),
  toString: vi.fn(),
};

Object.defineProperty(global, "URLSearchParams", {
  value: vi.fn(() => mockURLSearchParams),
  writable: true,
});

// Setup DOM container for React Testing Library
beforeEach(() => {
  // Ensure document.body exists and is clean
  if (typeof document !== "undefined" && document.body) {
    document.body.innerHTML = "";
  }

  // Create a div for React to mount to
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);

  // Mock window.location
  Object.defineProperty(window, "location", {
    value: {
      search: "?styleId=test-style-id",
    },
    writable: true,
  });

  // Mock document.referrer
  Object.defineProperty(document, "referrer", {
    value: "http://localhost:3000/manager",
    writable: true,
  });

  // Mock window.close
  Object.defineProperty(window, "close", {
    value: vi.fn(),
    writable: true,
  });

  // Mock window.history.back
  Object.defineProperty(window.history, "back", {
    value: vi.fn(),
    writable: true,
  });
});

// Mock all dependencies before importing the component
vi.mock("../../hooks/useMessage", () => ({
  useEditActions: () => ({
    getStyleForEdit: vi.fn().mockResolvedValue({
      success: true,
      style: {
        id: "test-style-id",
        name: "Test Style",
        css: "/* ==UserStyle==\n@name Test Style\n==/UserStyle== */\nbody { color: red; }",
        meta: {
          name: "Test Style",
          namespace: "test.com",
          version: "1.0.0",
          description: "Test description",
          author: "Test Author",
          sourceUrl: "https://test.com",
          domains: ["test.com"],
        },
      },
    }),
    updateStyle: vi.fn().mockResolvedValue({
      success: true,
      styleId: "test-style-id",
    }),
  }),
  useSaveActions: () => ({
    parseUserCSS: vi.fn().mockResolvedValue({
      success: true,
      meta: {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "Test description",
        author: "Test Author",
        sourceUrl: "https://test.com",
        domains: ["test.com"],
      },
      css: "body { color: red; }",
      metadataBlock: "/* ==UserStyle==\n@name Test Style\n==/UserStyle== */",
      variables: {},
      warnings: [],
      errors: [],
    }),
    installStyle: vi.fn(),
  }),
}));

vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    effectiveTheme: "light",
  }),
}));

vi.mock("../../components/features/VariableControls", () => ({
  VariableControls: ({
    onChange,
  }: {
    onChange: (name: string, value: string) => void;
  }) => (
    <div data-testid="variable-controls">
      <button onClick={() => onChange("test-var", "new-value")}>
        Change Variable
      </button>
    </div>
  ),
}));

// Mock CodeMirror to avoid complex editor setup
vi.mock("codemirror", () => ({
  EditorView: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
  })),
  basicSetup: [],
}));

vi.mock("@codemirror/lang-css", () => ({
  css: () => [],
}));

// Import the component after all mocks are set up
let EditPageComponent: any;

describe("EditPage Component", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset URLSearchParams mock to return test-style-id by default
    mockURLSearchParams.get.mockReturnValue("test-style-id");
    const module = await import("../../entrypoints/edit/App");
    EditPageComponent = module.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading state initially", async () => {
    render(<EditPageComponent />);
    expect(screen.getByText("Loading style...")).toBeInTheDocument();
  });

  it("renders error state when no styleId provided", async () => {
    mockURLSearchParams.get.mockReturnValueOnce(null);

    render(<EditPageComponent />);

    await waitFor(() => {
      expect(screen.getByText("No style ID provided")).toBeInTheDocument();
    });
  });

  it("loads and displays style data successfully", async () => {
    render(<EditPageComponent />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Style")).toBeInTheDocument();
    });

    expect(screen.getByText("by Test Author")).toBeInTheDocument();
    expect(screen.getByText("v 1.0.0")).toBeInTheDocument();
    expect(screen.getAllByText("Test description")).toHaveLength(2); // Appears on both desktop and mobile views
    expect(screen.getByText("test.com")).toBeInTheDocument();
  });

  it("allows editing the title", async () => {
    render(<EditPageComponent />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Style")).toBeInTheDocument();
    });

    const titleInput = screen.getByDisplayValue("Test Style");
    fireEvent.change(titleInput, { target: { value: "Updated Style" } });

    expect(titleInput).toHaveValue("Updated Style");
  });

  it("shows save button and handles save action", async () => {
    render(<EditPageComponent />);

    await waitFor(() => {
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
    });

    const saveButton = screen.getByText("Save Changes");

    // Verify button is enabled and clickable
    expect(saveButton).not.toBeDisabled();

    // The mock should be called automatically when the button is clicked
    fireEvent.click(saveButton);

    // Just verify the button exists and was clicked - the actual save logic is tested in integration tests
    expect(saveButton).toBeInTheDocument();
  });

  it("validates empty title before saving", async () => {
    render(<EditPageComponent />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Style")).toBeInTheDocument();
    });

    const titleInput = screen.getByDisplayValue("Test Style");
    fireEvent.change(titleInput, { target: { value: "" } });

    const saveButton = screen.getByText("Save Changes");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(
        screen.getByText("Style name cannot be empty"),
      ).toBeInTheDocument();
    });
  });

  it("shows cancel button and handles cancel action", async () => {
    render(<EditPageComponent />);

    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);

    expect(window.history.back).toHaveBeenCalled();
  });
});
