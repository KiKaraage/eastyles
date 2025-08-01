/**
 * Export utility for Eastyles extension.
 * Handles data serialization, compression, and file generation for user data exports.
 */

import { ExportData } from "../services/storage/schema";
import { storageClient } from "../services/storage/client";
import { logger } from "../services/errors/logger";
import { ErrorSource, ErrorSeverity } from "../services/errors/service";
import { ImportExportError } from "../services/errors/service";

/**
 * Export format options
 */
export interface ExportOptions {
  /** Whether to compress the exported data */
  compress?: boolean;
  /** Include debug information in export */
  includeDebugInfo?: boolean;
  /** Custom filename (without extension) */
  filename?: string;
  /** Pretty print JSON output */
  prettyPrint?: boolean;
}

/**
 * Export result containing the data and metadata
 */
export interface ExportResult {
  /** The serialized data */
  data: string;
  /** Generated filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** Whether data was compressed */
  compressed: boolean;
  /** Export timestamp */
  timestamp: number;
  /** Number of styles exported */
  styleCount: number;
}

/**
 * Compression utilities using native browser APIs
 */
class CompressionUtils {
  /**
   * Compress a string using gzip compression
   */
  static async compress(data: string): Promise<string> {
    try {
      // Convert string to Uint8Array
      const encoder = new TextEncoder();
      const inputData = encoder.encode(data);

      // Use CompressionStream API if available (modern browsers)
      if ("CompressionStream" in window) {
        const compressionStream = new CompressionStream("gzip");
        const writer = compressionStream.writable.getWriter();
        const reader = compressionStream.readable.getReader();

        // Write data to compression stream
        await writer.write(inputData);
        await writer.close();

        // Read compressed data
        const chunks: Uint8Array[] = [];
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            chunks.push(value);
          }
        }

        // Combine chunks and convert to base64
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        const combined = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        // Convert to base64 for JSON storage
        return btoa(String.fromCharCode(...combined));
      } else {
        // Fallback: just return original data with warning
        logger.warn(
          ErrorSource.BACKGROUND,
          "Compression not supported in this browser, returning uncompressed data",
        );
        return data;
      }
    } catch (error) {
      logger.error(ErrorSource.BACKGROUND, "Failed to compress export data", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Return original data if compression fails
      return data;
    }
  }

  /**
   * Decompress a base64-encoded gzip string
   */
  static async decompress(compressedData: string): Promise<string> {
    try {
      if ("DecompressionStream" in window) {
        // Convert base64 back to Uint8Array
        const binaryString = atob(compressedData);
        const inputData = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          inputData[i] = binaryString.charCodeAt(i);
        }

        const decompressionStream = new DecompressionStream("gzip");
        const writer = decompressionStream.writable.getWriter();
        const reader = decompressionStream.readable.getReader();

        // Write compressed data to decompression stream
        await writer.write(inputData);
        await writer.close();

        // Read decompressed data
        const chunks: Uint8Array[] = [];
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            chunks.push(value);
          }
        }

        // Combine chunks and decode to string
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        const combined = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        const decoder = new TextDecoder();
        return decoder.decode(combined);
      } else {
        // Fallback: assume data is not compressed
        return compressedData;
      }
    } catch (error) {
      logger.error(ErrorSource.BACKGROUND, "Failed to decompress import data", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ImportExportError(
        "Failed to decompress import data",
        ErrorSeverity.NOTIFY,
        {
          originalError: error,
        },
      );
    }
  }
}

/**
 * Export service for creating data backups
 */
export class ExportService {
  private static readonly DEFAULT_FILENAME = "eastyles-backup";
  private static readonly CURRENT_EXPORT_VERSION = "1.0.0";
  private static readonly COMPRESSION_THRESHOLD = 50 * 1024; // 50KB

  /**
   * Export all user data to JSON format
   */
  static async exportData(options: ExportOptions = {}): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      logger.info(ErrorSource.BACKGROUND, "Starting data export");

      // Get all data from storage
      const exportData = await storageClient.exportAll();

      // Add export metadata
      const enhancedExportData: ExportData & {
        exportVersion: string;
        exportedAt: number;
        debugInfo?: unknown;
      } = {
        ...exportData,
        exportVersion: this.CURRENT_EXPORT_VERSION,
        exportedAt: startTime,
      };

