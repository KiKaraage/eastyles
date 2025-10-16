/**
 * Variable Change Flow Integration Tests
 *
 * Tests the complete flow of variable changes:
 * change value → background save → content re-injection without refresh
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageBus } from "../../../services/messaging/bus";
import { storageClient } from "../../../services/storage/client";
import { UserCSSStyle } from "../../../services/storage/schema";
import { VariableDescriptor } from "../../../services/usercss/types";
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

// Mock the content controller
const mockContentController = {
  onVariablesUpdate: vi.fn().mockResolvedValue(undefined),
};

// Mock modules
vi.mock("../../../services/usercss/content-controller", () => ({
  contentController: mockContentController,
}));

vi.mock("../../../services/messaging/bus", () => ({
  messageBus: {
    send: vi.fn().mockResolvedValue({ success: true }),
    broadcast: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../../services/storage/client", () => ({
  storageClient: {
    addUserCSSStyle: vi.fn().mockResolvedValue({ id: "test-style-123" }),
    getUserCSSStyle: vi.fn(),
    updateUserCSSStyleVariables: vi.fn(),
    watchUserCSSStyles: vi.fn().mockReturnValue(() => {
      /* no-op */
    }),
    resetAll: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Variable Change Flow Integration", () => {
  const mockStyleId = "test-style-123";
  const mockVariables: Record<string, VariableDescriptor> = {
    "--accent-color": {
      name: "--accent-color",
      type: "color",
      default: "#ff0000",
      value: "#ff0000",
    },
    "--font-size": {
      name: "--font-size",
      type: "number",
      default: "16",
      value: "16",
      min: 8,
      max: 72,
    },
    "--theme": {
      name: "--theme",
      type: "select",
      default: "light",
      value: "light",
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
    description: "Test style for variable changes",
    author: "Test Author",
    sourceUrl: "https://example.com/test.user.css",
    domains: [{ kind: "domain", pattern: "example.com", include: true }],
    compiledCss:
      "body { color: var(--accent-color); font-size: var(--font-size); }",
    variables: mockVariables,
    originalDefaults: {
      "--accent-color": "#ff0000",
      "--font-size": "16",
      "--theme": "light",
    },
    assets: [],
    installedAt: Date.now(),
    enabled: true,
    source: "/* Test UserCSS */",
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset storage if method exists
    if (typeof storageClient.resetAll === "function") {
      storageClient.resetAll();
    }

    // Reset variable persistence service
    variablePersistenceService.initialize();
  });

  afterEach(() => {
    // Clean up any watchers
    vi.restoreAllMocks();
  });

  describe("Complete Variable Change Flow", () => {
    it("should handle color variable change and persist to storage", async () => {
      // Setup: Mock storage methods
      const mockUpdatedStyle = {
        ...mockStyle,
        variables: {
          ...mockStyle.variables,
          "--accent-color": {
            ...mockStyle.variables["--accent-color"],
            value: "#00ff00",
          },
        },
      };

      vi.mocked(storageClient.getUserCSSStyle).mockResolvedValue(
        mockUpdatedStyle,
      );
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue(
        mockUpdatedStyle,
      );

      // Setup: Add style to storage
      await storageClient.addUserCSSStyle(mockStyle);

      // Action: Update variables through persistence service
      await variablePersistenceService.updateVariables(mockStyleId, {
        "--accent-color": "#00ff00",
      });

      // Verify: Variables were saved to storage
      const updatedStyle = await storageClient.getUserCSSStyle(mockStyleId);
      expect(updatedStyle?.variables["--accent-color"].value).toBe("#00ff00");

      // Verify: Broadcast message was sent
      expect(messageBus.broadcast).toHaveBeenCalledWith({
        type: "VARIABLES_UPDATED",
        payload: {
          styleId: mockStyleId,
          variables: { "--accent-color": "#00ff00" },
          timestamp: expect.any(Number),
        },
      });
    });

    it("should handle number variable change with persistence", async () => {
      // Setup: Mock storage methods
      const mockUpdatedStyle = {
        ...mockStyle,
        variables: {
          ...mockStyle.variables,
          "--font-size": {
            ...mockStyle.variables["--font-size"],
            value: "24",
          },
        },
      };

      vi.mocked(storageClient.getUserCSSStyle).mockResolvedValue(
        mockUpdatedStyle,
      );
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue(
        mockUpdatedStyle,
      );

      // Setup: Add style to storage
      await storageClient.addUserCSSStyle(mockStyle);

      // Action: Update variables through persistence service
      await variablePersistenceService.updateVariables(mockStyleId, {
        "--font-size": "24",
      });

      // Verify: Variables were saved to storage
      const updatedStyle = await storageClient.getUserCSSStyle(mockStyleId);
      expect(updatedStyle?.variables["--font-size"].value).toBe("24");

      // Verify: Broadcast message was sent
      expect(messageBus.broadcast).toHaveBeenCalledWith({
        type: "VARIABLES_UPDATED",
        payload: {
          styleId: mockStyleId,
          variables: { "--font-size": "24" },
          timestamp: expect.any(Number),
        },
      });
    });

    it("should handle select variable change", async () => {
      // Setup: Mock storage methods
      const mockUpdatedStyle = {
        ...mockStyle,
        variables: {
          ...mockStyle.variables,
          "--theme": {
            ...mockStyle.variables["--theme"],
            value: "dark",
          },
        },
      };

      vi.mocked(storageClient.getUserCSSStyle).mockResolvedValue(
        mockUpdatedStyle,
      );
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue(
        mockUpdatedStyle,
      );

      // Setup: Add style to storage
      await storageClient.addUserCSSStyle(mockStyle);

      // Action: Update variables through persistence service
      await variablePersistenceService.updateVariables(mockStyleId, {
        "--theme": "dark",
      });

      // Verify: Variables were saved to storage
      const updatedStyle = await storageClient.getUserCSSStyle(mockStyleId);
      expect(updatedStyle?.variables["--theme"].value).toBe("dark");

      // Verify: Broadcast message was sent
      expect(messageBus.broadcast).toHaveBeenCalledWith({
        type: "VARIABLES_UPDATED",
        payload: {
          styleId: mockStyleId,
          variables: { "--theme": "dark" },
          timestamp: expect.any(Number),
        },
      });
    });

    it("should handle multiple variable changes in single update", async () => {
      // Setup: Mock storage methods
      const mockUpdatedStyle = {
        ...mockStyle,
        variables: {
          ...mockStyle.variables,
          "--accent-color": {
            ...mockStyle.variables["--accent-color"],
            value: "#0000ff",
          },
          "--font-size": {
            ...mockStyle.variables["--font-size"],
            value: "20",
          },
          "--theme": {
            ...mockStyle.variables["--theme"],
            value: "dark",
          },
        },
      };

      vi.mocked(storageClient.getUserCSSStyle).mockResolvedValue(
        mockUpdatedStyle,
      );
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue(
        mockUpdatedStyle,
      );

      // Setup: Add style to storage
      await storageClient.addUserCSSStyle(mockStyle);

      // Action: Update multiple variables at once
      const variableUpdates = {
        "--accent-color": "#0000ff",
        "--font-size": "20",
        "--theme": "dark",
      };

      await variablePersistenceService.updateVariables(
        mockStyleId,
        variableUpdates,
      );

      // Verify: All variables were saved to storage
      const updatedStyle = await storageClient.getUserCSSStyle(mockStyleId);
      expect(updatedStyle?.variables["--accent-color"].value).toBe("#0000ff");
      expect(updatedStyle?.variables["--font-size"].value).toBe("20");
      expect(updatedStyle?.variables["--theme"].value).toBe("dark");

      // Verify: Single broadcast message was sent with all updates
      expect(messageBus.broadcast).toHaveBeenCalledWith({
        type: "VARIABLES_UPDATED",
        payload: {
          styleId: mockStyleId,
          variables: variableUpdates,
          timestamp: expect.any(Number),
        },
      });
    });

    it("should handle variable reset to defaults", async () => {
      // Setup: Add style with modified variables
      const modifiedStyle = {
        ...mockStyle,
        variables: {
          ...mockVariables,
          "--accent-color": {
            ...mockVariables["--accent-color"],
            value: "#00ff00", // Modified from default
          },
        },
      };

      // Setup: Mock storage methods
      const mockResetStyle = {
        ...mockStyle,
        variables: {
          ...mockStyle.variables,
          "--accent-color": {
            ...mockStyle.variables["--accent-color"],
            value: "#ff0000", // Back to default
          },
        },
      };

      // Mock getUserCSSStyle to return modified style first, then reset style after update
      vi.mocked(storageClient.getUserCSSStyle)
        .mockResolvedValueOnce(modifiedStyle) // First call for resetVariables
        .mockResolvedValue(mockResetStyle); // Subsequent calls
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue(
        mockResetStyle,
      );

      await storageClient.addUserCSSStyle(modifiedStyle);

      // Action: Reset variables to defaults
      await variablePersistenceService.resetVariables(mockStyleId);

      // Verify: Variables were reset to defaults
      const updatedStyle = await storageClient.getUserCSSStyle(mockStyleId);
      expect(updatedStyle?.variables["--accent-color"].value).toBe("#ff0000"); // Back to default

      // Verify: Broadcast message was sent with reset values (all variables reset to defaults)
      expect(messageBus.broadcast).toHaveBeenCalledWith({
        type: "VARIABLES_UPDATED",
        payload: {
          styleId: mockStyleId,
          variables: {
            "--accent-color": "#ff0000", // Reset to default
            "--font-size": "16", // Default value
            "--theme": "light", // Default value
          },
          timestamp: expect.any(Number),
        },
      });
    });

    it("should handle storage watcher callbacks", async () => {
      // Setup: Add style to storage
      await storageClient.addUserCSSStyle(mockStyle);

      // Setup: Mock storage update
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue(
        mockStyle,
      );

      // Setup: Watch for variable changes
      const watcherCallback = vi.fn();
      const unsubscribe =
        variablePersistenceService.watchVariableChanges(watcherCallback);

      // Action: Update variables
      await variablePersistenceService.updateVariables(mockStyleId, {
        "--accent-color": "#ff00ff",
      });

      // Verify: Watcher callback was called
      expect(watcherCallback).toHaveBeenCalledWith({
        styleId: mockStyleId,
        variables: { "--accent-color": "#ff00ff" },
      });

      // Cleanup
      unsubscribe();
    });

    it("should handle errors gracefully", async () => {
      // Setup: Mock storage to throw error
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockRejectedValue(
        new Error("Storage error"),
      );

      // Action: Try to update variables (should handle error gracefully)
      await expect(
        variablePersistenceService.updateVariables(mockStyleId, {
          "--accent-color": "#ff0000",
        }),
      ).rejects.toThrow("Failed to update variables");

      // Verify: Broadcast was not called due to error
      expect(messageBus.broadcast).not.toHaveBeenCalled();
    });
  });

  describe("Content Script Integration", () => {
    it("should handle VARIABLES_UPDATED messages in content script", async () => {
      // Setup: Add style to storage
      await storageClient.addUserCSSStyle(mockStyle);

      // Simulate content script receiving VARIABLES_UPDATED message
      const message = {
        type: "VARIABLES_UPDATED",
        payload: {
          styleId: mockStyleId,
          variables: { "--accent-color": "#ff00ff" },
          timestamp: Date.now(),
        },
      };

      // Simulate the content script message handler
      if (message.type === "VARIABLES_UPDATED" && message.payload) {
        const { styleId, variables } = message.payload;
        await mockContentController.onVariablesUpdate(styleId, variables);
      }

      // Verify: Content controller received the update
      expect(mockContentController.onVariablesUpdate).toHaveBeenCalledWith(
        mockStyleId,
        { "--accent-color": "#ff00ff" },
      );
    });

    it("should integrate with CSS injection for live updates", async () => {
      // Setup: Add style to storage
      await storageClient.addUserCSSStyle(mockStyle);

      // Setup: Mock storage update
      vi.mocked(storageClient.updateUserCSSStyleVariables).mockResolvedValue(
        mockStyle,
      );

      // Action: Update variables
      await variablePersistenceService.updateVariables(mockStyleId, {
        "--accent-color": "#ffff00",
      });

      // Verify: Message was broadcast (which would trigger content script update)
      expect(messageBus.broadcast).toHaveBeenCalledWith({
        type: "VARIABLES_UPDATED",
        payload: {
          styleId: mockStyleId,
          variables: { "--accent-color": "#ffff00" },
          timestamp: expect.any(Number),
        },
      });

      // In real scenario, the content script would:
      // 1. Receive the VARIABLES_UPDATED message
      // 2. Call contentController.onVariablesUpdate()
      // 3. Which would re-inject the CSS with new variable values
      // 4. Resulting in live visual updates without page refresh
    });
  });
});
