/**
 * Export utility for Eastyles extension.
 * Handles data serialization, compression, and file generation for user data exports.
 */

import { logger } from "../services/errors/logger";
import {
  ErrorSeverity,
  ErrorSource,
  ImportExportError,
} from "../services/errors/service";
import { storageClient } from "../services/storage/client";
import { ExportData } from "../services/storage/schema";

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
 * Import options for data restoration
 */
export interface ImportOptions {
  /** Whether to overwrite existing data (true) or merge (false) */
  overwrite?: boolean;
  /** Create backup before import */
  createBackup?: boolean;
  /** Custom backup filename prefix */
  backupPrefix?: string;
  /** Validate data integrity before import */
  validateData?: boolean;
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
 * Import result containing operation details
 */
export interface ImportResult {
  /** Whether import was successful */
  success: boolean;
  /** Number of styles imported */
  stylesImported: number;
  /** Number of styles skipped/failed */
  stylesSkipped: number;
  /** Whether settings were updated */
  settingsUpdated: boolean;
  /** Backup filename if created */
  backupFilename?: string;
  /** Import operation timestamp */
  timestamp: number;
  /** Any warnings encountered */
  warnings: string[];
  /** Detected import data version */
  importVersion?: string;
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
      if (typeof window !== "undefined" && "CompressionStream" in window) {
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
      if (typeof window !== "undefined" && "DecompressionStream" in window) {
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
        {
          filename: result.filename,
        },
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
   * Import data from JSON string or file content
   */
  static async importData(
    jsonData: string,
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    const startTime = Date.now();
    const result: ImportResult = {
      success: false,
      stylesImported: 0,
      stylesSkipped: 0,
      settingsUpdated: false,
      timestamp: startTime,
      warnings: [],
    };

    try {
      logger.info(ErrorSource.BACKGROUND, "Starting data import");

      // Parse JSON data
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(jsonData);
      } catch (parseError) {
        throw new ImportExportError(
          "Invalid JSON format in import data",
          ErrorSeverity.NOTIFY,
          { originalError: parseError },
        );
      }

      // Check if data is compressed
      let importData: ExportData;
      if (this.isCompressedFormat(parsedData)) {
        const compressedObj = parsedData as {
          compressed: boolean;
          data: string;
          originalSize: number;
          compressedSize: number;
        };

        try {
          const decompressedJson = await CompressionUtils.decompress(
            compressedObj.data,
          );
          const decompressedData = JSON.parse(decompressedJson);

          if (!this.isValidExportFormat(decompressedData)) {
            throw new ImportExportError(
              "Invalid export format in decompressed data",
              ErrorSeverity.NOTIFY,
            );
          }

          importData = decompressedData;
          logger.info(
            ErrorSource.BACKGROUND,
            "Successfully decompressed import data",
            {
              originalSize: compressedObj.originalSize,
              compressedSize: compressedObj.compressedSize,
            },
          );
        } catch (error) {
          throw new ImportExportError(
            "Failed to decompress import data",
            ErrorSeverity.NOTIFY,
            { originalError: error },
          );
        }
      } else {
        // Validate uncompressed data
        if (!this.isValidExportFormat(parsedData)) {
          throw new ImportExportError(
            "Invalid export data format",
            ErrorSeverity.NOTIFY,
          );
        }
        importData = parsedData;
      }

      // Validate data integrity if requested
      if (options.validateData !== false) {
        const validation = this.validateImportData(importData);
        if (!validation.isValid) {
          throw new ImportExportError(
            `Import data validation failed: ${validation.errors.join(", ")}`,
            ErrorSeverity.NOTIFY,
          );
        }
        result.warnings.push(...validation.warnings);
      }

      // Create backup if requested
      if (options.createBackup) {
        try {
          const backupResult = await this.exportData({
            filename: options.backupPrefix || "pre-import-backup",
            compress: true,
          });
          result.backupFilename = backupResult.filename;
          logger.info(ErrorSource.BACKGROUND, "Created backup before import", {
            filename: result.backupFilename,
          });
        } catch (backupError) {
          logger.warn(ErrorSource.BACKGROUND, "Failed to create backup", {
            error:
              backupError instanceof Error
                ? backupError.message
                : String(backupError),
          });
          result.warnings.push("Failed to create backup before import");
        }
      }

      // Perform import
      const { overwrite = true } = options;

      if (overwrite) {
        // Overwrite mode: replace all data
        await storageClient.importAll(importData, { overwrite: true });
        result.stylesImported = importData.styles.length;
        result.settingsUpdated = true;

        logger.info(
          ErrorSource.BACKGROUND,
          "Import completed (overwrite mode)",
          {
            stylesImported: result.stylesImported,
          },
        );
      } else {
        // Merge mode: combine with existing data
        const existingData = await storageClient.exportAll();
        const existingStyleIds = new Set(existingData.styles.map((s) => s.id));

        let newStyles = 0;
        let updatedStyles = 0;

        for (const style of importData.styles) {
          if (existingStyleIds.has(style.id)) {
            updatedStyles++;
          } else {
            newStyles++;
          }
        }

        await storageClient.importAll(importData, { overwrite: false });
        result.stylesImported = newStyles + updatedStyles;
        result.settingsUpdated = true;

        logger.info(ErrorSource.BACKGROUND, "Import completed (merge mode)", {
          newStyles,
          updatedStyles,
          totalImported: result.stylesImported,
        });
      }

      // Set import version if available
      result.importVersion = importData.exportVersion || importData.version;
      result.success = true;

      logger.info(
        ErrorSource.BACKGROUND,
        "Data import completed successfully",
        {
          stylesImported: result.stylesImported,
          settingsUpdated: result.settingsUpdated,
          duration: Date.now() - startTime,
          warnings: result.warnings.length,
        },
      );

      return result;
    } catch (error) {
      logger.error(ErrorSource.BACKGROUND, "Failed to import data", {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ImportExportError) {
        throw error;
      }

      throw new ImportExportError(
        "Failed to import data",
        ErrorSeverity.NOTIFY,
        {
          originalError: error,
          context: { options },
        },
      );
    }
  }

  /**
   * Import data from a File object (browser file input)
   */
  static async importFromFile(
    file: File,
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    try {
      logger.info(ErrorSource.BACKGROUND, "Starting file import", {
        filename: file.name,
        size: file.size,
        type: file.type,
      });

      // Validate file type
      if (
        file.type &&
        !file.type.includes("json") &&
        !file.name.endsWith(".json")
      ) {
        throw new ImportExportError(
          "Invalid file type. Please select a JSON file.",
          ErrorSeverity.NOTIFY,
        );
      }

      // Check file size (reasonable limit: 50MB)
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
      if (file.size > MAX_FILE_SIZE) {
        throw new ImportExportError(
          "File too large. Maximum size is 50MB.",
          ErrorSeverity.NOTIFY,
        );
      }

      // Read file content
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result && typeof e.target.result === "string") {
            resolve(e.target.result);
          } else {
            reject(new Error("Failed to read file content"));
          }
        };
        reader.onerror = () => reject(new Error("File reading failed"));
        reader.readAsText(file);
      });