      // Add debug information if requested
      if (options.includeDebugInfo) {
        enhancedExportData.debugInfo = {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          exportDuration: Date.now() - startTime,
        };
      }

      // Serialize to JSON
      const jsonData = JSON.stringify(
        enhancedExportData,
        null,
        options.prettyPrint ? 2 : undefined,
      );

      // Determine if compression should be used
      const shouldCompress =
        options.compress !== false &&
        jsonData.length > this.COMPRESSION_THRESHOLD;

      // Apply compression if needed
      let finalData = jsonData;
      let compressed = false;

      if (shouldCompress) {
        try {
          const compressedData = await CompressionUtils.compress(jsonData);

          // Only use compressed version if it's actually smaller
          if (compressedData.length < jsonData.length) {
            finalData = JSON.stringify({
              compressed: true,
              data: compressedData,
              originalSize: jsonData.length,
              compressedSize: compressedData.length,
            });
            compressed = true;

            logger.info(
              ErrorSource.BACKGROUND,
              "Data compressed successfully",
              {
                originalSize: jsonData.length,
                compressedSize: compressedData.length,
                compressionRatio:
                  (
                    ((jsonData.length - compressedData.length) /
                      jsonData.length) *
                    100
                  ).toFixed(1) + "%",
              },
            );
          }
        } catch (error) {
          logger.warn(
            ErrorSource.BACKGROUND,
            "Compression failed, using uncompressed data",
            { error: error instanceof Error ? error.message : String(error) },
          );
        }
      }

      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const filename = `${options.filename || this.DEFAULT_FILENAME}-${timestamp}.json`;

      const result: ExportResult = {
        data: finalData,
        filename,
        size: finalData.length,
        compressed,
        timestamp: startTime,
        styleCount: exportData.styles.length,
      };

      logger.info(
        ErrorSource.BACKGROUND,
        "Data export completed successfully",
        {
          filename: result.filename,
          size: result.size,
          styleCount: result.styleCount,
          compressed: result.compressed,
          duration: Date.now() - startTime,
        },
      );

      return result;
    } catch (error) {
      logger.error(ErrorSource.BACKGROUND, "Failed to export data", {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ImportExportError(
        "Failed to export data",
        ErrorSeverity.NOTIFY,
        {
          originalError: error,
          context: { options },
        },
      );
    }
  }

  /**
   * Create and download export file in the browser
   */
  static async downloadExport(options: ExportOptions = {}): Promise<void> {
    try {
      const result = await this.exportData(options);

      // Create blob and download
      const blob = new Blob([result.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // Create temporary download link
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.style.display = "none";

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up object URL
      URL.revokeObjectURL(url);

      logger.info(
        ErrorSource.BACKGROUND,
        "Export file downloaded successfully",
        { filename: result.filename },
      );
    } catch (error) {
      logger.error(ErrorSource.BACKGROUND, "Failed to download export file", {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ImportExportError(
        "Failed to download export file",
        ErrorSeverity.NOTIFY,
        {
          originalError: error,
        },
      );
    }
  }

  /**
   * Validate export data format
   */
  static isValidExportFormat(data: unknown): data is ExportData {
    if (!data || typeof data !== "object") {
      return false;
    }

    const obj = data as Record<string, unknown>;

    return (
      typeof obj.settings === "object" &&
      Array.isArray(obj.styles) &&
      typeof obj.timestamp === "number" &&
      typeof obj.version === "string"
    );
  }

  /**
   * Check if data is compressed
   */
  static isCompressedFormat(data: unknown): boolean {
    if (!data || typeof data !== "object") {
      return false;
    }

    const obj = data as Record<string, unknown>;
    return obj.compressed === true && typeof obj.data === "string";
  }

  /**
   * Get export statistics
   */
  static async getExportStats(): Promise<{
    totalStyles: number;
    estimatedSize: number;
    lastExport?: number;
  }> {
    try {
      const exportData = await storageClient.exportAll();
      const jsonSize = JSON.stringify(exportData).length;

      return {
        totalStyles: exportData.styles.length,
        estimatedSize: jsonSize,
        lastExport: exportData.timestamp,
      };
    } catch (error) {
      logger.error(ErrorSource.BACKGROUND, "Failed to get export statistics", {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        totalStyles: 0,
        estimatedSize: 0,
      };
    }
  }
}

// Export utilities for external use
export { CompressionUtils };
export default ExportService;
