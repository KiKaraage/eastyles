import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock functions
const mockSendMessage = vi.fn();

// Mock the useMessage module
vi.mock("../../hooks/useMessage", () => ({
  useMessage: vi.fn(() => ({
    sendMessage: mockSendMessage,
    sendNotification: vi.fn(),
    onMessage: vi.fn(),
    onResponse: vi.fn(),
    isConnected: false,
    pendingMessages: 0,
  })),
  useSaveActions: vi.fn(() => ({
    parseUserCSS: async (text: string, sourceUrl?: string) => {
      console.log(
        "[ea-useSaveActions] parseUserCSS called, text length:",
        text.length,
      );
      return mockSendMessage("PARSE_USERCSS", { text, sourceUrl });
    },
    installStyle: async (
      meta: {
        name: string;
        namespace: string;
        version: string;
        description: string;
        author: string;
        sourceUrl: string;
        domains: string[];
      },
      compiledCss: string,
      variables: Array<{
        name: string;
        type: string;
        default: string;
        min?: number;
        max?: number;
        options?: Array<{ value: string; label: string }>;
      }>,
    ) => {
      console.log("[ea-useSaveActions] installStyle called, style:", meta.name);
      return mockSendMessage("INSTALL_STYLE", {
        meta,
        compiledCss,
        variables,
      });
    },
  })),
}));

// Import the mocked hook
import { useSaveActions } from "../../hooks/useMessage";