      // Import the data
      return await this.importData(fileContent, options);
    } catch (error) {
      logger.error(ErrorSource.BACKGROUND, "Failed to import from file", {
        filename: file.name,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ImportExportError) {
        throw error;
      }

      throw new ImportExportError(
        "Failed to import from file",
        ErrorSeverity.NOTIFY,
        {
          originalError: error,
          context: { filename: file.name, size: file.size },
        },
      );
    }
  }

  /**
   * Validate import data for common issues
   */
  private static validateImportData(data: ExportData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const result = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[],
    };

    try {
      // Check for duplicate style IDs
      const styleIds = new Set<string>();
      const duplicateIds = new Set<string>();

      for (const style of data.styles) {
        if (styleIds.has(style.id)) {
          duplicateIds.add(style.id);
          result.warnings.push(`Duplicate style ID found: ${style.id}`);
        } else {
          styleIds.add(style.id);
        }
      }

      // Check for very old export versions
      const exportVersion = data.exportVersion || "0.0.0";
      const [major] = exportVersion.split(".").map(Number);

      if (major < 1) {
        result.warnings.push(
          `Importing from older export version (${exportVersion}). Some features may not be preserved.`,
        );
      }

      // Check for styles with empty names or code
      let emptyStyles = 0;
      for (const style of data.styles) {
        if (!style.name.trim() || !style.code.trim()) {
          emptyStyles++;
        }
      }

      if (emptyStyles > 0) {
        result.warnings.push(`${emptyStyles} styles have empty names or code`);
      }

      // Check for very large styles (potential performance issues)
      let largeStyles = 0;
      const LARGE_STYLE_THRESHOLD = 100 * 1024; // 100KB

      for (const style of data.styles) {
        if (style.code.length > LARGE_STYLE_THRESHOLD) {
          largeStyles++;
        }
      }

      if (largeStyles > 0) {
        result.warnings.push(
          `${largeStyles} styles are very large (>100KB) and may impact performance`,
        );
      }

      // Check timestamp validity
      const now = Date.now();
      if (data.timestamp > now) {
        result.warnings.push("Export timestamp is in the future");
      }

      // Check for very old exports (more than 1 year)
      const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
      if (data.timestamp < oneYearAgo) {
        result.warnings.push("Import data is more than 1 year old");
      }
    } catch (error) {
      result.errors.push(
        `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      );
      result.isValid = false;
    }

    return result;
  }

  /**
   * Get import/export statistics
   */
  static async getImportExportStats(): Promise<{
    totalStyles: number;
    estimatedExportSize: number;
    canImport: boolean;
    canExport: boolean;
    supportedFormats: string[];
    compressionSupported: boolean;
  }> {
    try {
      const exportData = await storageClient.exportAll();
      const jsonSize = JSON.stringify(exportData).length;

      return {
        totalStyles: exportData.styles.length,
        estimatedExportSize: jsonSize,
        canImport: true,
        canExport: true,
        supportedFormats: ["json"],
        compressionSupported:
          typeof window !== "undefined" && "CompressionStream" in window,
      };
    } catch (error) {
      logger.error(
        ErrorSource.BACKGROUND,
        "Failed to get import/export statistics",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );

      return {
        totalStyles: 0,
        estimatedExportSize: 0,
        canImport: false,
        canExport: false,
        supportedFormats: [],
        compressionSupported: false,
      };
    }
  }

  /**
   * Get export statistics (backward compatibility)
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

/**
 * Complete import/export service combining export and import functionality
 */
class ImportExportService extends ExportService {
  /**
   * Perform a complete backup and restore cycle for testing data integrity
   */
  static async testDataIntegrity(): Promise<{
    success: boolean;
    errors: string[];
    warnings: string[];
    duration: number;
  }> {
    const startTime = Date.now();
    const result = {
      success: false,
      errors: [] as string[],
      warnings: [] as string[],
      duration: 0,
    };

    try {
      // Get original data
      const originalData = await storageClient.exportAll();
      const originalHash = this.hashData(originalData);

      // Export data
      const exportResult = await this.exportData({ compress: true });

      // Create a temporary backup of current data
      const tempBackup = await storageClient.exportAll();

      // Clear all data
      await storageClient.resetAll();

      // Import the exported data back
      const importResult = await this.importData(exportResult.data, {
        overwrite: true,
        validateData: true,
      });

      // Get restored data
      const restoredData = await storageClient.exportAll();
      const restoredHash = this.hashData(restoredData);

      // Compare data integrity
      if (originalHash === restoredHash) {
        result.success = true;
        logger.info(ErrorSource.BACKGROUND, "Data integrity test passed");
      } else {
        result.errors.push(
          "Data integrity test failed: restored data differs from original",
        );
        logger.error(ErrorSource.BACKGROUND, "Data integrity test failed", {
          originalHash,
          restoredHash,
        });
      }

      // Restore original data
      await storageClient.importAll(tempBackup, { overwrite: true });

      // Add any warnings from import
      result.warnings.push(...importResult.warnings);
    } catch (error) {
      result.errors.push(
        `Integrity test error: ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.error(ErrorSource.BACKGROUND, "Data integrity test error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Create a simple hash of export data for integrity checking
   */
  private static hashData(data: ExportData): string {
    // Create a deterministic string representation for hashing
    const hashableData = {
      settingsCount: Object.keys(data.settings).length,
      stylesCount: data.styles.length,
      totalCodeLength: data.styles.reduce(
        (sum, style) => sum + style.code.length,
        0,
      ),
      totalDomains: data.styles.reduce(
        (sum, style) => sum + style.domains.length,
        0,
      ),
      enabledStyles: data.styles.filter((s) => s.enabled).length,
    };

    return btoa(JSON.stringify(hashableData));
  }
}

// Export utilities for external use
export { CompressionUtils, ImportExportService };
export default ExportService;
