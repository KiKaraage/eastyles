/**
 * Unit tests for storage service
 * Tests CRUD operations, error handling, and fallback mechanisms
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SettingsStorage,
  UserStyle,
  ExportData,
  DEFAULT_SETTINGS,
  validateSettings,
  validateUserStyle,
  validateExportData,
  createUserStyle,
} from "../services/storage/schema";
import {
  StorageFallbacks,
  StorageMigrations,
} from "../services/storage/defaults";

describe("Storage Schema", () => {
  describe("validateSettings", () => {
    it("should validate correct settings", () => {
      const validSettings: SettingsStorage = {
        lastUsed: Date.now(),
        version: "1.0.0",
        isDebuggingEnabled: true,
        themeMode: "dark",
      };

      const result = validateSettings(validSettings);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid settings", () => {
      const invalidSettings = {
        lastUsed: "not-a-number",
        version: 123,
      };

      const result = validateSettings(invalidSettings);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject future lastUsed dates", () => {
      const futureSettings: SettingsStorage = {
        lastUsed: Date.now() + 86400000, // 1 day in future
        version: "1.0.0",
      };

      const result = validateSettings(futureSettings);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("lastUsed cannot be in the future");
    });

    it("should reject invalid version format", () => {
      const invalidVersionSettings: SettingsStorage = {
        lastUsed: Date.now(),
        version: "invalid-version",
      };

      const result = validateSettings(invalidVersionSettings);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "version must follow semantic versioning format",
      );
    });
  });

  describe("validateUserStyle", () => {
    it("should validate correct user style", () => {
      const validStyle: UserStyle = {
        id: "test-style",
        name: "Test Style",
        code: "body { color: red; }",
        enabled: true,
        domains: ["example.com"],
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
        description: "A test style",
        version: 1,
      };

      const result = validateUserStyle(validStyle);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject style with empty name", () => {
      const invalidStyle = createUserStyle({
        name: "",
        code: "body { color: red; }",
      });

      const result = validateUserStyle(invalidStyle);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Style name cannot be empty");
    });

    it("should reject style with future createdAt", () => {
      const invalidStyle = createUserStyle({
        name: "Test",
        code: "body { color: red; }",
        createdAt: Date.now() + 1000,
      });

      const result = validateUserStyle(invalidStyle);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("createdAt cannot be in the future");
    });

    it("should reject style where createdAt > updatedAt", () => {
      const now = Date.now();
      const invalidStyle = createUserStyle({
        name: "Test",
        code: "body { color: red; }",
        createdAt: now,
        updatedAt: now - 1000,
      });

      const result = validateUserStyle(invalidStyle);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("createdAt cannot be after updatedAt");
    });
  });

  describe("validateExportData", () => {
    it("should validate correct export data", () => {
      const validExportData: ExportData = {
        settings: DEFAULT_SETTINGS,
        styles: [],
        timestamp: Date.now(),
        version: "1.0.0",
        exportVersion: "1.0.0",
      };

      const result = validateExportData(validExportData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject export data with invalid settings", () => {
      const invalidExportData = {
        settings: { invalid: true },
        styles: [],
        timestamp: Date.now(),
        version: "1.0.0",
        exportVersion: "1.0.0",
      };

      const result = validateExportData(invalidExportData);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("createUserStyle", () => {
    it("should create style with defaults", () => {
      const style = createUserStyle({
        name: "Test Style",
        code: "body { color: red; }",
      });

      expect(style.id).toBeDefined();
      expect(style.name).toBe("Test Style");
      expect(style.code).toBe("body { color: red; }");
      expect(style.enabled).toBe(true);
      expect(style.domains).toEqual([]);
      expect(style.createdAt).toBeDefined();
      expect(style.updatedAt).toBeDefined();
      expect(style.version).toBe(1);
    });

    it("should allow overriding defaults", () => {
      const customStyle = createUserStyle({
        name: "Custom Style",
        code: "div { margin: 0; }",
        enabled: false,
        domains: ["test.com"],
        version: 2,
      });

      expect(customStyle.enabled).toBe(false);
      expect(customStyle.domains).toEqual(["test.com"]);
      expect(customStyle.version).toBe(2);
    });
  });
});

// Skipping storage client tests for now due to WXT testing environment issues
// These tests will be re-enabled once the environment is properly configured

describe("StorageFallbacks", () => {
  describe("getSettingsFallback", () => {
    it("should return default settings for null input", () => {
      const fallback = StorageFallbacks.getSettingsFallback(null);
      expect(fallback).toEqual(DEFAULT_SETTINGS);
    });

    it("should preserve valid fields from corrupted settings", () => {
      const corruptedSettings = {
        version: "2.0.0",
        lastUsed: Date.now() - 1000,
        isDebuggingEnabled: true,
        themeMode: "dark",
        invalidField: "should be ignored",
      };

      const fallback = StorageFallbacks.getSettingsFallback(corruptedSettings);

      expect(fallback.version).toBe("2.0.0");
      expect(fallback.lastUsed).toBe(corruptedSettings.lastUsed);
      expect(fallback.isDebuggingEnabled).toBe(true);
      expect(fallback.themeMode).toBe("dark");
      expect((fallback as any).invalidField).toBeUndefined();
    });

    it("should reject invalid field values", () => {
      const corruptedSettings = {
        version: 123, // Should be string
        lastUsed: Date.now() + 1000, // Future date
        isDebuggingEnabled: "yes", // Should be boolean
        themeMode: "purple", // Invalid theme
      };

      const fallback = StorageFallbacks.getSettingsFallback(corruptedSettings);

      expect(fallback.version).toBe(DEFAULT_SETTINGS.version);
      expect(fallback.lastUsed).toBe(DEFAULT_SETTINGS.lastUsed);
      expect(fallback.isDebuggingEnabled).toBe(
        DEFAULT_SETTINGS.isDebuggingEnabled,
      );
      expect(fallback.themeMode).toBe(DEFAULT_SETTINGS.themeMode);
    });
  });

  describe("getStylesFallback", () => {
    it("should return empty array for non-array input", () => {
      const fallback = StorageFallbacks.getStylesFallback("not an array");
      expect(fallback).toEqual([]);
    });

    it("should recover valid styles from corrupted array", () => {
      const corruptedStyles = [
        {
          id: "style1",
          name: "Style 1",
          code: "body { color: red; }",
          // Missing other required fields
        },
        {
          // Missing required fields entirely
          someOtherField: "value",
        },
        {
          id: "style2",
          name: "Style 2",
          code: "body { color: blue; }",
          enabled: true,
          domains: ["test.com"],
          createdAt: Date.now() - 1000,
          updatedAt: Date.now(),
        },
      ];

      const fallback = StorageFallbacks.getStylesFallback(corruptedStyles);

      expect(fallback).toHaveLength(2); // Only recoverable styles
      expect(fallback[0].id).toBe("style1");
      expect(fallback[0].name).toBe("Style 1");
      expect(fallback[0].enabled).toBe(true); // Default value
      expect(fallback[1].id).toBe("style2");
      expect(fallback[1].name).toBe("Style 2");
    });
  });

  describe("performStorageHealthCheck", () => {
    it("should perform health check and detect corruption", async () => {
      const mockGetStoredData = vi.fn().mockResolvedValue({
        settings: { invalid: "settings" },
        styles: "not an array",
      });

      const result =
        await StorageFallbacks.performStorageHealthCheck(mockGetStoredData);

      expect(result.hadCorruption).toBe(true);
      expect(result.settings).toEqual(DEFAULT_SETTINGS);
      expect(result.styles).toEqual([]);
    });

    it("should pass through valid data", async () => {
      const validData = {
        settings: DEFAULT_SETTINGS,
        styles: [],
      };

      const mockGetStoredData = vi.fn().mockResolvedValue(validData);

      const result =
        await StorageFallbacks.performStorageHealthCheck(mockGetStoredData);

      expect(result.hadCorruption).toBe(false);
      expect(result.settings).toEqual(DEFAULT_SETTINGS);
      expect(result.styles).toEqual([]);
    });
  });
});

describe("StorageMigrations", () => {
  describe("needsMigration", () => {
    it("should detect when migration is needed", () => {
      expect(StorageMigrations.needsMigration("1.0.0", "1.1.0")).toBe(true);
      expect(StorageMigrations.needsMigration("1.0.0", "2.0.0")).toBe(true);
      expect(StorageMigrations.needsMigration("1.1.0", "1.0.0")).toBe(false);
      expect(StorageMigrations.needsMigration("1.0.0", "1.0.0")).toBe(false);
    });
  });

  describe("migrateData", () => {
    it("should migrate data between versions", async () => {
      const originalData = {
        settings: { ...DEFAULT_SETTINGS, version: "1.0.0" },
        styles: [],
      };

      const migratedData = await StorageMigrations.migrateData(
        originalData,
        "1.0.0",
        "1.1.0",
      );

      expect(migratedData.settings.version).toBe("1.1.0");
      expect(migratedData.settings.lastUsed).toBeGreaterThan(
        originalData.settings.lastUsed,
      );
    });
  });
});
