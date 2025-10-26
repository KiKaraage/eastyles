import { beforeEach, describe, expect, it, vi } from "vitest";

// Create a mock function that can be hoisted
const mockI18nT = vi.hoisted(() => vi.fn());

// Mock the @wxt-dev/i18n module BEFORE importing I18nService
vi.mock("@wxt-dev/i18n", () => ({
  createI18n: vi.fn(() => ({
    t: mockI18nT,
  })),
}));

// Now import the service after mocking
import { I18nService } from "@services/i18n/service";

describe("I18nService", () => {
  let i18nService: I18nService;
  let mockGetMessage: ReturnType<typeof vi.fn>;
  let mockGetUILanguage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Get the existing mocks from global.browser set up in setup.ts
    mockGetUILanguage = vi.mocked(browser.i18n.getUILanguage);
    mockGetMessage = vi.mocked(browser.i18n.getMessage);

    // Reset mock implementations
    mockGetUILanguage.mockReturnValue("en");
    mockGetMessage.mockImplementation(
      (key: string, _substitutions?: string | string[]) => {
        const messages: Record<string, string> = {
          saveButton: "Save Style",
          cancelButton: "Cancel",
          appName: "Eastyles",
          styleInstalled: "Style installed successfully",
        };

        return messages[key] || key; // Return key when translation is missing
      },
    );

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

    i18nService = new I18nService();
    i18nService.clearCache();
    vi.clearAllMocks();
  });

  describe("getCurrentLocale", () => {
    it("should return the UI language", () => {
      mockGetUILanguage.mockReturnValue("id");
      expect(i18nService.getCurrentLocale()).toBe("id");
    });

    it("should fallback to default locale when getUILanguage fails", () => {
      mockGetUILanguage.mockImplementation(() => {
        throw new Error("API not available");
      });
      expect(i18nService.getCurrentLocale()).toBe("en");
    });
  });

  describe("t (translate)", () => {
    it("should return translated message for existing key", () => {
      const result = i18nService.t("saveButton");
      expect(result).toBe("Save Style");
      expect(mockI18nT).toHaveBeenCalledWith("saveButton");
    });

    it("should return key when translation is missing", () => {
      // The mockI18nT is already set up to return empty string for missing keys
      // via mockGetMessage, so we expect the service to return the key as fallback
      const result = i18nService.t("nonexistentKey");
      expect(result).toBe("nonexistentKey");
      expect(mockI18nT).toHaveBeenCalledWith("nonexistentKey");
    });

    it("should handle substitutions", () => {
      mockGetMessage.mockReturnValue("Hello $1!");
      mockI18nT.mockReturnValue("Hello World!");

      const result = i18nService.t("greeting", ["World"]);
      expect(result).toBe("Hello World!");
      expect(mockI18nT).toHaveBeenCalledWith("greeting", ["World"]);
    });

    it("should cache translations", () => {
      mockGetUILanguage.mockReturnValue("en");

      i18nService.t("saveButton");
      i18nService.t("saveButton"); // Should use cache

      expect(mockI18nT).toHaveBeenCalledTimes(1);
    });

    it("should clear cache when requested", () => {
      mockGetUILanguage.mockReturnValue("en");

      i18nService.t("saveButton");
      i18nService.clearCache();
      i18nService.t("saveButton");

      expect(mockI18nT).toHaveBeenCalledTimes(2);
    });
  });

  describe("hasMessage", () => {
    it("should return true for existing messages", () => {
      mockI18nT.mockReturnValue("Save Style");
      expect(i18nService.hasMessage("saveButton")).toBe(true);
    });

    it("should return false for missing messages", () => {
      // Since mockI18nT is already set up to return empty string for missing keys
      // through mockGetMessage, we don't need to set it again here
      expect(i18nService.hasMessage("nonexistentKey")).toBe(false);
    });
  });

  describe("getAvailableLocales", () => {
    it("should return list of available locales", () => {
      const locales = i18nService.getAvailableLocales();
      expect(locales).toEqual(["en", "id"]);
    });
  });
});