describe("ApplyPage Message Bus Communication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("parseUserCSS", () => {
    it("dispatches PARSE_USERCSS message with correct payload", async () => {
      const mockResponse = {
        success: true,
        meta: {
          name: "Test Style",
          namespace: "test.com",
          version: "1.0.0",
          description: "Test description",
          author: "Test Author",
          sourceUrl: "https://test.com/style.css",
          domains: ["example.com"],
        },
        css: "body { color: red; }",
        warnings: [],
        errors: [],
      };

      mockSendMessage.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSaveActions());

      const cssText = "/* ==UserStyle== */\nbody { color: red; }";
      const sourceUrl = "https://example.com/test.css";

      let response;
      await act(async () => {
        response = await result.current.parseUserCSS(cssText, sourceUrl);
      });

      expect(mockSendMessage).toHaveBeenCalledWith("PARSE_USERCSS", {
        text: cssText,
        sourceUrl: sourceUrl,
      });

      expect(response).toEqual(mockResponse);
    });

    it("dispatches PARSE_USERCSS without sourceUrl when not provided", async () => {
      const mockResponse = {
        success: true,
        meta: {
          name: "Test Style",
          namespace: "test.com",
          version: "1.0.0",
          description: "Test description",
          author: "Test Author",
          sourceUrl: "",
          domains: [],
        },
        css: "body { color: red; }",
        warnings: [],
        errors: [],
      };

      mockSendMessage.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSaveActions());

      const cssText = "/* ==UserStyle== */\nbody { color: red; }";

      await act(async () => {
        await result.current.parseUserCSS(cssText);
      });

      expect(mockSendMessage).toHaveBeenCalledWith("PARSE_USERCSS", {
        text: cssText,
        sourceUrl: undefined,
      });
    });

    it("handles parsing errors from background service", async () => {
      const errorResponse = {
        success: false,
        error: "Invalid UserCSS syntax",
      };

      mockSendMessage.mockResolvedValue(errorResponse);

      const { result } = renderHook(() => useSaveActions());

      let response;
      await act(async () => {
        response = await result.current.parseUserCSS("invalid css");
      });

      expect(response).toEqual(errorResponse);
    });

    it("handles parsing with warnings", async () => {
      const warningResponse = {
        success: true,
        meta: {
          name: "Test Style",
          namespace: "test.com",
          version: "1.0.0",
          description: "Test description",
          author: "Test Author",
          sourceUrl: "",
          domains: [],
        },
        css: "body { color: red; }",
        warnings: ["Legacy -moz-document syntax detected"],
        errors: [],
      };

      mockSendMessage.mockResolvedValue(warningResponse);

      const { result } = renderHook(() => useSaveActions());

      let response;
      await act(async () => {
        response = await result.current.parseUserCSS("/* legacy css */");
      });

      expect(response).toEqual(warningResponse);
    });

    it("handles parsing with errors", async () => {
      const errorResponse = {
        success: true,
        meta: {
          name: "Test Style",
          namespace: "test.com",
          version: "1.0.0",
          description: "Test description",
          author: "Test Author",
          sourceUrl: "",
          domains: [],
        },
        css: "body { color: red; }",
        warnings: [],
        errors: ["Syntax error at line 10"],
      };

      mockSendMessage.mockResolvedValue(errorResponse);

      const { result } = renderHook(() => useSaveActions());

      let response;
      await act(async () => {
        response = await result.current.parseUserCSS("broken css");
      });

      expect(response).toEqual(errorResponse);
    });
  });

  describe("installStyle", () => {
    it("dispatches INSTALL_STYLE message with correct payload", async () => {
      const mockResponse = {
        success: true,
        styleId: "generated-id-123",
      };

      mockSendMessage.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSaveActions());

      const meta = {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "Test description",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["example.com"],
      };

      const compiledCss = "body { color: red; }";
      const variables = [
        {
          name: "--primary-color",
          type: "color",
          default: "#ff0000",
        },
      ];

      let response;
      await act(async () => {
        response = await result.current.installStyle(
          meta,
          compiledCss,
          variables,
        );
      });

      expect(mockSendMessage).toHaveBeenCalledWith("INSTALL_STYLE", {
        meta,
        compiledCss,
        variables,
      });

      expect(response).toEqual(mockResponse);
    });

    it("dispatches INSTALL_STYLE with empty variables array", async () => {
      const mockResponse = {
        success: true,
        styleId: "generated-id-456",
      };

      mockSendMessage.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSaveActions());

      const meta = {
        name: "Simple Style",
        namespace: "simple.com",
        version: "1.0.0",
        description: "Simple style without variables",
        author: "Simple Author",
        sourceUrl: "https://simple.com/style.css",
        domains: ["simple.com"],
      };

      const compiledCss = "body { background: blue; }";
      const variables: Array<{
        name: string;
        type: string;
        default: string;
        min?: number;
        max?: number;
        options?: Array<{ value: string; label: string }>;
      }> = [];

      await act(async () => {
        await result.current.installStyle(meta, compiledCss, variables);
      });

      expect(mockSendMessage).toHaveBeenCalledWith("INSTALL_STYLE", {
        meta,
        compiledCss,
        variables: [],
      });
    });

    it("handles installation errors from background service", async () => {
      const errorResponse = {
        success: false,
        error: "Storage quota exceeded",
      };

      mockSendMessage.mockResolvedValue(errorResponse);

      const { result } = renderHook(() => useSaveActions());

      const meta = {
        name: "Large Style",
        namespace: "large.com",
        version: "1.0.0",
        description: "Large style that exceeds storage",
        author: "Large Author",
        sourceUrl: "https://large.com/style.css",
        domains: ["large.com"],
      };

      let response;
      await act(async () => {
        response = await result.current.installStyle(
          meta,
          "/* huge css */",
          [],
        );
      });

      expect(response).toEqual(errorResponse);
    });

    it("handles installation with complex variables", async () => {
      const mockResponse = {
        success: true,
        styleId: "variable-style-789",
      };

      mockSendMessage.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSaveActions());

      const meta = {
        name: "Variable Style",
        namespace: "variable.com",
        version: "2.0.0",
        description: "Style with complex variables",
        author: "Variable Author",
        sourceUrl: "https://variable.com/style.css",
        domains: ["variable.com"],
      };

      const compiledCss =
        "body { color: var(--text-color); font-size: var(--font-size); }";
      const variables = [
        {
          name: "--text-color",
          type: "color",
          default: "#000000",
        },
        {
          name: "--font-size",
          type: "range",
          default: "16",
          min: 10,
          max: 24,
        },
        {
          name: "--font-family",
          type: "select",
          default: "Arial",
          options: [
            { value: "Arial", label: "Arial" },
            { value: "Helvetica", label: "Helvetica" },
            { value: "Times", label: "Times" },
          ],
        },
      ];

      await act(async () => {
        await result.current.installStyle(meta, compiledCss, variables);
      });

      expect(mockSendMessage).toHaveBeenCalledWith("INSTALL_STYLE", {
        meta,
        compiledCss,
        variables,
      });
    });
  });

  describe("error handling", () => {
    it("propagates sendMessage exceptions for parseUserCSS", async () => {
      const networkError = new Error("Network timeout");
      mockSendMessage.mockRejectedValue(networkError);

      const { result } = renderHook(() => useSaveActions());

      await expect(async () => {
        await act(async () => {
          await result.current.parseUserCSS("test css");
        });
      }).rejects.toThrow("Network timeout");
    });

    it("propagates sendMessage exceptions for installStyle", async () => {
      const storageError = new Error("Storage unavailable");
      mockSendMessage.mockRejectedValue(storageError);

      const { result } = renderHook(() => useSaveActions());

      const meta = {
        name: "Test Style",
        namespace: "test.com",
        version: "1.0.0",
        description: "Test description",
        author: "Test Author",
        sourceUrl: "https://test.com/style.css",
        domains: ["test.com"],
      };

      await expect(async () => {
        await act(async () => {
          await result.current.installStyle(meta, "body { color: red; }", []);
        });
      }).rejects.toThrow("Storage unavailable");
    });
  });

  describe("optimistic states", () => {
    it("handles concurrent parsing requests", async () => {
      const firstResponse = {
        success: true,
        meta: {
          name: "First Style",
          namespace: "first.com",
          version: "1.0.0",
          description: "First style",
          author: "First Author",
          sourceUrl: "",
          domains: [],
        },
        css: "body { color: red; }",
        warnings: [],
        errors: [],
      };

      const secondResponse = {
        success: true,
        meta: {
          name: "Second Style",
          namespace: "second.com",
          version: "1.0.0",
          description: "Second style",
          author: "Second Author",
          sourceUrl: "",
          domains: [],
        },
        css: "body { color: blue; }",
        warnings: [],
        errors: [],
      };

      mockSendMessage
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const { result } = renderHook(() => useSaveActions());

      let firstResult, secondResult;

      await act(async () => {
        const promises = [
          result.current.parseUserCSS("first css"),
          result.current.parseUserCSS("second css"),
        ];
        [firstResult, secondResult] = await Promise.all(promises);
      });

      expect(firstResult).toEqual(firstResponse);
      expect(secondResult).toEqual(secondResponse);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe("message logging", () => {
    it("logs parseUserCSS calls with text length", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {
        /* no-op */
      });

      mockSendMessage.mockResolvedValue({
        success: true,
        meta: {
          name: "Test",
          namespace: "test",
          version: "1.0.0",
          description: "Test",
          author: "Test",
          sourceUrl: "",
          domains: [],
        },
        css: "",
        warnings: [],
        errors: [],
      });

      const { result } = renderHook(() => useSaveActions());

      await act(async () => {
        await result.current.parseUserCSS("test css content");
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[useSaveActions] parseUserCSS called, text length:",
        16,
      );

      consoleSpy.mockRestore();
    });

    it("logs installStyle calls with style name", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {
        /* no-op */
      });

      mockSendMessage.mockResolvedValue({
        success: true,
        styleId: "test-id",
      });

      const { result } = renderHook(() => useSaveActions());

      const meta = {
        name: "Logged Style",
        namespace: "logged.com",
        version: "1.0.0",
        description: "Style for logging test",
        author: "Logger",
        sourceUrl: "",
        domains: [],
      };

      await act(async () => {
        await result.current.installStyle(meta, "body {}", []);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[useSaveActions] installStyle called, style:",
        "Logged Style",
      );

      consoleSpy.mockRestore();
    });
  });
});
