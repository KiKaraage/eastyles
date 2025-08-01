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
