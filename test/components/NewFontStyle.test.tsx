/**
 * NewFontStyle Component Tests
 *
 * Tests for the NewFontStyle component that handles font selection and creation.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewFontStyle from "../../../components/features/NewFontStyle";

// Mock font registry
vi.mock("../../../services/usercss/font-registry", () => ({
  fontRegistry: {
    getBuiltInFonts: vi.fn(() => [
      {
        name: "Arial",
        file: "arial.woff2",
        weight: 400,
        style: "normal",
        category: "sans",
      },
      {
        name: "Times New Roman",
        file: "times.woff2",
        weight: 400,
        style: "normal",
        category: "serif",
      },
      {
        name: "Custom Font",
        file: "custom.woff2",
        weight: 400,
        style: "normal",
        category: "custom",
      },
    ]),
  },
}));

// Mock useMessage hook
vi.mock("../../../hooks/useMessage", () => ({
  useMessage: () => ({
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  }),
  PopupMessageType: {
    CREATE_FONT_STYLE: "CREATE_FONT_STYLE",
    UPDATE_FONT_STYLE: "UPDATE_FONT_STYLE",
  },
  SaveMessageType: {
    CREATE_FONT_STYLE: "CREATE_FONT_STYLE",
    UPDATE_FONT_STYLE: "UPDATE_FONT_STYLE",
  },
}));

describe("NewFontStyle", () => {
  const defaultProps = {
    domain: "example.com",
    selectedFont: "",
    onDomainChange: vi.fn(),
    onFontChange: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with domain input and font selection", () => {
    render(<NewFontStyle {...defaultProps} />);

    // Check for the main container with specific class
    expect(
      screen.getByText((_, element) => {
        return element?.className?.includes("space-y-4 pt-2");
      }),
    ).toBeTruthy();

    // Check for domain input by placeholder
    expect(
      screen.getByPlaceholderText(
        "e.g., example.com (leave empty for all sites)",
      ),
    ).toBeTruthy();

    // Check for font category buttons
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Sans")).toBeTruthy();
  });

  it("shows domain input with provided value", () => {
    render(<NewFontStyle {...defaultProps} />);

    const domainInput = screen.getByPlaceholderText(
      "e.g., example.com (leave empty for all sites)",
    ) as HTMLInputElement;
    expect(domainInput.value).toBe("example.com");
  });

  it("calls onDomainChange when domain input changes", () => {
    render(<NewFontStyle {...defaultProps} />);

    const domainInput = screen.getByPlaceholderText(
      "e.g., example.com (leave empty for all sites)",
    );
    fireEvent.change(domainInput, { target: { value: "newdomain.com" } });

    expect(defaultProps.onDomainChange).toHaveBeenCalledWith("newdomain.com");
  });

  it("displays built-in fonts when no category selected", () => {
    render(<NewFontStyle {...defaultProps} />);

    expect(screen.getByTitle("Arial")).toBeTruthy();
    expect(screen.getByTitle("Times New Roman")).toBeTruthy();
    expect(screen.getByTitle("Custom Font")).toBeTruthy();
  });

  it("filters fonts by category when selected", () => {
    render(<NewFontStyle {...defaultProps} />);

    // Click on Sans category
    const sansButton = screen.getByText("Sans");
    fireEvent.click(sansButton);

    // Should show Arial (sans) but not Times New Roman (serif)
    expect(screen.getByTitle("Arial")).toBeTruthy();
    expect(screen.queryByTitle("Times New Roman")).not.toBeTruthy();
  });

  it("calls onFontChange when a font is selected", () => {
    render(<NewFontStyle {...defaultProps} />);

    // Click on Arial font
    const arialButton = screen.getByTitle("Arial");
    fireEvent.click(arialButton);

    expect(defaultProps.onFontChange).toHaveBeenCalledWith("Arial");
  });

  it("shows correct font categories", () => {
    render(<NewFontStyle {...defaultProps} />);

    // Check if all font categories are rendered
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Sans")).toBeTruthy();
    expect(screen.getByText("Serif")).toBeTruthy();
    expect(screen.getByText("Techno")).toBeTruthy();
    expect(screen.getByText("Playful")).toBeTruthy();
    expect(screen.getByText("Custom")).toBeTruthy();
  });
});
