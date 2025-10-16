/**
 * Variable Service Reset Functionality Tests
 *
 * Tests for the resetVariables method to ensure it properly restores
 * original install-time defaults instead of current defaults.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageBus } from "../../../services/messaging/bus";
import { storageClient } from "../../../services/storage/client";
import type { UserCSSStyle } from "../../../services/storage/schema";
import { createUserCSSStyle } from "../../../services/storage/schema";
import type { VariableDescriptor } from "../../../services/usercss/types";
import { variablePersistenceService } from "../../../services/usercss/variable-service";

// Mock browser APIs
const mockBrowser = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
};

// Setup global browser mock
Object.defineProperty(global, "browser", {
  writable: true,
  value: mockBrowser,
});

// Mock modules
vi.mock("../../../services/usercss/content-controller", () => ({
  contentController: {
    onVariablesUpdate: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../services/messaging/bus", () => ({
  messageBus: {
    send: vi.fn().mockResolvedValue({ success: true }),
    broadcast: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../services/storage/client", () => ({
  storageClient: {
    getUserCSSStyle: vi.fn(),
    updateUserCSSStyleVariables: vi.fn(),
    addUserCSSStyle: vi.fn(),
    resetAll: vi.fn(),
    watchUserCSSStyles: vi.fn().mockReturnValue(() => {
      /* no-op */
    }),
  },
}));

