import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "../../hooks/useI18n";

// Create a mock function that can be hoisted
const mockI18nT = vi.hoisted(() => vi.fn());

// Mock the @wxt-dev/i18n module BEFORE importing useI18n
vi.mock("@wxt-dev/i18n", () => ({
  createI18n: vi.fn(() => ({
    t: mockI18nT,
  })),
}));

beforeEach(() => {
  // Get mocks from global.browser and reset implementations
  const mockGetMessage = vi.mocked(browser.i18n.getMessage);
  const mockGetUILanguage = vi.mocked(browser.i18n.getUILanguage);

  mockGetUILanguage.mockReturnValue("en");
  mockGetMessage.mockImplementation((key: string) => {
    const messages: Record<string, string> = {
      appName: "Eastyles",
      loading: "Loading...",
      saveButton: "Save Style",
    };
    return messages[key] || key;
  });

  // Set up the i18n.t mock to return the same as browser.i18n.getMessage
  mockI18nT.mockImplementation(
    (
      key: string,
      substitutions?: string | string[] | number,
      _options?: Record<string, unknown>,
    ) => {
      return mockGetMessage(key, substitutions as string | string[]);
    },
  );
});

// Test component that uses the i18n hook
function TestComponent() {
  const { t, getCurrentLocale } = useI18n();

  return (
    <div>
      <h1>{t("appName")}</h1>
      <p>Locale: {getCurrentLocale()}</p>
      <button>{t("saveButton")}</button>
    </div>
  );
}

describe("useI18n", () => {
  it("should provide translation function", () => {
    render(<TestComponent />);

    expect(screen.getByText("Eastyles")).toBeTruthy();
    expect(screen.getByText("Save Style")).toBeTruthy();
    expect(screen.getByText("Locale: en")).toBeTruthy();
  });

  it("should provide locale information", () => {
    render(<TestComponent />);

    // Should show current locale
    expect(screen.getByText("Locale: en")).toBeTruthy();
  });
});
