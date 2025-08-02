/**
 * Unit tests for export utility
 */

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ExportService, CompressionUtils } from "../../utils/export";
import { storageClient } from "../../services/storage/client";
import { logger } from "../../services/errors/logger";
import { DEFAULT_SETTINGS } from "../../services/storage/schema";
import type { ExportData } from "../../services/storage/schema";

// Mock dependencies
vi.mock("../../services/storage/client", () => ({
  storageClient: {
    exportAll: vi.fn(),
  },
}));

vi.mock("../../services/errors/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock browser APIs
const mockCompressionStream = vi.fn();
const mockDecompressionStream = vi.fn();

// Set up initial global mocks
vi.stubGlobal("CompressionStream", mockCompressionStream);
vi.stubGlobal("DecompressionStream", mockDecompressionStream);
vi.stubGlobal("TextEncoder", TextEncoder);
vi.stubGlobal("TextDecoder", TextDecoder);
vi.stubGlobal("btoa", btoa);
vi.stubGlobal("atob", atob);

// Mock URL and document for download tests
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();

vi.stubGlobal("URL", {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
});

vi.stubGlobal("document", {
  createElement: vi.fn(() => ({
    click: mockClick,
    style: {},
  })),
  body: {
    appendChild: mockAppendChild,
    removeChild: mockRemoveChild,
  },
});

vi.stubGlobal(
  "Blob",
  class MockBlob {
    constructor(
      public data: unknown[],
      public options: { type: string },
    ) {}
  },
);

describe("CompressionUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("compress", () => {
    it("should compress data when CompressionStream is available", async () => {
      // Mock CompressionStream
      const mockWrite = vi.fn();
      const mockClose = vi.fn();
      const mockRead = vi
        .fn()
        .mockResolvedValueOnce({
          value: new Uint8Array([1, 2, 3]),
          done: false,
        })
        .mockResolvedValueOnce({ done: true });

      mockCompressionStream.mockImplementation(() => ({
        writable: {
          getWriter: () => ({
            write: mockWrite,
            close: mockClose,
          }),
        },
        readable: {
          getReader: () => ({
            read: mockRead,
          }),
        },
      }));

      const testData = "test data";
      const result = await CompressionUtils.compress(testData);

      expect(mockCompressionStream).toHaveBeenCalledWith("gzip");
      expect(mockWrite).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should return original data when CompressionStream is not available", async () => {
      // Mock global window check
      const originalWindow = global.window;
      // @ts-expect-error - deleting property for test
      delete global.window.CompressionStream;

      const testData = "test data";
      const result = await CompressionUtils.compress(testData);

      expect(result).toBe(testData);
      expect(logger.warn).toHaveBeenCalledWith(
        "background",
        "Compression not supported in this browser, returning uncompressed data",
      );

      // Restore
      global.window = originalWindow;
    });

    it("should handle compression errors gracefully", async () => {
      // Mock TextEncoder to throw an error
      const originalTextEncoder = global.TextEncoder;
      global.TextEncoder = class {
        encode() {
          throw new Error("Compression failed");
        }
      } as any;

      const testData = "test data";
      const result = await CompressionUtils.compress(testData);

      expect(result).toBe(testData);
      expect(logger.error).toHaveBeenCalledWith(
        "background",
        "Failed to compress export data",
        expect.objectContaining({
          error: "Compression failed",
        }),
      );

      // Restore
      global.TextEncoder = originalTextEncoder;
    });
  });

  describe("decompress", () => {
    it("should decompress data when DecompressionStream is available", async () => {
      const mockWrite = vi.fn();
      const mockClose = vi.fn();
      const mockRead = vi
        .fn()
        .mockResolvedValueOnce({
          value: new Uint8Array([116, 101, 115, 116]),
          done: false,
        })
        .mockResolvedValueOnce({ done: true });

      mockDecompressionStream.mockImplementation(() => ({
        writable: {
          getWriter: () => ({
            write: mockWrite,
            close: mockClose,
          }),
        },
        readable: {
          getReader: () => ({
            read: mockRead,
          }),
        },
      }));

      const compressedData = btoa("compressed");
      const result = await CompressionUtils.decompress(compressedData);

      expect(mockDecompressionStream).toHaveBeenCalledWith("gzip");
      expect(mockWrite).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
      expect(result).toBe("test");
    });

    it("should return data as-is when DecompressionStream is not available", async () => {
      // Mock global window check
      const originalWindow = global.window;
      // @ts-expect-error - deleting property for test
      delete global.window.DecompressionStream;

      const testData = "uncompressed data";
      const result = await CompressionUtils.decompress(testData);

      expect(result).toBe(testData);

      // Restore
      global.window = originalWindow;
    });

    it("should throw ImportExportError on decompression failure", async () => {
      // Mock DecompressionStream to be available but throw error during construction
      vi.stubGlobal(
        "DecompressionStream",
        class {
          constructor() {
            throw new Error("Decompression failed");
          }
        },
      );

      const compressedData = btoa("compressed");

      await expect(CompressionUtils.decompress(compressedData)).rejects.toThrow(
        "Failed to decompress import data",
      );

      expect(logger.error).toHaveBeenCalledWith(
        "background",
        "Failed to decompress import data",
        expect.objectContaining({
          error: "Decompression failed",
        }),
      );
    });
  });
});