describe("Variable Service Reset Functionality", () => {
  const mockStyleId = "test-style-123";

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset variable persistence service
    variablePersistenceService.initialize();
  });

  afterEach(() => {
    // Clean up any watchers
    vi.restoreAllMocks();
  });

  describe("Reset to Original Defaults", () => {
    it("should reset variables to original install-time defaults", async () => {
      // Setup: Create a style with original defaults that differ from current defaults
      const originalDefaults = {
        "--accent-color": "#ff0000", // Original default
        "--font-size": "14", // Original default
        "--theme": "dark", // Original default
      };

      const currentVariables: Record<string, VariableDescriptor> = {
        "--accent-color": {
          name: "--accent-color",
          type: "color",
          default: "#00ff00", // Current default (different from original)
          value: "#ff4500", // Current user value
        },
        "--font-size": {
          name: "--font-size",
          type: "number",
          default: "16", // Current default (different from original)
          value: "18", // Current user value
        },
        "--theme": {
          name: "--theme",
          type: "select",
          default: "light", // Current default (different from original)
          value: "auto", // Current user value
          options: [
            { value: "light", label: "light" },
            { value: "dark", label: "dark" },
            { value: "auto", label: "auto" },
          ],
        },
      };

      const mockStyle: UserCSSStyle = {
        id: mockStyleId,
        name: "Test Style",
        namespace: "test",
        version: "1.0.0",
        description: "Test style for reset functionality",
        author: "Test Author",
        sourceUrl: "https://example.com/test.user.css",
        domains: [{ kind: "domain", pattern: "example.com", include: true }],
        compiledCss:
          "body { color: var(--accent-color); font-size: var(--font-size); }",
        variables: currentVariables,
        originalDefaults,
        assets: [],
        installedAt: Date.now(),
        enabled: true,
        source: "/* Test UserCSS */",
      };

      // Setup: Mock storage methods
      vi.mocked(storageClient.getUserCSSStyle).mockResolvedValue(mockStyle);
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue({
        ...mockStyle,
        variables: {
          "--accent-color": {
            ...currentVariables["--accent-color"],
            value: originalDefaults["--accent-color"],
          },
          "--font-size": {
            ...currentVariables["--font-size"],
            value: originalDefaults["--font-size"],
          },
          "--theme": {
            ...currentVariables["--theme"],
            value: originalDefaults["--theme"],
          },
        },
      });

      // Action: Reset variables
      await variablePersistenceService.resetVariables(mockStyleId);

      // Verify: updateUserCSSStyleVariables was called with original defaults
      expect(storageClient.updateUserCSSStyleVariables).toHaveBeenCalledWith(
        mockStyleId,
        originalDefaults,
      );

      // Verify: Broadcast message was sent with original defaults
      expect(messageBus.broadcast).toHaveBeenCalledWith({
        type: "VARIABLES_UPDATED",
        payload: {
          styleId: mockStyleId,
          variables: originalDefaults,
          timestamp: expect.any(Number),
        },
      });
    });

    it("should fall back to current defaults when originalDefaults is empty", async () => {
      // Setup: Create a style with empty originalDefaults
      const currentVariables: Record<string, VariableDescriptor> = {
        "--accent-color": {
          name: "--accent-color",
          type: "color",
          default: "#00ff00",
          value: "#ff4500",
        },
      };

      const mockStyle: UserCSSStyle = {
        id: mockStyleId,
        name: "Test Style",
        namespace: "test",
        version: "1.0.0",
        description: "Test style with empty originalDefaults",
        author: "Test Author",
        sourceUrl: "https://example.com/test.user.css",
        domains: [{ kind: "domain", pattern: "example.com", include: true }],
        compiledCss: "body { color: var(--accent-color); }",
        variables: currentVariables,
        originalDefaults: {}, // Empty originalDefaults
        assets: [],
        installedAt: Date.now(),
        enabled: true,
        source: "/* Test UserCSS */",
      };

      // Setup: Mock storage methods
      vi.mocked(storageClient.getUserCSSStyle).mockResolvedValue(mockStyle);
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue({
        ...mockStyle,
        variables: {
          "--accent-color": {
            ...currentVariables["--accent-color"],
            value: currentVariables["--accent-color"].default,
          },
        },
      });

      // Action: Reset variables
      await variablePersistenceService.resetVariables(mockStyleId);

      // Verify: updateUserCSSStyleVariables was called with current defaults
      expect(storageClient.updateUserCSSStyleVariables).toHaveBeenCalledWith(
        mockStyleId,
        { "--accent-color": "#00ff00" }, // Current default, not original
      );
    });

    it("should handle partial originalDefaults (some variables have originals, others don't)", async () => {
      // Setup: Create a style with partial originalDefaults
      const originalDefaults = {
        "--accent-color": "#ff0000", // Has original
        // '--font-size' is missing from originalDefaults
      };

      const currentVariables: Record<string, VariableDescriptor> = {
        "--accent-color": {
          name: "--accent-color",
          type: "color",
          default: "#00ff00",
          value: "#ff4500",
        },
        "--font-size": {
          name: "--font-size",
          type: "number",
          default: "16",
          value: "18",
        },
      };

      const mockStyle: UserCSSStyle = {
        id: mockStyleId,
        name: "Test Style",
        namespace: "test",
        version: "1.0.0",
        description: "Test style with partial originalDefaults",
        author: "Test Author",
        sourceUrl: "https://example.com/test.user.css",
        domains: [{ kind: "domain", pattern: "example.com", include: true }],
        compiledCss:
          "body { color: var(--accent-color); font-size: var(--font-size); }",
        variables: currentVariables,
        originalDefaults,
        assets: [],
        installedAt: Date.now(),
        enabled: true,
        source: "/* Test UserCSS */",
      };

      // Setup: Mock storage methods
      vi.mocked(storageClient.getUserCSSStyle).mockResolvedValue(mockStyle);
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue({
        ...mockStyle,
        variables: {
          "--accent-color": {
            ...currentVariables["--accent-color"],
            value: originalDefaults["--accent-color"],
          },
          "--font-size": {
            ...currentVariables["--font-size"],
            value: currentVariables["--font-size"].default, // Falls back to current default
          },
        },
      });

      // Action: Reset variables
      await variablePersistenceService.resetVariables(mockStyleId);

      // Verify: updateUserCSSStyleVariables was called with mixed defaults
      expect(storageClient.updateUserCSSStyleVariables).toHaveBeenCalledWith(
        mockStyleId,
        {
          "--accent-color": "#ff0000", // Original default
          "--font-size": "16", // Current default (fallback)
        },
      );
    });

    it("should handle style not found error", async () => {
      // Setup: Mock storage to return null (style not found)
      vi.mocked(storageClient.getUserCSSStyle).mockResolvedValue(null);

      // Action & Verify: Reset should throw error
      await expect(
        variablePersistenceService.resetVariables(mockStyleId),
      ).rejects.toThrow(`Style with ID ${mockStyleId} not found`);

      // Verify: No storage updates or broadcasts should occur
      expect(storageClient.updateUserCSSStyleVariables).not.toHaveBeenCalled();
      expect(messageBus.broadcast).not.toHaveBeenCalled();
    });

    it("should handle storage errors gracefully", async () => {
      // Setup: Mock storage to throw error
      vi.mocked(storageClient.getUserCSSStyle).mockRejectedValue(
        new Error("Storage connection failed"),
      );

      // Action & Verify: Reset should throw error with proper message
      await expect(
        variablePersistenceService.resetVariables(mockStyleId),
      ).rejects.toThrow(
        "Failed to reset variables: Error: Storage connection failed",
      );

      // Verify: No broadcasts should occur
      expect(messageBus.broadcast).not.toHaveBeenCalled();
    });

    it("should trigger variable change watchers on reset", async () => {
      // Setup: Create a style and mock storage
      const originalDefaults = { "--accent-color": "#ff0000" };
      const currentVariables: Record<string, VariableDescriptor> = {
        "--accent-color": {
          name: "--accent-color",
          type: "color",
          default: "#00ff00",
          value: "#ff4500",
        },
      };

      const mockStyle: UserCSSStyle = {
        id: mockStyleId,
        name: "Test Style",
        namespace: "test",
        version: "1.0.0",
        description: "Test style for watcher functionality",
        author: "Test Author",
        sourceUrl: "https://example.com/test.user.css",
        domains: [{ kind: "domain", pattern: "example.com", include: true }],
        compiledCss: "body { color: var(--accent-color); }",
        variables: currentVariables,
        originalDefaults,
        assets: [],
        installedAt: Date.now(),
        enabled: true,
        source: "/* Test UserCSS */",
      };

      vi.mocked(storageClient.getUserCSSStyle).mockResolvedValue(mockStyle);
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue({
        ...mockStyle,
        variables: {
          "--accent-color": {
            ...currentVariables["--accent-color"],
            value: originalDefaults["--accent-color"],
          },
        },
      });

      // Setup: Watch for variable changes
      const watcherCallback = vi.fn();
      const unsubscribe =
        variablePersistenceService.watchVariableChanges(watcherCallback);

      // Action: Reset variables
      await variablePersistenceService.resetVariables(mockStyleId);

      // Verify: Watcher callback was called with reset values
      expect(watcherCallback).toHaveBeenCalledWith({
        styleId: mockStyleId,
        variables: originalDefaults,
      });

      // Cleanup
      unsubscribe();
    });
  });

  describe("Original Defaults Capture", () => {
    it("should capture original defaults during style creation", () => {
      // This test verifies that the createUserCSSStyle function properly captures original defaults
      const variables: Record<string, VariableDescriptor> = {
        "--color": {
          name: "--color",
          type: "color",
          default: "#ff0000",
          value: "#ff0000",
        },
        "--size": {
          name: "--size",
          type: "number",
          default: "16",
          value: "16",
          min: 12,
          max: 24,
        },
      };

      const style = {
        name: "Test Style",
        source: "/* Test CSS */",
        variables,
      };

      // Test the createUserCSSStyle function
      const createdStyle = createUserCSSStyle(style);

      // Verify that originalDefaults were captured
      expect(createdStyle.originalDefaults).toEqual({
        "--color": "#ff0000",
        "--size": "16",
      });

      // Verify that variables are preserved
      expect(createdStyle.variables).toBe(variables);
    });

    it("should use provided originalDefaults if available", () => {
      const variables: Record<string, VariableDescriptor> = {
        "--color": {
          name: "--color",
          type: "color",
          default: "#ff0000",
          value: "#ff0000",
        },
      };

      const customOriginalDefaults = {
        "--color": "#0000ff", // Different from current default
      };

      const style = {
        name: "Test Style",
        source: "/* Test CSS */",
        variables,
        originalDefaults: customOriginalDefaults,
      };

      // Test the createUserCSSStyle function
      const createdStyle = createUserCSSStyle(style);

      // Verify that provided originalDefaults were used
      expect(createdStyle.originalDefaults).toEqual(customOriginalDefaults);
    });
  });
});
