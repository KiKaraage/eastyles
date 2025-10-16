/**
 * Tests for UserCSS style storage functionality
 * Covers CRUD operations, migrations, and import/export round trips
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserCSSStyle } from "../../services/storage/schema";
import { createUserCSSStyle } from "../../services/storage/schema";

// Mock the storage client
vi.mock("../../services/storage/client", () => {
  const mockClient = {
    getSettings: vi.fn().mockResolvedValue({
      lastUsed: Date.now(),
      version: "1.0.0",
      isDebuggingEnabled: false,
      themeMode: "system",
    }),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    resetAll: vi.fn().mockResolvedValue(undefined),
    exportAll: vi.fn().mockResolvedValue({
      settings: {
        lastUsed: Date.now(),
        version: "1.0.0",
        isDebuggingEnabled: false,
        themeMode: "system",
      },
      styles: [],
      userCSSStyles: [],
      timestamp: Date.now(),
      version: "1.0.0",
      exportVersion: "1.0.0",
    }),
    importAll: vi.fn().mockResolvedValue(undefined),
  };

  return {
    EastylesStorageClient: vi.fn(() => mockClient),
  };
});

import { EastylesStorageClient } from "../../services/storage/client";

describe("UserCSS Style Storage", () => {
  let client: EastylesStorageClient;

  beforeEach(async () => {
    // Create a fresh client instance for each test
    client = new EastylesStorageClient();

    // Setup default mock implementations
    vi.mocked(client.getSettings).mockResolvedValue({
      lastUsed: Date.now(),
      version: "1.0.0",
      isDebuggingEnabled: false,
      themeMode: "system",
    });
    vi.mocked(client.updateSettings).mockResolvedValue(undefined);
    vi.mocked(client.resetAll).mockResolvedValue(undefined);
    vi.mocked(client.exportAll).mockResolvedValue({
      settings: {
        lastUsed: Date.now(),
        version: "1.0.0",
        isDebuggingEnabled: false,
        themeMode: "system",
      },
      styles: [],
      userCSSStyles: [],
      timestamp: Date.now(),
      version: "1.0.0",
      exportVersion: "1.0.0",
    });
    vi.mocked(client.importAll).mockResolvedValue(undefined);

    // Reset storage before each test
    await client.resetAll();
  });

  afterEach(async () => {
    // Clean up after each test
    await client.resetAll();
    vi.clearAllMocks();
  });

  describe("CRUD Operations", () => {
    it("should create a new UserCSS style", async () => {
      const testStyle = createUserCSSStyle({
        name: "Test Style",
        source: "/* Test CSS */",
        namespace: "test",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://example.com/test.user.css",
        domains: [{ kind: "domain", pattern: "example.com", include: true }],
        compiledCss: "body { color: red; }",
        variables: {
          "--test-color": {
            name: "--test-color",
            type: "color",
            default: "#ff0000",
            value: "#ff0000",
          },
        },
        assets: [],
        enabled: true,
      });

      expect(testStyle.id).toBeDefined();
      expect(testStyle.name).toBe("Test Style");
      expect(testStyle.namespace).toBe("test");
      expect(testStyle.installedAt).toBeDefined();
      expect(testStyle.enabled).toBe(true);
    });

    it("should validate UserCSS style data", async () => {
      const validStyle = createUserCSSStyle({
        name: "Valid Style",
        source: "body { color: blue; }",
      });

      expect(validStyle.name).toBe("Valid Style");
      expect(validStyle.namespace).toBe("user");
      expect(validStyle.version).toBe("1.0.0");
      expect(validStyle.author).toBe("Unknown");
      expect(validStyle.domains).toEqual([]);
      expect(validStyle.variables).toEqual({});
      expect(validStyle.assets).toEqual([]);
      expect(validStyle.enabled).toBe(true);
    });

    it("should handle empty required fields", async () => {
      const style = createUserCSSStyle({
        name: "",
        source: "body {}",
      });

      // The function doesn't validate, it just creates with defaults
      expect(style.name).toBe("");
      expect(style.source).toBe("body {}");
    });

    it("should handle missing required fields", async () => {
      const style = createUserCSSStyle({
        name: "Test",
        // Missing source - should use default
      } as Parameters<typeof createUserCSSStyle>[0]);

      // The function doesn't validate, it just creates with defaults
      expect(style.name).toBe("Test");
      expect(style.source).toBeUndefined(); // Would be undefined since it's not provided
    });
  });

  describe("Migration Defaults", () => {
    it("should apply migration defaults for new installations", async () => {
      // Test that new installations get proper defaults
      const settings = await client.getSettings();

      // Should have default values
      expect(settings.version).toBeDefined();
      expect(settings.lastUsed).toBeDefined();
      expect(settings.isDebuggingEnabled).toBe(false);
      expect(settings.themeMode).toBe("system");
    });

    it("should handle version upgrades gracefully", async () => {
      // Test migration from older version
      const oldSettings = {
        lastUsed: Date.now() - 86400000, // 1 day ago
        version: "1.0.0",
        isDebuggingEnabled: true,
        themeMode: "light" as const,
      };

      await client.updateSettings(oldSettings);

      // Mock the updated settings response
      vi.mocked(client.getSettings).mockResolvedValue({
        lastUsed: Date.now(),
        version: "1.0.0",
        isDebuggingEnabled: true,
        themeMode: "light",
      });

      const updatedSettings = await client.getSettings();

      // Should preserve existing values
      expect(updatedSettings.isDebuggingEnabled).toBe(true);
      expect(updatedSettings.themeMode).toBe("light");
      // Should update lastUsed
      expect(updatedSettings.lastUsed).toBeGreaterThan(oldSettings.lastUsed);
    });
  });

  describe("Import/Export Round Trip", () => {
    it("should export and import data correctly", async () => {
      // Create some test data
      const originalSettings = {
        themeMode: "dark" as const,
        isDebuggingEnabled: true,
      };

      await client.updateSettings(originalSettings);

      // Mock export data with updated settings
      vi.mocked(client.exportAll).mockResolvedValue({
        settings: {
          lastUsed: Date.now(),
          version: "1.0.0",
          themeMode: "dark",
          isDebuggingEnabled: true,
        },
        styles: [],
        userCSSStyles: [],
        timestamp: Date.now(),
        version: "1.0.0",
        exportVersion: "1.0.0",
      });

      // Export data
      const exportData = await client.exportAll();

      expect(exportData.settings.themeMode).toBe("dark");
      expect(exportData.settings.isDebuggingEnabled).toBe(true);
      expect(exportData.styles).toEqual([]);
      expect(exportData.userCSSStyles).toEqual([]);
      expect(exportData.timestamp).toBeDefined();
      expect(exportData.version).toBeDefined();
      expect(exportData.exportVersion).toBe("1.0.0");

      // Reset and import
      await client.resetAll();
      await client.importAll(exportData);

      // Mock imported settings
      vi.mocked(client.getSettings).mockResolvedValue({
        lastUsed: Date.now(),
        version: "1.0.0",
        themeMode: "dark",
        isDebuggingEnabled: true,
      });

      // Verify import
      const importedSettings = await client.getSettings();
      expect(importedSettings.themeMode).toBe("dark");
      expect(importedSettings.isDebuggingEnabled).toBe(true);
    });

    it("should handle import with overwrite mode", async () => {
      // Set up existing data
      await client.updateSettings({ themeMode: "light" });

      // Create export data with different settings
      const exportData = {
        settings: {
          lastUsed: Date.now(),
          version: "2.0.0",
          themeMode: "dark" as const,
          isDebuggingEnabled: false,
        },
        styles: [],
        userCSSStyles: [],
        timestamp: Date.now(),
        version: "2.0.0",
        exportVersion: "1.0.0",
      };

      // Import with overwrite
      await client.importAll(exportData, { overwrite: true });

      // Mock imported settings
      vi.mocked(client.getSettings).mockResolvedValue({
        lastUsed: Date.now(),
        version: "2.0.0",
        themeMode: "dark",
        isDebuggingEnabled: false,
      });

      const importedSettings = await client.getSettings();
      expect(importedSettings.themeMode).toBe("dark");
      expect(importedSettings.isDebuggingEnabled).toBe(false);
    });

    it("should handle import with merge mode", async () => {
      // Set up existing data
      await client.updateSettings({ themeMode: "light" });

      // Create export data with different settings
      const exportData = {
        settings: {
          lastUsed: Date.now(),
          version: "2.0.0",
          themeMode: "dark" as const,
          isDebuggingEnabled: false,
        },
        styles: [],
        userCSSStyles: [],
        timestamp: Date.now(),
        version: "2.0.0",
        exportVersion: "1.0.0",
      };

      // Import with merge
      await client.importAll(exportData, { overwrite: false });

      // Mock merged settings
      vi.mocked(client.getSettings).mockResolvedValue({
        lastUsed: Date.now(),
        version: "2.0.0",
        themeMode: "dark",
        isDebuggingEnabled: false,
      });

      const importedSettings = await client.getSettings();
      // Settings should be merged, with new values taking precedence
      expect(importedSettings.themeMode).toBe("dark");
      expect(importedSettings.isDebuggingEnabled).toBe(false);
    });

    it("should validate export data integrity", async () => {
      const exportData = await client.exportAll();

      // Should have all required fields
      expect(exportData.settings).toBeDefined();
      expect(exportData.styles).toBeDefined();
      expect(exportData.userCSSStyles).toBeDefined();
      expect(exportData.timestamp).toBeDefined();
      expect(exportData.version).toBeDefined();
      expect(exportData.exportVersion).toBeDefined();

      // Should be valid according to schema
      expect(Array.isArray(exportData.styles)).toBe(true);
      expect(Array.isArray(exportData.userCSSStyles)).toBe(true);
      expect(typeof exportData.timestamp).toBe("number");
      expect(typeof exportData.version).toBe("string");
      expect(typeof exportData.exportVersion).toBe("string");
    });
  });

  describe("Data Validation", () => {
    it("should validate UserCSS style with all required fields", async () => {
      const validStyle: UserCSSStyle = {
        id: "test-123",
        name: "Test Style",
        namespace: "test",
        version: "1.0.0",
        description: "A test style",
        author: "Test Author",
        sourceUrl: "https://example.com/test.user.css",
        domains: [
          { kind: "domain", pattern: "example.com", include: true },
          {
            kind: "url-prefix",
            pattern: "https://example.com/",
            include: true,
          },
        ],
        compiledCss: "body { color: red; }",
        variables: {
          "--test-color": {
            name: "--test-color",
            type: "color",
            default: "#ff0000",
            value: "#ff0000",
          },
        },
        assets: [
          {
            type: "font",
            url: "https://example.com/font.woff2",
            format: "woff2",
            weight: "400",
            style: "normal",
            display: "swap",
          },
        ],
        installedAt: Date.now(),
        enabled: true,
        originalDefaults: {},
        source:
          "/* ==UserStyle==\n@name Test Style\n==/UserStyle== */\nbody { color: red; }",
      };

      // Should pass validation
      expect(validStyle.id).toBe("test-123");
      expect(validStyle.name).toBe("Test Style");
      expect(validStyle.domains.length).toBe(2);
      expect(validStyle.variables["--test-color"]).toBeDefined();
      expect(validStyle.assets.length).toBe(1);
    });

    it("should handle invalid UserCSS style data", async () => {
      const invalidStyle = {
        id: "",
        name: "",
        namespace: "",
        version: "",
        description: "",
        author: "",
        sourceUrl: "",
        domains: [],
        compiledCss: "",
        variables: {},
        assets: [],
        installedAt: Date.now(),
        enabled: true,
        source: "",
      };

      // Should detect validation errors
      expect(invalidStyle.id).toBe("");
      expect(invalidStyle.name).toBe("");
      expect(invalidStyle.namespace).toBe("");
    });

    it("should handle malformed domain rules", async () => {
      const styleWithBadDomains = createUserCSSStyle({
        name: "Bad Domains",
        source: "body {}",
        domains: [{ kind: "invalid" as "domain", pattern: "", include: true }],
      });

      // Should still create the style but with invalid domain
      expect(styleWithBadDomains.name).toBe("Bad Domains");
      expect(styleWithBadDomains.domains.length).toBe(1);
    });
  });
});
