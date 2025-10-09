/**
 * FontSelector Component Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FontSelector } from "../../../components/features/FontSelector";
import { fontRegistry } from "../../../services/usercss/font-registry";

// Mock the hooks
vi.mock("../../../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key, // Simple mock that returns the key
  }),
}));

vi.mock("../../../hooks/useMessage", () => ({
  useMessage: () => ({
    sendMessage: vi.fn(),
  }),
}));

// Mock font registry
vi.mock("../../../services/usercss/font-registry", () => ({
  fontRegistry: {
    getBuiltInFonts: vi.fn(),
    getBuiltInFontsByCategory: vi.fn(),
    getFontCategories: vi.fn(),
    getSampleText: vi.fn(),
    checkFontAvailability: vi.fn(),
    addCustomFont: vi.fn(),
    generateFontUserCSS: vi.fn(),
  },
}));

// Helper functions for assertions
const hasAttribute = (element: Element | null, attr: string): boolean =>
  element?.hasAttribute(attr) ?? false;

describe("FontSelector", () => {
  const mockProps = {
    onFontApplied: vi.fn(),
    onClose: vi.fn(),
  };

  const mockBuiltInFonts = [
    {
      name: "Instrument Sans",
      file: "Instrument Sans.woff2",
      category: "sans" as const,
      weight: "400",
      style: "normal" as const,
      description: "Clean, modern sans-serif font",
    },
    {
      name: "JetBrains Mono",
      file: "JetBrains Mono.woff2",
      category: "techno" as const,
      weight: "400",
      style: "normal" as const,
      description: "Popular coding font",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(fontRegistry.getBuiltInFonts).mockReturnValue(mockBuiltInFonts);
    vi.mocked(fontRegistry.getBuiltInFontsByCategory).mockImplementation(
      (category) =>
        mockBuiltInFonts.filter((font) => font.category === category),
    );
    vi.mocked(fontRegistry.getFontCategories).mockReturnValue([
      "sans",
      "techno",
    ]);
    vi.mocked(fontRegistry.getSampleText).mockReturnValue("Aa");
    vi.mocked(fontRegistry.checkFontAvailability).mockResolvedValue(true);
    vi.mocked(fontRegistry.addCustomFont).mockResolvedValue({
      name: "Arial",
      isAvailable: true,
      sampleText: "Arial",
    });
    vi.mocked(fontRegistry.generateFontUserCSS).mockReturnValue(
      "/* Generated UserCSS */",
    );
  });

  it("should render font selector with built-in fonts tab active by default", () => {
    render(<FontSelector {...mockProps} />);

    expect(
      screen.getByRole("heading", { name: "font_selector_title" }),
    ).toBeTruthy();
    expect(screen.getByText("font_tabs_builtin")).toBeTruthy();
    expect(screen.getByText("font_tabs_custom")).toBeTruthy();
    expect(screen.getByText("font_builtin_description")).toBeTruthy();
  });

  it("should display built-in fonts in categorized grid", () => {
    render(<FontSelector {...mockProps} />);

    expect(screen.getByText("Instrument Sans")).toBeTruthy();
    expect(screen.getByText("JetBrains Mono")).toBeTruthy();
  });

  it("should show font samples", () => {
    render(<FontSelector {...mockProps} />);

    const fontSamples = screen.getAllByText("Aa");
    expect(fontSamples.length).toBeGreaterThan(0);
  });

  it("should allow selecting built-in fonts", () => {
    render(<FontSelector {...mockProps} />);

    const sansSample = screen
      .getByText("Instrument Sans")
      .closest(".font-sample");
    if (sansSample) fireEvent.click(sansSample);

    expect(sansSample).toBeTruthy();
  });

  it("should switch between built-in and custom font tabs", () => {
    render(<FontSelector {...mockProps} />);

    // Initially on built-in tab
    expect(screen.getByText("font_builtin_description")).toBeTruthy();

    // Switch to custom tab
    fireEvent.click(screen.getByText("font_tabs_custom"));
    expect(screen.getByText("font_custom_description")).toBeTruthy();

    // Switch back to built-in tab
    fireEvent.click(screen.getByText("font_tabs_builtin"));
    expect(screen.getByText("font_builtin_description")).toBeTruthy();
  });

  it("should handle custom font input and validation", async () => {
    render(<FontSelector {...mockProps} />);

    // Switch to custom tab
    fireEvent.click(screen.getByText("font_tabs_custom"));

    const input = screen.getByPlaceholderText("font_custom_placeholder");
    const checkButton = screen.getByText("font_custom_checkButton");

    // Test empty input validation - button should remain disabled
    fireEvent.click(checkButton);
    expect(hasAttribute(checkButton, "disabled")).toBe(true);

    // Test valid input - button should become enabled
    fireEvent.change(input, { target: { value: "Arial" } });
    expect(hasAttribute(checkButton, "disabled")).toBe(false);

    // Test clicking check button with valid input
    fireEvent.click(checkButton);

    await waitFor(() => {
      expect(fontRegistry.addCustomFont).toHaveBeenCalledWith("Arial");
    });
  });

  it("should show custom font preview when available", async () => {
    vi.mocked(fontRegistry.addCustomFont).mockResolvedValue({
      name: "Arial",
      isAvailable: true,
      sampleText: "Arial",
    });

    render(<FontSelector {...mockProps} />);

    // Switch to custom tab and check font
    fireEvent.click(screen.getByText("font_tabs_custom"));
    fireEvent.change(screen.getByPlaceholderText("font_custom_placeholder"), {
      target: { value: "Arial" },
    });
    fireEvent.click(screen.getByText("font_custom_checkButton"));

    await waitFor(() => {
      // Look for the preview section by class name instead of text
      const previewSection = document.querySelector(".font-preview");
      expect(previewSection).toBeTruthy();

      // Check that Arial text is rendered
      expect(screen.getByText("Arial")).toBeTruthy();
    });
  });

  it("should show error for unavailable custom font", async () => {
    vi.mocked(fontRegistry.addCustomFont).mockResolvedValue({
      name: "NonExistentFont",
      isAvailable: false,
      sampleText: undefined,
    });

    render(<FontSelector {...mockProps} />);

    // Switch to custom tab and check font
    fireEvent.click(screen.getByText("font_tabs_custom"));
    fireEvent.change(screen.getByPlaceholderText("font_custom_placeholder"), {
      target: { value: "NonExistentFont" },
    });
    fireEvent.click(screen.getByText("font_custom_checkButton"));

    await waitFor(() => {
      expect(screen.getByText("font_custom_notAvailable")).toBeTruthy();
    });
  });

  it("should handle font check errors gracefully", async () => {
    vi.mocked(fontRegistry.addCustomFont).mockRejectedValue(
      new Error("Network error"),
    );

    render(<FontSelector {...mockProps} />);

    // Switch to custom tab and check font
    fireEvent.click(screen.getByText("font_tabs_custom"));
    fireEvent.change(screen.getByPlaceholderText("font_custom_placeholder"), {
      target: { value: "Arial" },
    });
    fireEvent.click(screen.getByText("font_custom_checkButton"));

    await waitFor(() => {
      expect(screen.getByText("font_error_checkFailed")).toBeTruthy();
    });
  });

  it("should call onClose when cancel button is clicked", () => {
    render(<FontSelector {...mockProps} />);

    fireEvent.click(screen.getByText("common.cancel"));
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it("should call onClose when close button is clicked", () => {
    render(<FontSelector {...mockProps} />);

    const closeButton = screen.getByLabelText("common.close");
    fireEvent.click(closeButton);
    expect(mockProps.onClose).toHaveBeenCalled();
  });
});