describe("ExportService", () => {
  const mockExportData: ExportData = {
    settings: { ...DEFAULT_SETTINGS },
    styles: [
      {
        id: "test-style-1",
        name: "Test Style",
        code: ".test { color: red; }",
        enabled: true,
        domains: ["example.com"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    timestamp: Date.now(),
    version: "1.0.0",
    exportVersion: "1.0.0",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (storageClient.exportAll as Mock).mockResolvedValue(mockExportData);
    vi.stubGlobal("CompressionStream", mockCompressionStream);
    vi.stubGlobal("DecompressionStream", mockDecompressionStream);
  });

  describe("exportData", () => {
    it("should export data successfully with default options", async () => {
      const result = await ExportService.exportData();

      expect(storageClient.exportAll).toHaveBeenCalled();
      expect(result).toMatchObject({
        filename: expect.stringMatching(
          /eastyles-backup-\d{4}-\d{2}-\d{2}\.json/,
        ),
        size: expect.any(Number),
        compressed: false,
        timestamp: expect.any(Number),
        styleCount: 1,
      });
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe("string");

      // Verify the exported data structure
      const parsedData = JSON.parse(result.data);
      expect(parsedData).toMatchObject({
        settings: mockExportData.settings,
        styles: mockExportData.styles,
        exportVersion: expect.any(String),
        exportedAt: expect.any(Number),
      });
    });

    it("should include debug info when requested", async () => {
      const result = await ExportService.exportData({
        includeDebugInfo: true,
      });

      const parsedData = JSON.parse(result.data);
      expect(parsedData.debugInfo).toBeDefined();
      expect(parsedData.debugInfo).toMatchObject({
        userAgent: expect.any(String),
        timestamp: expect.any(String),
        exportDuration: expect.any(Number),
      });
    });

    it("should use custom filename when provided", async () => {
      const customFilename = "my-backup";
      const result = await ExportService.exportData({
        filename: customFilename,
      });

      expect(result.filename).toMatch(
        new RegExp(`${customFilename}-\\d{4}-\\d{2}-\\d{2}\\.json`),
      );
    });

    it("should pretty print JSON when requested", async () => {
      const result = await ExportService.exportData({
        prettyPrint: true,
      });

      // Pretty printed JSON should contain newlines and indentation
      expect(result.data).toMatch(/\n\s+/);
    });

    it("should attempt compression for large data", async () => {
      // Create large mock data to trigger compression
      const largeStyles = Array.from({ length: 1000 }, (_, i) => ({
        id: `style-${i}`,
        name: `Style ${i}`,
        code: ".test { color: red; }".repeat(100),
        enabled: true,
        domains: ["example.com"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      const largeExportData = {
        ...mockExportData,
        styles: largeStyles,
      };

      (storageClient.exportAll as Mock).mockResolvedValue(largeExportData);

      // Mock successful compression
      const mockWrite = vi.fn();
      const mockClose = vi.fn();
      const mockRead = vi
        .fn()
        .mockResolvedValueOnce({
          value: new Uint8Array([1, 2, 3]),
          done: false,
        })
        .mockResolvedValueOnce({ done: true });

      mockCompressionStream.mockImplementation(() => ({
        writable: { getWriter: () => ({ write: mockWrite, close: mockClose }) },
        readable: { getReader: () => ({ read: mockRead }) },
      }));

      const result = await ExportService.exportData({ compress: true });

      expect(result.compressed).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        "Data compressed successfully",
        expect.objectContaining({
          originalSize: expect.any(Number),
          compressedSize: expect.any(Number),
          compressionRatio: expect.stringMatching(/\d+\.\d+%/),
        }),
      );
    });

    it("should handle compression failure gracefully", async () => {
      const largeData = "x".repeat(100_000); // Ensure we definitely hit compression threshold
      const largeExportData = {
        ...mockExportData,
        styles: Array.from({ length: 50 }, (_, i) => ({
          id: `style-${i}`,
          name: `Style ${i}`,
          code: largeData,
          enabled: true,
          domains: ["example.com"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })),
      };

      (storageClient.exportAll as Mock).mockResolvedValue(largeExportData);

      // Test fallback when compression is not supported
      vi.stubGlobal("CompressionStream", undefined);

      const result = await ExportService.exportData({ compress: true });

      expect(result.compressed).toBe(false);

      // Also test when compression API throws during construction
      vi.stubGlobal("CompressionStream", () => {
        throw new Error("Compression API error");
      });

      const fallbackResult = await ExportService.exportData({ compress: true });
      expect(fallbackResult.compressed).toBe(false);

      vi.stubGlobal("CompressionStream", mockCompressionStream);
    });

    it("should throw ImportExportError on storage failure", async () => {
      const storageError = new Error("Storage failed");
      (storageClient.exportAll as Mock).mockRejectedValue(storageError);

      await expect(ExportService.exportData()).rejects.toThrow(
        "Failed to export data",
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        "Failed to export data",
        expect.objectContaining({
          error: "Storage failed",
        }),
      );
    });
  });

  describe("downloadExport", () => {
    it("should create and trigger download", async () => {
      mockCreateObjectURL.mockReturnValue("blob:mock-url");

      await ExportService.downloadExport();

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        "Export file downloaded successfully",
        expect.objectContaining({
          filename: expect.any(String),
        }),
      );
    });

    it("should handle download errors", async () => {
      const downloadError = new Error("Download failed");
      mockCreateObjectURL.mockImplementation(() => {
        throw downloadError;
      });

      await expect(ExportService.downloadExport()).rejects.toThrow(
        "Failed to download export file",
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        "Failed to download export file",
        expect.objectContaining({
          error: "Download failed",
        }),
      );
    });
  });

  describe("isValidExportFormat", () => {
    it("should return true for valid export data", () => {
      const validData = {
        settings: { ...DEFAULT_SETTINGS },
        styles: [],
        timestamp: Date.now(),
        version: "1.0.0",
      };

      expect(ExportService.isValidExportFormat(validData)).toBe(true);
    });

    it("should return false for invalid data types", () => {
      expect(ExportService.isValidExportFormat(null)).toBe(false);
      expect(ExportService.isValidExportFormat("string")).toBe(false);
      expect(ExportService.isValidExportFormat(123)).toBe(false);
      expect(ExportService.isValidExportFormat([])).toBe(false);
    });

    it("should return false for missing required fields", () => {
      const invalidData = {
        settings: { ...DEFAULT_SETTINGS },
        // Missing styles, timestamp, version
      };

      expect(ExportService.isValidExportFormat(invalidData)).toBe(false);
    });

    it("should return false for incorrect field types", () => {
      const invalidData = {
        settings: "not an object",
        styles: "not an array",
        timestamp: "not a number",
        version: 123,
      };

      expect(ExportService.isValidExportFormat(invalidData)).toBe(false);
    });
  });

  describe("isCompressedFormat", () => {
    it("should return true for compressed format", () => {
      const compressedData = {
        compressed: true,
        data: "compressed-string",
      };

      expect(ExportService.isCompressedFormat(compressedData)).toBe(true);
    });

    it("should return false for non-compressed format", () => {
      expect(ExportService.isCompressedFormat({ compressed: false })).toBe(
        false,
      );
      expect(ExportService.isCompressedFormat({ data: "string" })).toBe(false);
      expect(ExportService.isCompressedFormat(null)).toBe(false);
      expect(ExportService.isCompressedFormat("string")).toBe(false);
    });
  });

  describe("getExportStats", () => {
    it("should return export statistics", async () => {
      const stats = await ExportService.getExportStats();

      expect(stats).toMatchObject({
        totalStyles: expect.any(Number),
        estimatedSize: expect.any(Number),
        lastExport: expect.any(Number),
      });

      expect(stats.totalStyles).toBe(mockExportData.styles.length);
    });

    it("should handle errors gracefully", async () => {
      const storageError = new Error("Storage failed");
      (storageClient.exportAll as Mock).mockRejectedValue(storageError);

      const stats = await ExportService.getExportStats();

      expect(stats).toEqual({
        totalStyles: 0,
        estimatedSize: 0,
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        "Failed to get export statistics",
        expect.objectContaining({
          error: "Storage failed",
        }),
      );
    });
  });
});

describe("ExportService Import Functionality", () => {
  const mockStorageClient = storageClient as unknown as {
    exportAll: Mock;
    importAll: Mock;
    resetAll: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageClient.importAll = vi.fn();
    mockStorageClient.resetAll = vi.fn();
  });

  const createMockExportData = (): ExportData => ({
    settings: {
      ...DEFAULT_SETTINGS,
      lastUsed: Date.now() - 1000,
    },
    styles: [
      {
        id: "test-style-1",
        name: "Test Style 1",
        code: "body { color: red; }",
        enabled: true,
        domains: ["example.com"],
        createdAt: Date.now() - 2000,
        updatedAt: Date.now() - 1000,
      },
      {
        id: "test-style-2",
        name: "Test Style 2",
        code: "div { background: blue; }",
        enabled: false,
        domains: ["test.com", "demo.com"],
        createdAt: Date.now() - 3000,
        updatedAt: Date.now() - 1500,
      },
    ],
    timestamp: Date.now() - 500,
    version: "1.0.0",
    exportVersion: "1.0.0",
  });

  describe("importData", () => {
    it("should import valid JSON data successfully", async () => {
      const mockData = createMockExportData();
      const jsonData = JSON.stringify(mockData);

      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        overwrite: true,
      });

      expect(result.success).toBe(true);
      expect(result.stylesImported).toBe(2);
      expect(result.settingsUpdated).toBe(true);
      expect(result.warnings).toEqual([]);
      expect(mockStorageClient.importAll).toHaveBeenCalledWith(mockData, {
        overwrite: true,
      });
    });

    it("should handle merge mode correctly", async () => {
      const mockData = createMockExportData();
      const jsonData = JSON.stringify(mockData);

      // Mock existing data for merge mode
      mockStorageClient.exportAll.mockResolvedValue({
        ...mockData,
        styles: [
          {
            id: "existing-style",
            name: "Existing Style",
            code: "p { color: green; }",
            enabled: true,
            domains: ["existing.com"],
            createdAt: Date.now() - 4000,
            updatedAt: Date.now() - 2000,
          },
        ],
      });

      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        overwrite: false,
      });

      expect(result.success).toBe(true);
      expect(result.stylesImported).toBe(2);
      expect(mockStorageClient.importAll).toHaveBeenCalledWith(mockData, {
        overwrite: false,
      });
    });

    it("should handle compressed data", async () => {
      const mockData = createMockExportData();
      const compressedData = {
        compressed: true,
        data: "compressed-string",
        originalSize: 1000,
        compressedSize: 500,
      };

      // Mock decompression
      vi.spyOn(CompressionUtils, "decompress").mockResolvedValue(
        JSON.stringify(mockData),
      );
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(
        JSON.stringify(compressedData),
        { overwrite: true },
      );

      expect(result.success).toBe(true);
      expect(result.stylesImported).toBe(2);
      expect(CompressionUtils.decompress).toHaveBeenCalledWith(
        "compressed-string",
      );
    });

    it("should create backup before import when requested", async () => {
      const mockData = createMockExportData();
      const jsonData = JSON.stringify(mockData);

      // Mock export for backup
      vi.spyOn(ExportService, "exportData").mockResolvedValue({
        data: "backup-data",
        filename: "pre-import-backup-2024-01-01.json",
        size: 1000,
        compressed: true,
        timestamp: Date.now(),
        styleCount: 1,
      });

      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        createBackup: true,
        backupPrefix: "custom-backup",
      });

      expect(result.success).toBe(true);
      expect(result.backupFilename).toBe("pre-import-backup-2024-01-01.json");
      expect(ExportService.exportData).toHaveBeenCalledWith({
        filename: "custom-backup",
        compress: true,
      });
    });

    it("should validate data when requested", async () => {
      const mockData = createMockExportData();
      // Add duplicate IDs to trigger validation warnings
      mockData.styles.push({
        ...mockData.styles[0],
        name: "Duplicate Style",
      });

      const jsonData = JSON.stringify(mockData);
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        validateData: true,
      });

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("Duplicate style ID");
    });

    it("should throw error for invalid JSON", async () => {
      const invalidJson = "{ invalid json }";

      await expect(ExportService.importData(invalidJson)).rejects.toThrow(
        "Invalid JSON format in import data",
      );
    });

    it("should throw error for invalid export format", async () => {
      const invalidData = { not: "valid", export: "data" };
      const jsonData = JSON.stringify(invalidData);

      await expect(ExportService.importData(jsonData)).rejects.toThrow(
        "Invalid export data format",
      );
    });

    it("should handle decompression failure", async () => {
      const compressedData = {
        compressed: true,
        data: "invalid-compressed-data",
        originalSize: 1000,
        compressedSize: 500,
      };

      vi.spyOn(CompressionUtils, "decompress").mockRejectedValue(
        new Error("Decompression failed"),
      );

      await expect(
        ExportService.importData(JSON.stringify(compressedData)),
      ).rejects.toThrow("Failed to decompress import data");
    });

    it("should handle storage import failure", async () => {
      const mockData = createMockExportData();
      const jsonData = JSON.stringify(mockData);

      mockStorageClient.importAll.mockRejectedValue(new Error("Storage error"));

      await expect(ExportService.importData(jsonData)).rejects.toThrow(
        "Failed to import data",
      );
    });
  });

  describe("importFromFile", () => {
    it("should import from valid JSON file", async () => {
      const mockData = createMockExportData();
      const fileContent = JSON.stringify(mockData);
      const mockFile = new File([fileContent], "backup.json", {
        type: "application/json",
      });

      // Mock FileReader
      const mockFileReader = {
        onload: null as ((e: any) => void) | null,
        onerror: null as (() => void) | null,
        readAsText: vi.fn(),
      };

      vi.stubGlobal(
        "FileReader",
        vi.fn(() => mockFileReader),
      );
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const importPromise = ExportService.importFromFile(mockFile);

      // Simulate successful file read
      setTimeout(() => {
        if (mockFileReader.onload) {
          mockFileReader.onload({
            target: { result: fileContent },
          });
        }
      }, 0);

      const result = await importPromise;

      expect(result.success).toBe(true);
      expect(result.stylesImported).toBe(2);
      expect(mockFileReader.readAsText).toHaveBeenCalledWith(mockFile);
    });

    it("should reject non-JSON files", async () => {
      const mockFile = new File(["content"], "backup.txt", {
        type: "text/plain",
      });

      await expect(ExportService.importFromFile(mockFile)).rejects.toThrow(
        "Invalid file type. Please select a JSON file.",
      );
    });

    it("should reject files that are too large", async () => {
      const mockFile = new File(["content"], "large.json", {
        type: "application/json",
      });
      Object.defineProperty(mockFile, "size", {
        value: 60 * 1024 * 1024, // 60MB
      });

      await expect(ExportService.importFromFile(mockFile)).rejects.toThrow(
        "File too large. Maximum size is 50MB.",
      );
    });

    it("should handle file reading errors", async () => {
      const mockFile = new File(["content"], "backup.json", {
        type: "application/json",
      });

      const mockFileReader = {
        onload: null as ((e: any) => void) | null,
        onerror: null as (() => void) | null,
        readAsText: vi.fn(),
      };

      vi.stubGlobal(
        "FileReader",
        vi.fn(() => mockFileReader),
      );

      const importPromise = ExportService.importFromFile(mockFile);

      // Simulate file read error
      setTimeout(() => {
        if (mockFileReader.onerror) {
          mockFileReader.onerror();
        }
      }, 0);

      await expect(importPromise).rejects.toThrow("Failed to import from file");
    });
  });

  describe("getImportExportStats", () => {
    it("should return correct statistics", async () => {
      const mockExportData = createMockExportData();
      mockStorageClient.exportAll.mockResolvedValue(mockExportData);

      const stats = await ExportService.getImportExportStats();

      expect(stats.totalStyles).toBe(2);
      expect(stats.estimatedExportSize).toBeGreaterThan(0);
      expect(stats.canImport).toBe(true);
      expect(stats.canExport).toBe(true);
      expect(stats.supportedFormats).toContain("json");
    });

    it("should handle storage errors gracefully", async () => {
      mockStorageClient.exportAll.mockRejectedValue(new Error("Storage error"));

      const stats = await ExportService.getImportExportStats();

      expect(stats.totalStyles).toBe(0);
      expect(stats.canImport).toBe(false);
      expect(stats.canExport).toBe(false);
      expect(stats.supportedFormats).toEqual([]);
    });
  });

  describe("validateImportData", () => {
    it("should detect duplicate style IDs", async () => {
      const mockData = createMockExportData();
      mockData.styles.push({
        ...mockData.styles[0],
        name: "Duplicate Style",
      });

      const jsonData = JSON.stringify(mockData);
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        validateData: true,
      });

      expect(
        result.warnings.some((w) => w.includes("Duplicate style ID")),
      ).toBe(true);
    });

    it("should warn about old export versions", async () => {
      const mockData = createMockExportData();
      mockData.exportVersion = "0.5.0";

      const jsonData = JSON.stringify(mockData);
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        validateData: true,
      });

      expect(
        result.warnings.some((w) => w.includes("older export version")),
      ).toBe(true);
    });

    it("should warn about empty styles", async () => {
      const mockData = createMockExportData();
      mockData.styles[0].name = "";
      mockData.styles[1].code = "";

      const jsonData = JSON.stringify(mockData);
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        validateData: true,
      });

      expect(
        result.warnings.some((w) => w.includes("empty names or code")),
      ).toBe(true);
    });

    it("should warn about large styles", async () => {
      const mockData = createMockExportData();
      mockData.styles[0].code = "x".repeat(150 * 1024); // 150KB

      const jsonData = JSON.stringify(mockData);
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        validateData: true,
      });

      expect(result.warnings.some((w) => w.includes("very large"))).toBe(true);
    });

    it("should warn about future timestamps", async () => {
      const mockData = createMockExportData();
      mockData.timestamp = Date.now() + 10000; // Future timestamp

      const jsonData = JSON.stringify(mockData);
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        validateData: true,
      });

      expect(
        result.warnings.some((w) => w.includes("timestamp is in the future")),
      ).toBe(true);
    });

    it("should warn about very old exports", async () => {
      const mockData = createMockExportData();
      const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
      mockData.timestamp = twoYearsAgo;

      const jsonData = JSON.stringify(mockData);
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const result = await ExportService.importData(jsonData, {
        validateData: true,
      });

      expect(
        result.warnings.some((w) => w.includes("more than 1 year old")),
      ).toBe(true);
    });
  });
});

describe("ImportExportService", () => {
  const mockStorageClient = storageClient as unknown as {
    exportAll: Mock;
    importAll: Mock;
    resetAll: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageClient.importAll = vi.fn();
    mockStorageClient.resetAll = vi.fn();
  });

  const createMockExportData = (): ExportData => ({
    settings: {
      ...DEFAULT_SETTINGS,
      lastUsed: Date.now() - 1000,
    },
    styles: [
      {
        id: "integrity-test-style",
        name: "Integrity Test Style",
        code: "body { font-family: 'Test Font'; }",
        enabled: true,
        domains: ["integrity.test"],
        createdAt: Date.now() - 2000,
        updatedAt: Date.now() - 1000,
      },
    ],
    timestamp: Date.now() - 500,
    version: "1.0.0",
    exportVersion: "1.0.0",
  });

  describe("testDataIntegrity", () => {
    it("should pass integrity test for consistent data", async () => {
      const mockData = createMockExportData();

      // Mock the complete cycle
      mockStorageClient.exportAll
        .mockResolvedValueOnce(mockData) // Original data
        .mockResolvedValueOnce(mockData) // Temp backup
        .mockResolvedValueOnce(mockData); // Restored data

      vi.spyOn(ExportService, "exportData").mockResolvedValue({
        data: JSON.stringify(mockData),
        filename: "test-export.json",
        size: 1000,
        compressed: false,
        timestamp: Date.now(),
        styleCount: 1,
      });

      vi.spyOn(ExportService, "importData").mockResolvedValue({
        success: true,
        stylesImported: 1,
        stylesSkipped: 0,
        settingsUpdated: true,
        timestamp: Date.now(),
        warnings: [],
        importVersion: "1.0.0",
      });

      mockStorageClient.resetAll.mockResolvedValue(undefined);
      mockStorageClient.importAll.mockResolvedValue(undefined);

      // Import the ImportExportService to access testDataIntegrity
      const { ImportExportService } = await import("../../utils/export");
      const result = await ImportExportService.testDataIntegrity();

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.duration).toBeGreaterThan(0);
    });

    it("should fail integrity test for inconsistent data", async () => {
      const originalData = createMockExportData();
      const modifiedData = {
        ...originalData,
        styles: [], // Different data
      };

      // Mock the complete cycle with different data
      mockStorageClient.exportAll
        .mockResolvedValueOnce(originalData) // Original data
        .mockResolvedValueOnce(originalData) // Temp backup
        .mockResolvedValueOnce(modifiedData); // Restored data (different)

      vi.spyOn(ExportService, "exportData").mockResolvedValue({
        data: JSON.stringify(originalData),
        filename: "test-export.json",
        size: 1000,
        compressed: false,
        timestamp: Date.now(),
        styleCount: 1,
      });

      vi.spyOn(ExportService, "importData").mockResolvedValue({
        success: true,
        stylesImported: 1,
        stylesSkipped: 0,
        settingsUpdated: true,
        timestamp: Date.now(),
        warnings: [],
        importVersion: "1.0.0",
      });

      mockStorageClient.resetAll.mockResolvedValue(undefined);
      mockStorageClient.importAll.mockResolvedValue(undefined);

      const { ImportExportService } = await import("../../utils/export");
      const result = await ImportExportService.testDataIntegrity();

      expect(result.success).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes("restored data differs from original"),
        ),
      ).toBe(true);
    });

    it("should handle errors during integrity test", async () => {
      mockStorageClient.exportAll.mockRejectedValue(new Error("Storage error"));

      const { ImportExportService } = await import("../../utils/export");
      const result = await ImportExportService.testDataIntegrity();

      expect(result.success).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Integrity test error")),
      ).toBe(true);
    });
  });
});
